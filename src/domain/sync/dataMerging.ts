import { TipoPlantillaWA } from '../../types';
import { UMBRAL_ID_SIN_PRIMER_CONTACTO, asegurarIdsUnicosContactos, esComentarioDescartadoONoCaba, esSinDniCabaYaRespondidoOCerrado, extraerNumeroIdContacto, procesarContacto, repararContactoDesfasado, tieneNuevaInformacionEnColumnaG, yaAdhirioAntes } from '../contacts/contactStatus';
import {
  ControlEnvioRegistro,
  EstadoFlujo,
  RawContactRow,
} from '../../types';
import { normalizarTelefonoWA } from '../contacts/phoneUtils';
import {
  esContactoSinPrimerContacto,
  inferirEstadoFlujo,
  obtenerEtiquetaEstadoFlujo,
} from '../contacts/contactStatus';
import { analizarFranjaHoraria, extraerFechasMencionadas, obtenerPartesFechaHoraBA, sumarDiasAFechaBA } from '../calendar/availability';
import { esCeldaSinNombre } from '../contacts/nameCorrection';
import { extraerCalleOCruce, sincronizarBarrioConDireccionComentario } from '../geo/cabaLocations';
import { INITIAL_RAW_CONTACTS } from '../../data/estatusPopurriData';

export function migrarContactosDesde167SinPrimerContacto(
  rows: RawContactRow[],
  controlEnviadosKeys: Set<string> = new Set()
): RawContactRow[] {
  // Construir índices de personas que ya adhirieron previamente (por teléfono normalizado o nombre completo)
  // para garantizar que si una persona ya adhirió antes, nunca quede como "Prefiere Punto" ni en cola de mensajes.
  const adheridosPorTel = new Set<string>();
  const adheridosPorNombre = new Set<string>();
  for (const r of rows) {
    if (yaAdhirioAntes(r)) {
      const t = normalizarTelefonoWA(r.telRaw);
      if (t) adheridosPorTel.add(t);
      const nom = (r.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (nom.length >= 5 && !esCeldaSinNombre(r.nombre)) adheridosPorNombre.add(nom);
    }
  }

  const IDS_ENVIADOS_FALSO_TIMEOUT = new Set([170, 186, 189]);
  const IDS_CERRADOS_ANTES_DE_ENVIAR = new Set([190, 191]);

  const migrados: RawContactRow[] = rows.map((raw, idx): RawContactRow => {
    const reparado = sincronizarBarrioConDireccionComentario(repararContactoDesfasado(raw, idx));
    const numId = extraerNumeroIdContacto(reparado.id);
    const telKey = normalizarTelefonoWA(reparado.telRaw);
    const nomKey = (reparado.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const comRaw = (reparado.comentario || '').trim();

    // 0a. Corregir contactos que SÍ recibieron el 1er mensaje automático pero quedaron anotados con el falso error
    // "[Intento auto fallido ... Tiempo de espera agotado al abrir el chat]"
    if (
      /\[Intento auto fallido[^\]]*Tiempo de espera agotado al abrir el chat\]/i.test(comRaw) ||
      (IDS_ENVIADOS_FALSO_TIMEOUT.has(numId) && /Intento auto fallido/i.test(comRaw))
    ) {
      const comCorregido = comRaw
        .replace(
          /\[Intento auto fallido[^\]]*Tiempo de espera agotado al abrir el chat\]/gi,
          ''
        )
        .replace(/\[1er msj auto enviado[^\]]*\]/gi, '')
        .trim();
      return {
        ...reparado,
        rsp: 'No',
        adhirio: 'Pendiente',
        primerContactoEnviado: true,
        comentario: comCorregido,
        estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP'),
      };
    }

    // 0b. Corregir contactos donde el navegador se cerró antes de enviar ("Target page, context or browser has been closed")
    // pero habían quedado marcados como primerContactoEnviado: true (#190, #191) cuando no tienen estado explícito de Sheets
    if (
      /\[Intento auto fallido[^\]]*(?:Target page, context or browser has been closed|browser has been closed)[^\]]*\]/i.test(
        comRaw
      ) ||
      (IDS_CERRADOS_ANTES_DE_ENVIAR.has(numId) &&
        !reparado.estadoFlujo &&
        (!comRaw || /Intento auto fallido/i.test(comRaw)))
    ) {
      const comLimpio = comRaw.replace(/\[Intento auto fallido[^\]]*\]/gi, '').trim();
      const sinNom = esCeldaSinNombre(reparado.nombre);
      const estadoInicial: EstadoFlujo = sinNom
        ? 'FALTA_NOMBRE_Y_APELLIDO'
        : 'SIN_CONTACTAR_1ER_MSJ';
      return {
        ...reparado,
        rsp: 'Nuevo',
        adhirio: 'Pendiente',
        primerContactoEnviado: false,
        intentos: 0,
        ultimoContacto: '',
        comentario: comLimpio,
        estadoFlujo: estadoInicial,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoInicial),
      };
    }

    const yaEnviadoEnControl =
      controlEnviadosKeys.has(`id:${reparado.id}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`tel:${telKey}`));
    const esBajaInexistenteEnControl =
      controlEnviadosKeys.has(`baja_id:${reparado.id}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`baja_tel:${telKey}`)) ||
      /no existe en whatsapp|n[uú]mero inexistente|n[uú]mero inv[aá]lido/i.test(comRaw);

    if (esBajaInexistenteEnControl) {
      return {
        ...reparado,
        rsp: 'No',
        adhirio: 'No',
        primerContactoEnviado: true,
        referidosCabaYaEnviado: true,
        comentario: comRaw || 'El número no existe en WhatsApp.',
        estadoFlujo: 'DESCARTADO_O_BAJA',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
      };
    }

    // Si la fila ya tiene un estadoFlujo explícito (por ejemplo, sincronizado de la Columna H de Google Sheets
    // o asignado en la App), respetarlo 1:1 normalizando únicamente alias heredados,
    // PERO sin permitir jamás que un contacto con mensaje enviado en control regrese a SIN_CONTACTAR_1ER_MSJ.
    if (reparado.estadoFlujo !== undefined) {
      let estEfectivo: EstadoFlujo = reparado.estadoFlujo;
      if (estEfectivo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP') {
        estEfectivo = '1ER_MSJ_ENVIADO_SIN_RSP';
      } else if (estEfectivo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO') {
        estEfectivo = 'YA_ADHIRIO_FIRMA_OK';
      }
      const esSinPrimerMsjOriginal =
        estEfectivo === 'SIN_CONTACTAR_1ER_MSJ' ||
        estEfectivo === 'FALTA_NOMBRE_Y_APELLIDO';
      if (
        esSinPrimerMsjOriginal &&
        (yaEnviadoEnControl ||
          reparado.primerContactoEnviado === true ||
          Boolean(reparado.ultimoMensajeCorteEnviadoAt))
      ) {
        estEfectivo =
          reparado.rsp === 'Sí' ? 'RESPONDIO_FALTA_DNI_O_ZONA' : '1ER_MSJ_ENVIADO_SIN_RSP';
      }
      const esSinPrimerMsj =
        estEfectivo === 'SIN_CONTACTAR_1ER_MSJ' ||
        estEfectivo === 'FALTA_NOMBRE_Y_APELLIDO';
      return {
        ...reparado,
        rsp: !esSinPrimerMsj && reparado.rsp === 'Nuevo' ? 'No' : reparado.rsp,
        primerContactoEnviado: !esSinPrimerMsj,
        estadoFlujo: estEfectivo,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estEfectivo),
      };
    }

    // 1. Verificar si esta persona ya adhirió antes (cuando no tiene estadoFlujo explícito)
    if (
      yaAdhirioAntes(reparado) ||
      (Boolean(telKey) && adheridosPorTel.has(telKey)) ||
      (nomKey.length >= 5 && adheridosPorNombre.has(nomKey))
    ) {
      const comLow = (reparado.comentario || '').toLowerCase();
      const esRetiro = comLow.includes('buscar fichas') || /x\d/i.test(comLow);
      const estadoAdherido: EstadoFlujo = esRetiro
        ? 'PENDIENTE_RETIRO_FICHAS'
        : 'YA_ADHIRIO_FIRMA_OK';
      return {
        ...reparado,
        adhirio: 'Sí',
        rsp: 'Sí',
        primerContactoEnviado: true,
        estadoFlujo: estadoAdherido,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoAdherido),
      };
    }

    // 2. Verificar si es un caso "Sin DNI en CABA" + "No tiene domicilio en CABA" + Adhirió="No" ya respondido (< #167 o enviado)
    if (esSinDniCabaYaRespondidoOCerrado(reparado)) {
      return {
        ...reparado,
        adhirio: 'No',
        primerContactoEnviado: true,
        referidosCabaYaEnviado: true,
        estadoFlujo: 'DESCARTADO_O_BAJA',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
      };
    }

    if (yaEnviadoEnControl) {
      return {
        ...reparado,
        primerContactoEnviado: true,
        rsp: reparado.rsp === 'Nuevo' ? 'No' : reparado.rsp,
        estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP'),
      };
    }

    // Reparar contactos históricos (#1..#166) que por error quedaron con SIN_CONTACTAR_1ER_MSJ teniendo RSP = Sí o No
    if (
      numId > 0 &&
      numId < UMBRAL_ID_SIN_PRIMER_CONTACTO &&
      reparado.rsp !== 'Nuevo' &&
      (reparado.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
        reparado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO')
    ) {
      const estadoReparado: EstadoFlujo =
        reparado.rsp === 'Sí' ? 'RESPONDIO_FALTA_DNI_O_ZONA' : '1ER_MSJ_ENVIADO_SIN_RSP';
      return {
        ...reparado,
        primerContactoEnviado: true,
        estadoFlujo: estadoReparado,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoReparado),
      };
    }

    // Si el contacto ya fue modificado en la app o ya tiene un estado explícito posterior al 1er contacto,
    // jamás resetearlo a "SIN_CONTACTAR_1ER_MSJ" al recargar la página o actualizar la app
    const tieneEstadoPosteriorExplicito =
      Boolean(reparado.actualizadoEnAppAt) ||
      reparado.primerContactoEnviado === true ||
      Boolean(reparado.ultimoMensajeCorteEnviadoAt) ||
      (Boolean(reparado.estadoFlujo) &&
        reparado.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
        reparado.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO');

    if (tieneEstadoPosteriorExplicito) {
      const estadoEfectivo =
        reparado.estadoFlujo ||
        (reparado.rsp === 'Sí' ? 'RESPONDIO_FALTA_DNI_O_ZONA' : '1ER_MSJ_ENVIADO_SIN_RSP');
      const rspCorregido =
        estadoEfectivo === '1ER_MSJ_ENVIADO_SIN_RSP' &&
        /^\[1er msj auto enviado[^\]]*\]$/i.test(comRaw)
          ? 'No'
          : reparado.rsp;
      return {
        ...reparado,
        rsp: rspCorregido,
        primerContactoEnviado:
          reparado.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
          reparado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
            ? false
            : true,
        estadoFlujo: estadoEfectivo,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoEfectivo),
      };
    }

    if (numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO) {
      const rspLow = (reparado.rsp || '').toLowerCase();
      const adhLow = (reparado.adhirio || '').toLowerCase();
      const tieneInfoG = tieneNuevaInformacionEnColumnaG(reparado.comentario);
      const esDesc = esComentarioDescartadoONoCaba(reparado.comentario, reparado.estadoFlujo);
      if (
        rspLow !== 'sí' &&
        rspLow !== 'si' &&
        adhLow !== 'sí' &&
        adhLow !== 'si' &&
        !tieneInfoG &&
        !esDesc
      ) {
        const sinNom = esCeldaSinNombre(reparado.nombre);
        const estadoInicial: EstadoFlujo = sinNom
          ? 'FALTA_NOMBRE_Y_APELLIDO'
          : 'SIN_CONTACTAR_1ER_MSJ';
        return {
          ...reparado,
          rsp: 'Nuevo',
          adhirio: 'Pendiente',
          primerContactoEnviado: false,
          intentos: 0,
          ultimoContacto: '',
          estadoFlujo: estadoInicial,
          estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoInicial),
        };
      }
    }

    return reparado;
  });

  // 3. Sólo en migración legacy (cuando una base antigua tenía #1..#196 pero ningún contacto >= #197),
  // incorporar las filas #197+. Si la lista ya tiene contactos >= #197 (o viene de Google Sheets),
  // jamás re-inyectar contactos eliminados desde INITIAL_RAW_CONTACTS.
  const idsPresentes = new Set(migrados.map((r) => extraerNumeroIdContacto(r.id)));
  const maxIdPresente = migrados.reduce((max, r) => Math.max(max, extraerNumeroIdContacto(r.id)), 0);
  if (migrados.length >= 150 && maxIdPresente > 0 && maxIdPresente < 197) {
    const telsPresentes = new Set(
      migrados.map((r) => normalizarTelefonoWA(r.telRaw)).filter(Boolean)
    );
    for (const candidatoNuevo of INITIAL_RAW_CONTACTS) {
      const numIdCand = extraerNumeroIdContacto(candidatoNuevo.id);
      if (numIdCand < 197) continue;
      const telCand = normalizarTelefonoWA(candidatoNuevo.telRaw);
      if (!idsPresentes.has(numIdCand) && (!telCand || !telsPresentes.has(telCand))) {
        migrados.push({ ...candidatoNuevo });
        idsPresentes.add(numIdCand);
        if (telCand) telsPresentes.add(telCand);
      }
    }
  }

  return asegurarIdsUnicosContactos(migrados);
}

/**
 * Adaptador inteligente local para el botón "Adaptar IA" y "Acortar aún más".
 * Permite refinar o acortar el mensaje actual integrando la respuesta/instrucción del vecino
 * de forma inmediata y natural (voz de César, concisa, sin clichés robóticos),
 * funcionando tanto de respaldo del endpoint Gemini como de motor determinístico.
 */

export function fusionarContactosDesdeSheetsConControl(
  nuevosDesdeSheets: RawContactRow[],
  previosEnApp: RawContactRow[],
  controlEnviadosKeys: Set<string> = new Set(),
  priorizarSheets: boolean = false,
  ultimosVistosEnSheetPorId?: Map<string, RawContactRow>
): { contactosFusionados: RawContactRow[]; nuevosParaPrimerContactoCount: number } {
  const mapaPreviosPorId = new Map<string, RawContactRow>();
  const mapaPreviosPorTel = new Map<string, RawContactRow>();
  const adheridosPorTel = new Set<string>();
  const adheridosPorNombre = new Set<string>();

  for (const prev of previosEnApp) {
    const idTrim = String(prev.id).trim();
    mapaPreviosPorId.set(idTrim, prev);
    const idDigits = idTrim.replace(/\D+/g, '');
    if (idDigits) {
      mapaPreviosPorId.set(idDigits, prev);
      mapaPreviosPorId.set(`#${idDigits}`, prev);
    }
    const t = normalizarTelefonoWA(prev.telRaw);
    if (t) mapaPreviosPorTel.set(t, prev);
    if (yaAdhirioAntes(prev)) {
      if (t) adheridosPorTel.add(t);
      const nom = (prev.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (nom.length >= 5 && !esCeldaSinNombre(prev.nombre)) adheridosPorNombre.add(nom);
    }
  }
  for (const nuevo of nuevosDesdeSheets) {
    if (yaAdhirioAntes(nuevo)) {
      const t = normalizarTelefonoWA(nuevo.telRaw);
      if (t) adheridosPorTel.add(t);
      const nom = (nuevo.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (nom.length >= 5 && !esCeldaSinNombre(nuevo.nombre)) adheridosPorNombre.add(nom);
    }
  }

  let nuevosParaPrimerContactoCount = 0;
  const idsVistosEnSheet = new Set<string>();
  const telsVistosEnSheet = new Set<string>();

  const contactosFusionados = nuevosDesdeSheets.map((item, idx) => {
    const row = sincronizarBarrioConDireccionComentario(repararContactoDesfasado(item, idx));
    const idKey = String(row.id).trim();
    const idDigits = idKey.replace(/\D+/g, '');
    const telKey = normalizarTelefonoWA(row.telRaw);
    const nomKey = (row.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (idKey) idsVistosEnSheet.add(idKey);
    if (idDigits) {
      idsVistosEnSheet.add(idDigits);
      idsVistosEnSheet.add(`#${idDigits}`);
    }
    if (telKey) telsVistosEnSheet.add(telKey);

    const prevPorId =
      mapaPreviosPorId.get(idKey) ||
      (idDigits
        ? mapaPreviosPorId.get(idDigits) || mapaPreviosPorId.get(`#${idDigits}`)
        : undefined);
    const prevPorTel = telKey ? mapaPreviosPorTel.get(telKey) : undefined;
    const prevIdTel = prevPorId ? normalizarTelefonoWA(prevPorId.telRaw) : '';
    const previo =
      prevPorId && (!telKey || !prevIdTel || prevIdTel === telKey)
        ? prevPorId
        : prevPorTel;
    const tieneSnapshotPrevioSheet = Boolean(
      ultimosVistosEnSheetPorId && ultimosVistosEnSheetPorId.size > 0
    );
    const fotoPreviaSheet = tieneSnapshotPrevioSheet
      ? ultimosVistosEnSheetPorId!.get(idKey) ||
        (idDigits
          ? ultimosVistosEnSheetPorId!.get(idDigits) ||
            ultimosVistosEnSheetPorId!.get(`#${idDigits}`)
          : undefined)
      : undefined;
    const baseComparacionSheet = fotoPreviaSheet || (!ultimosVistosEnSheetPorId ? previo : undefined);

    // Detectar si en Google Sheets se modificó el comentario, días, horario, dirección, estado o adhesión respecto de la última foto de Sheets
    const comentarioSheet = (row.comentario || '').trim();
    const comentarioBase = (baseComparacionSheet?.comentario || '').trim();
    const diasSheet = (row.diasEncuentro || '').trim();
    const diasBase = (baseComparacionSheet?.diasEncuentro || '').trim();
    const horarioSheet = (row.horarioEncuentro || '').trim();
    const horarioBase = (baseComparacionSheet?.horarioEncuentro || '').trim();
    const calleSheet = (row.calleOCruce || '').trim();
    const calleBase = (baseComparacionSheet?.calleOCruce || '').trim();
    const cambioRespectoABase =
      Boolean(baseComparacionSheet) &&
      (comentarioSheet !== comentarioBase ||
        (row.diasEncuentro !== undefined && diasSheet !== diasBase) ||
        (row.horarioEncuentro !== undefined && horarioSheet !== horarioBase) ||
        (row.calleOCruce !== undefined && calleSheet !== calleBase) ||
        row.adhirio !== baseComparacionSheet?.adhirio ||
        row.rsp !== baseComparacionSheet?.rsp ||
        (row.estadoFlujo !== undefined && row.estadoFlujo !== baseComparacionSheet?.estadoFlujo) ||
        (row.estadoFlujo === undefined &&
          (baseComparacionSheet?.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
            baseComparacionSheet?.estadoFlujo === 'DESCARTADO_O_BAJA') &&
          !esComentarioDescartadoONoCaba(comentarioSheet)));

    // Ignorar como "cambio externo" si la fila leída de Sheets simplemente alcanzó el mismo estado que ya teníamos en `previo`
    const coincideConPrevioEnApp =
      Boolean(previo) &&
      comentarioSheet === (previo?.comentario || '').trim() &&
      (row.diasEncuentro === undefined || diasSheet === (previo?.diasEncuentro || '').trim()) &&
      (row.horarioEncuentro === undefined || horarioSheet === (previo?.horarioEncuentro || '').trim()) &&
      (row.calleOCruce === undefined || calleSheet === (previo?.calleOCruce || '').trim()) &&
      row.adhirio === previo?.adhirio &&
      row.estadoFlujo === previo?.estadoFlujo;

    // Nunca considerar como "cambio externo en Sheets" una fila de TSV cacheada que está atrasada
    // respecto a una cita ya confirmada o edición reciente en la App durante sincronizaciones automáticas.
    const previoConfirmadoEnApp = Boolean(
      previo &&
        (previo.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
          previo.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
          /\[Confirmad|Visita confirmada/i.test(previo.comentario || ''))
    );
    const sheetAtrasadoRespectoAConfirmacionApp =
      previoConfirmadoEnApp &&
      row.estadoFlujo !== 'ENCUENTRO_CONFIRMADO' &&
      row.estadoFlujo !== 'RECORDATORIO_DIA_ENVIADO' &&
      row.estadoFlujo !== 'YA_ADHIRIO_FIRMA_OK' &&
      row.estadoFlujo !== 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO' &&
      row.adhirio !== 'Sí' &&
      !/\[Confirmad|Visita confirmada/i.test(comentarioSheet);

    const editadoRecientementeEnApp = Boolean(
      previo?.actualizadoEnAppAt &&
        Date.now() - Date.parse(previo.actualizadoEnAppAt) < 600000
    );

    const cambioEnSheetExplicito =
      !editadoRecientementeEnApp &&
      !sheetAtrasadoRespectoAConfirmacionApp &&
      (ultimosVistosEnSheetPorId
        ? Boolean(fotoPreviaSheet) && cambioRespectoABase && !coincideConPrevioEnApp
        : priorizarSheets && cambioRespectoABase && !coincideConPrevioEnApp);

    const enviadoEnControl =
      controlEnviadosKeys.has(`id:${idKey}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`tel:${telKey}`));

    const esBajaInexistenteEnControlOApp =
      controlEnviadosKeys.has(`baja_id:${idKey}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`baja_tel:${telKey}`)) ||
      (!cambioEnSheetExplicito &&
        (previo?.estadoFlujo === 'DESCARTADO_O_BAJA' ||
          /no existe en whatsapp|n[uú]mero inexistente|n[uú]mero inv[aá]lido/i.test(
            previo?.comentario || ''
          )));

    const tieneCitaConfirmadaEnApp =
      !cambioEnSheetExplicito &&
      Boolean(
        previo &&
          (previo.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
            previo.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
            /\[Confirmad|Visita confirmada/i.test(previo.comentario || ''))
      );

    const yaAdhirioEnApp =
      !cambioEnSheetExplicito &&
      Boolean(
        previo &&
          (previo.adhirio === 'Sí' ||
            previo.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
            previo.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO' ||
            previo.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS')
      );

    // Si el contacto fue editado explícitamente en la app (`actualizadoEnAppAt`) o tiene un estado más avanzado confirmado en SQLite
    // y NO fue modificado explícitamente en Google Sheets entre lecturas, priorizar la app/SQLite.
    const editadoEnApp =
      !cambioEnSheetExplicito &&
      Boolean(
        previo?.actualizadoEnAppAt ||
          tieneCitaConfirmadaEnApp ||
          yaAdhirioEnApp ||
          esBajaInexistenteEnControlOApp
      );

    const fueEnviadoEnApp =
      editadoEnApp ||
      enviadoEnControl ||
      Boolean(previo?.primerContactoEnviado === true) ||
      Boolean(previo?.ultimoMensajeCorteEnviadoAt);

    const numId = extraerNumeroIdContacto(row.id);
    const esPersonaNuevaEnSheet = !previo && previosEnApp.length > 0;
    const comentarioEfectivo = cambioEnSheetExplicito
      ? comentarioSheet
      : editadoEnApp && previo?.comentario
        ? previo.comentario
        : tieneNuevaInformacionEnColumnaG(row.comentario)
          ? row.comentario
          : tieneNuevaInformacionEnColumnaG(previo?.comentario || '')
            ? previo!.comentario
            : row.comentario || previo?.comentario || '';
    const referidosCabaYaEnviado =
      cambioEnSheetExplicito && !esComentarioDescartadoONoCaba(comentarioEfectivo)
        ? false
        : (previo?.referidosCabaYaEnviado ?? row.referidosCabaYaEnviado);
    const metadatosPreservados = {
      actualizadoEnAppAt: cambioEnSheetExplicito
        ? undefined
        : previo?.actualizadoEnAppAt || row.actualizadoEnAppAt,
      ultimoMensajeCorteEnviadoAt:
        previo?.ultimoMensajeCorteEnviadoAt || row.ultimoMensajeCorteEnviadoAt,
      alertaVencidoOcultaFecha:
        previo?.alertaVencidoOcultaFecha || row.alertaVencidoOcultaFecha,
      asignadoA: previo?.asignadoA || row.asignadoA,
      asignadoFecha: previo?.asignadoFecha || row.asignadoFecha,
    };

    // Si fue editado en la App o tiene estado consolidado en SQLite (sin cambio explícito en Sheets),
    // preservar la edición local en la App para evitar cualquier reversión visual o pérdida de confirmaciones.
    if ((editadoRecientementeEnApp || editadoEnApp) && previo) {
      const estadoApp = esBajaInexistenteEnControlOApp
        ? 'DESCARTADO_O_BAJA'
        : previo.estadoFlujo || row.estadoFlujo;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...previo,
        ...metadatosPreservados,
        id: row.id,
        nombre: previo.nombre || row.nombre,
        barrio: previo.barrio || row.barrio,
        email: previo.email || row.email,
        telRaw: previo.telRaw || row.telRaw,
        adhirio: esBajaInexistenteEnControlOApp ? 'No' : previo.adhirio || row.adhirio,
        rsp: esBajaInexistenteEnControlOApp ? 'No' : previo.rsp || row.rsp,
        primerContactoEnviado:
          estadoApp === 'SIN_CONTACTAR_1ER_MSJ' || estadoApp === 'FALTA_NOMBRE_Y_APELLIDO'
            ? false
            : true,
        comentario:
          esBajaInexistenteEnControlOApp && !(previo.comentario || '').trim()
            ? 'El número no existe en WhatsApp.'
            : (previo.comentario ?? row.comentario),
        estadoFlujo: estadoApp,
        estadoFlujoEtiqueta: estadoApp ? obtenerEtiquetaEstadoFlujo(estadoApp) : undefined,
      });
    }

    // 0a. Cuando priorizarSheets=true (sincronización con Google Sheets) y la Columna H ("Estado")
    // trae un estado explícito, o cuando no fue editado localmente en la App, sincronizar 1:1 con Google Sheets.
    if (row.estadoFlujo !== undefined && (cambioEnSheetExplicito || (priorizarSheets && !editadoEnApp) || !editadoEnApp)) {
      let estadoEfectivo0a: EstadoFlujo = row.estadoFlujo;
      const esSin1erMsjSheet =
        estadoEfectivo0a === 'SIN_CONTACTAR_1ER_MSJ' ||
        estadoEfectivo0a === 'FALTA_NOMBRE_Y_APELLIDO';
      // Jamás permitir que un contacto al que ya se le envió mensaje en controlEnvios o en la App regrese a SIN_CONTACTAR_1ER_MSJ
      // durante un refresco silencioso o caché de Sheets, salvo que el usuario lo haya cambiado explícitamente en Sheets.
      if (esSin1erMsjSheet && (fueEnviadoEnApp || (previo?.estadoFlujo && previo.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' && previo.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO')) && !cambioEnSheetExplicito) {
        estadoEfectivo0a = esBajaInexistenteEnControlOApp
          ? 'DESCARTADO_O_BAJA'
          : previo?.estadoFlujo &&
              previo.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
              previo.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO'
            ? previo.estadoFlujo
            : row.rsp === 'Sí' || previo?.rsp === 'Sí'
              ? 'RESPONDIO_FALTA_DNI_O_ZONA'
              : '1ER_MSJ_ENVIADO_SIN_RSP';
      }
      const esSin1erMsj =
        estadoEfectivo0a === 'SIN_CONTACTAR_1ER_MSJ' ||
        estadoEfectivo0a === 'FALTA_NOMBRE_Y_APELLIDO';
      if (esSin1erMsj) {
        nuevosParaPrimerContactoCount++;
      }
      const calleExtraida =
        (row.calleOCruce || '').trim() ||
        (!cambioEnSheetExplicito ? (previo?.calleOCruce || '').trim() : '') ||
        extraerCalleOCruce(comentarioSheet || comentarioEfectivo);
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        rsp: !esSin1erMsj && row.rsp === 'Nuevo' ? (previo?.rsp && previo.rsp !== 'Nuevo' ? previo.rsp : 'No') : row.rsp,
        calleOCruce: calleExtraida || undefined,
        comentario: comentarioSheet || comentarioEfectivo,
        primerContactoEnviado: !esSin1erMsj,
        referidosCabaYaEnviado:
          estadoEfectivo0a === 'DESCARTADO_O_BAJA'
            ? true
            : estadoEfectivo0a === 'SIN_DNI_CABA_PEDIR_REFERIDOS'
              ? false
              : referidosCabaYaEnviado,
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
        ultimoContacto: esSin1erMsj
          ? ''
          : previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
        intentos: esSin1erMsj
          ? 0
          : estadoEfectivo0a === 'SEGUNDO_SEGUIMIENTO_SIN_RSP'
            ? Math.max(2, previo?.intentos || 2)
            : Math.max(1, previo?.intentos || row.intentos || 1),
        estadoFlujo: estadoEfectivo0a,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoEfectivo0a),
      });
    }

    // 0b. Si fue editado explícitamente en la app (`actualizadoEnAppAt`) y no cambió en Sheets, preservar su estado actualizado en la app
    if (editadoEnApp && previo) {
      const estadoApp = previo.estadoFlujo || row.estadoFlujo;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...previo,
        ...metadatosPreservados,
        id: row.id,
        nombre: previo.nombre || row.nombre,
        barrio: previo.barrio || row.barrio,
        email: previo.email || row.email,
        telRaw: previo.telRaw || row.telRaw,
        comentario: comentarioEfectivo,
        estadoFlujo: estadoApp,
        estadoFlujoEtiqueta: estadoApp ? obtenerEtiquetaEstadoFlujo(estadoApp) : undefined,
      });
    }

    // 1. Si en el Google Sheet actual o en la App la persona figura como Adhirió = Sí (sin estadoFlujo explícito), marcar como YA_ADHIRIO_FIRMA_OK
    const adhirioEnSheetOApp =
      row.adhirio === 'Sí' ||
      (!cambioEnSheetExplicito && previo?.adhirio === 'Sí') ||
      yaAdhirioAntes(row) ||
      (!cambioEnSheetExplicito && previo ? yaAdhirioAntes(previo) : false) ||
      (!cambioEnSheetExplicito && Boolean(telKey) && adheridosPorTel.has(telKey)) ||
      (!cambioEnSheetExplicito && nomKey.length >= 5 && adheridosPorNombre.has(nomKey));

    if (adhirioEnSheetOApp) {
      const comLow = comentarioEfectivo.toLowerCase();
      const esRetiro =
        previo?.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        comLow.includes('buscar fichas') ||
        /x\d/i.test(comLow);
      const estadoAdherido: EstadoFlujo = esRetiro
        ? 'PENDIENTE_RETIRO_FICHAS'
        : 'YA_ADHIRIO_FIRMA_OK';
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        adhirio: 'Sí',
        rsp: 'Sí',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        estadoFlujo: estadoAdherido,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoAdherido),
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado,
        ultimoContacto: previo?.ultimoContacto || row.ultimoContacto,
        intentos: Math.max(previo?.intentos || 1, row.intentos || 1),
      });
    }

    // 1b. Si es un caso "Sin DNI en CABA" + "No tiene domicilio en CABA" + Adhirió="No" ya respondido (< #167 o enviado)
    const candidatoConRef: RawContactRow = {
      ...row,
      ...metadatosPreservados,
      comentario: comentarioEfectivo,
      referidosCabaYaEnviado,
      estadoFlujo:
        !cambioEnSheetExplicito && previo?.estadoFlujo === 'DESCARTADO_O_BAJA'
          ? 'DESCARTADO_O_BAJA'
          : row.estadoFlujo,
    };
    if (esSinDniCabaYaRespondidoOCerrado(candidatoConRef)) {
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        adhirio: 'No',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        referidosCabaYaEnviado: true,
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
        ultimoContacto: previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
        intentos: Math.max(previo?.intentos || 1, row.intentos || 1),
        estadoFlujo: 'DESCARTADO_O_BAJA',
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
      });
    }

    // 2. Si la persona respondió Sí en el Sheet o en la App, o ya tiene información real cargada en Comentario
    const tieneInfoRealEnColG = tieneNuevaInformacionEnColumnaG(comentarioEfectivo);
    if (row.rsp === 'Sí' || previo?.rsp === 'Sí' || tieneInfoRealEnColG) {
      const textoAgendaSheet = [row.diasEncuentro, row.horarioEncuentro, comentarioEfectivo]
        .filter(Boolean)
        .join(' ');
      const calleExtraida =
        (row.calleOCruce || '').trim() ||
        (!cambioEnSheetExplicito ? (previo?.calleOCruce || '').trim() : '') ||
        extraerCalleOCruce(comentarioEfectivo);
      const fechasExtraidas = extraerFechasMencionadas(textoAgendaSheet);
      const franjaExtraida = analizarFranjaHoraria(textoAgendaSheet);
      const estadoInferidoDeSheet = inferirEstadoFlujo(
        {
          ...row,
          rsp: 'Sí',
          adhirio: esComentarioDescartadoONoCaba(comentarioEfectivo, row.estadoFlujo) ? 'No' : row.adhirio || 'Pendiente',
          comentario: comentarioEfectivo,
          primerContactoEnviado: true,
          estadoFlujo: cambioEnSheetExplicito ? row.estadoFlujo : (row.estadoFlujo || previo?.estadoFlujo),
        },
        esCeldaSinNombre(row.nombre),
        calleExtraida,
        fechasExtraidas,
        franjaExtraida
      );
      const estadoPreservado = cambioEnSheetExplicito
        ? estadoInferidoDeSheet
        : previo?.estadoFlujo &&
            previo.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
            previo.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO' &&
            previo.estadoFlujo !== '1ER_MSJ_ENVIADO_SIN_RSP'
          ? previo.estadoFlujo
          : row.estadoFlujo || estadoInferidoDeSheet;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        diasEncuentro: cambioEnSheetExplicito
          ? row.diasEncuentro
          : (row.diasEncuentro ?? previo?.diasEncuentro),
        horaInicio: cambioEnSheetExplicito
          ? row.horaInicio
          : (row.horaInicio ?? previo?.horaInicio),
        horaFin: cambioEnSheetExplicito
          ? row.horaFin
          : (row.horaFin ?? previo?.horaFin),
        horarioEncuentro: cambioEnSheetExplicito
          ? row.horarioEncuentro
          : (row.horarioEncuentro ?? previo?.horarioEncuentro),
        calleOCruce: calleExtraida || undefined,
        rsp: 'Sí',
        adhirio: esComentarioDescartadoONoCaba(comentarioEfectivo, estadoPreservado)
          ? 'No'
          : row.adhirio || previo?.adhirio || 'Pendiente',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        referidosCabaYaEnviado,
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
        ultimoContacto: previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
        intentos: previo?.intentos !== undefined ? previo.intentos : row.intentos || 1,
        estadoFlujo: estadoPreservado,
        estadoFlujoEtiqueta: estadoPreservado
          ? obtenerEtiquetaEstadoFlujo(estadoPreservado)
          : undefined,
      });
    }

    // 3. Si en la app ya hicimos clic en "Enviar WA" para esta persona, preservar su estado de contactado
    if (fueEnviadoEnApp) {
      const estadoPreservado: EstadoFlujo =
        previo?.estadoFlujo &&
        previo.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
        previo.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO'
          ? previo.estadoFlujo
          : '1ER_MSJ_ENVIADO_SIN_RSP';
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        nombre: row.nombre || previo?.nombre || '',
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        rsp: String(previo?.rsp || '') === 'Sí' ? 'Sí' : 'No',
        adhirio: previo?.adhirio || 'Pendiente',
        comentario: comentarioEfectivo,
        primerContactoEnviado: true,
        referidosCabaYaEnviado,
        fechaPrimerContacto:
          previo?.fechaPrimerContacto || new Date().toISOString().slice(0, 10),
        ultimoContacto: previo?.ultimoContacto || new Date().toISOString().slice(0, 10),
        intentos: Math.max(1, previo?.intentos || 1),
        estadoFlujo: estadoPreservado,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoPreservado),
      });
    }

    // 4. Si está desde el #167 en adelante O es una persona nueva que se acaba de incluir en el Google Sheets (sin info en Col. G)
    if (
      !tieneInfoRealEnColG &&
      (numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO ||
        esPersonaNuevaEnSheet ||
        esContactoSinPrimerContacto(row))
    ) {
      const sinNom = esCeldaSinNombre(row.nombre);
      const estadoNuevo: EstadoFlujo = sinNom
        ? 'FALTA_NOMBRE_Y_APELLIDO'
        : 'SIN_CONTACTAR_1ER_MSJ';
      nuevosParaPrimerContactoCount++;
      const filaNueva: RawContactRow = {
        ...row,
        ...metadatosPreservados,
        rsp: 'Nuevo',
        adhirio: 'Pendiente',
        primerContactoEnviado: false,
        ultimoContacto: '',
        intentos: 0,
        estadoFlujo: estadoNuevo,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoNuevo),
      };
      return filaNueva;
    }

    return sincronizarBarrioConDireccionComentario({
      ...row,
      ...metadatosPreservados,
      adhirio: esComentarioDescartadoONoCaba(comentarioEfectivo, row.estadoFlujo || previo?.estadoFlujo)
        ? 'No'
        : previo?.adhirio || 'Pendiente',
      comentario: comentarioEfectivo,
      primerContactoEnviado: true,
      referidosCabaYaEnviado,
      vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
      fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
      ultimoContacto: previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
      intentos: previo?.intentos !== undefined ? previo.intentos : row.intentos || 1,
      estadoFlujo: previo?.estadoFlujo || row.estadoFlujo,
      estadoFlujoEtiqueta:
        (previo?.estadoFlujo ? obtenerEtiquetaEstadoFlujo(previo.estadoFlujo) : undefined) ||
        row.estadoFlujoEtiqueta,
    });
  });

  // Reconciliación de eliminaciones en Google Sheets:
  // Si `nuevosDesdeSheets` es el padrón completo de Sheets (o sincronización explícita `priorizarSheets`),
  // cualquier fila que haya sido borrada de Google Sheets (ej. #494) NO debe volver a agregarse desde `previosEnApp`,
  // salvo que acabe de ser creada localmente en la App en los últimos 45 segundos (mientras se escribe en Sheets).
  const esLecturaCompletaSheets = nuevosDesdeSheets.length >= 50 || priorizarSheets;
  const ahoraMergeMs = Date.now();

  for (const prev of previosEnApp) {
    const idKey = String(prev.id).trim();
    const telKey = normalizarTelefonoWA(prev.telRaw);
    const yaIncluidoPorId = Boolean(idKey && idsVistosEnSheet.has(idKey));
    const yaIncluidoPorTelMismoNombre = Boolean(telKey && telsVistosEnSheet.has(telKey));
    if (!yaIncluidoPorId && !yaIncluidoPorTelMismoNombre) {
      const estabaEnSheetsAntes = Boolean(idKey && ultimosVistosEnSheetPorId?.has(idKey));
      const recienCreadoEnApp =
        !estabaEnSheetsAntes &&
        !priorizarSheets &&
        Boolean(
          prev.actualizadoEnAppAt &&
            ahoraMergeMs - Date.parse(prev.actualizadoEnAppAt) < 45000
        );
      if (!esLecturaCompletaSheets || recienCreadoEnApp) {
        contactosFusionados.push(sincronizarBarrioConDireccionComentario(prev));
      }
    }
  }

  return {
    contactosFusionados: migrarContactosDesde167SinPrimerContacto(
      contactosFusionados,
      controlEnviadosKeys
    ),
    nuevosParaPrimerContactoCount,
  };
}

/**
 * Fusiona determinísticamente las listas de contactos entre múltiples dispositivos/sesiones
 * (por ejemplo PC de escritorio vs. notebook/compu vs. servidor), garantizando que siempre prevalezca
 * el cambio más reciente (`actualizadoEnAppAt`) o el estado más avanzado de cada contacto.
 */
export function fusionarContactosMultiDispositivo(
  locales: RawContactRow[],
  remotos: RawContactRow[],
  controlEnviadosKeys: Set<string> = new Set()
): RawContactRow[] {
  if (!remotos || remotos.length === 0) {
    return migrarContactosDesde167SinPrimerContacto(locales, controlEnviadosKeys);
  }
  if (!locales || locales.length === 0) {
    return migrarContactosDesde167SinPrimerContacto(remotos, controlEnviadosKeys);
  }

  const mapaRemotosPorId = new Map<string, RawContactRow>();
  const mapaRemotosPorTel = new Map<string, RawContactRow>();
  for (const r of remotos) {
    const idK = String(r.id || '').trim();
    if (idK) mapaRemotosPorId.set(idK, r);
    const tK = normalizarTelefonoWA(r.telRaw);
    if (tK) mapaRemotosPorTel.set(tK, r);
  }

  const idsProcesados = new Set<string>();
  const telsProcesados = new Set<string>();

  const puntajeAvanceContacto = (c: RawContactRow): number => {
    let score = 0;
    if (c.actualizadoEnAppAt) score += 100;
    if (c.ultimoMensajeCorteEnviadoAt) score += 50;
    if (c.adhirio === 'Sí') score += 80;
    if (c.estadoFlujo === 'DESCARTADO_O_BAJA' && c.referidosCabaYaEnviado) score += 70;
    if (c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' || c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO') score += 60;
    if (c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' || c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') score += 45;
    if (c.rsp === 'Sí') score += 30;
    if (c.primerContactoEnviado === true) score += 20;
    if (tieneNuevaInformacionEnColumnaG(c.comentario || '')) score += 15;
    score += Math.min(10, c.intentos || 0);
    return score;
  };

  const elegirMasReciente = (loc: RawContactRow, rem: RawContactRow): RawContactRow => {
    const tLoc = loc.actualizadoEnAppAt ? Date.parse(loc.actualizadoEnAppAt) : 0;
    const tRem = rem.actualizadoEnAppAt ? Date.parse(rem.actualizadoEnAppAt) : 0;
    if (tLoc > 0 && tRem > 0 && tLoc !== tRem) {
      const ganador = tRem > tLoc ? rem : loc;
      const perdedor = tRem > tLoc ? loc : rem;
      return {
        ...perdedor,
        ...ganador,
        ultimoMensajeCorteEnviadoAt:
          ganador.ultimoMensajeCorteEnviadoAt || perdedor.ultimoMensajeCorteEnviadoAt,
        alertaVencidoOcultaFecha:
          ganador.alertaVencidoOcultaFecha || perdedor.alertaVencidoOcultaFecha,
      };
    }
    if (tRem > 0 && tLoc === 0) return { ...loc, ...rem };
    if (tLoc > 0 && tRem === 0) return { ...rem, ...loc };

    const scoreLoc = puntajeAvanceContacto(loc);
    const scoreRem = puntajeAvanceContacto(rem);
    const ganador = scoreRem > scoreLoc ? rem : loc;
    const perdedor = scoreRem > scoreLoc ? loc : rem;
    return {
      ...perdedor,
      ...ganador,
      ultimoMensajeCorteEnviadoAt:
        ganador.ultimoMensajeCorteEnviadoAt || perdedor.ultimoMensajeCorteEnviadoAt,
      alertaVencidoOcultaFecha:
        ganador.alertaVencidoOcultaFecha || perdedor.alertaVencidoOcultaFecha,
    };
  };

  const resultado: RawContactRow[] = [];
  for (const loc of locales) {
    const idK = String(loc.id || '').trim();
    const tK = normalizarTelefonoWA(loc.telRaw);
    if (idK) idsProcesados.add(idK);
    if (tK) telsProcesados.add(tK);

    const rem = idK ? mapaRemotosPorId.get(idK) : tK ? mapaRemotosPorTel.get(tK) : undefined;
    if (!rem) {
      resultado.push(loc);
    } else {
      resultado.push(elegirMasReciente(loc, rem));
    }
  }

  for (const rem of remotos) {
    const idK = String(rem.id || '').trim();
    const tK = normalizarTelefonoWA(rem.telRaw);
    const visto =
      Boolean(idK && idsProcesados.has(idK)) || (!idK && Boolean(tK) && telsProcesados.has(tK));
    if (!visto) {
      resultado.push(rem);
    }
  }

  return migrarContactosDesde167SinPrimerContacto(resultado, controlEnviadosKeys);
}

/**
 * Permite modificar o agregar cualquier dato de un contacto seleccionado en "1. Contacto y Respuestas"
 * (Nombre, Barrio, Teléfono, Email, RSP, Adhirió, Comentario/Dirección en Columna G, Estado),
 * corrigiendo automáticamente el Barrio si la dirección introducida en la Columna G ("Comentario")
 * pertenece a otro barrio de CABA, y dejando el registro listo para sincronizar con Google Sheets.
 */
export function actualizarDatosContactoEnApp(
  rawActual: RawContactRow,
  cambios: Partial<RawContactRow>
): {
  actualizado: RawContactRow;
  barrioAutocorregido: boolean;
  barrioAnterior?: string;
  barrioFinal: string;
} {
  const ahoraISO = new Date().toISOString();
  const hoyBA = obtenerPartesFechaHoraBA();

  // Comentario se mantiene estrictamente para notas internas; no se contamina con calleOCruce
  let comentarioCombinado = cambios.comentario !== undefined ? cambios.comentario : rawActual.comentario || '';
  const nuevaCalle = cambios.calleOCruce !== undefined ? cambios.calleOCruce.trim() : (rawActual.calleOCruce || '').trim();
  const nuevosDias = cambios.diasEncuentro !== undefined ? cambios.diasEncuentro.trim() : (rawActual.diasEncuentro || '').trim();
  let nuevaHoraIni = cambios.horaInicio !== undefined ? cambios.horaInicio.trim() : (rawActual.horaInicio || '').trim();
  let nuevaHoraFin = cambios.horaFin !== undefined ? cambios.horaFin.trim() : (rawActual.horaFin || '').trim();
  let nuevoHorario =
    cambios.horarioEncuentro !== undefined
      ? cambios.horarioEncuentro.trim()
      : (rawActual.horarioEncuentro || '').trim();

  // Si se estableció explícitamente un horario puntual (ej: "17:00") y no se pasó horaFin, limpiar horaFin
  if (
    cambios.horarioEncuentro !== undefined &&
    /^\d{1,2}:\d{2}(?:\s*hs)?$/i.test(nuevoHorario) &&
    !cambios.horaFin
  ) {
    const mPuntual = nuevoHorario.match(/^(\d{1,2}):(\d{2})/i);
    if (mPuntual) {
      nuevaHoraIni = `${mPuntual[1].padStart(2, '0')}:${mPuntual[2]}`;
    }
    nuevaHoraFin = '';
  }

  if (
    (cambios.horaInicio !== undefined || cambios.horaFin !== undefined) &&
    cambios.horarioEncuentro === undefined
  ) {
    nuevoHorario =
      nuevaHoraIni && nuevaHoraFin && nuevaHoraFin !== nuevaHoraIni
        ? `${nuevaHoraIni} a ${nuevaHoraFin}`
        : nuevaHoraIni || nuevaHoraFin || '';
  }

  const cambioManualExplicitoEstado =
    cambios.estadoFlujo !== undefined && cambios.estadoFlujo !== rawActual.estadoFlujo;

  const esReversionANuevo =
    cambioManualExplicitoEstado &&
    (cambios.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
      cambios.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO');

  if (esReversionANuevo) {
    comentarioCombinado = comentarioCombinado
      .replace(/\s*\[Modificado el [^\]]*\]/gi, '')
      .trim();
  }

  // Filtrar claves con valor undefined para nunca sobrescribir nombre, barrio, telRaw, etc. con undefined
  const cambiosDefinidos = Object.fromEntries(
    Object.entries(cambios).filter(([, valor]) => valor !== undefined)
  ) as Partial<RawContactRow>;

  const combinado: RawContactRow = {
    ...rawActual,
    ...cambiosDefinidos,
    nombre: (cambiosDefinidos.nombre ?? rawActual.nombre ?? '').trim(),
    barrio: (cambiosDefinidos.barrio ?? rawActual.barrio ?? 'Palermo').trim(),
    telRaw: cambiosDefinidos.telRaw ?? rawActual.telRaw ?? '',
    calleOCruce: nuevaCalle,
    diasEncuentro: nuevosDias,
    horaInicio: nuevaHoraIni,
    horaFin: nuevaHoraFin,
    horarioEncuentro: nuevoHorario,
    comentario: comentarioCombinado,
    enSheets: true,
    actualizadoEnAppAt: esReversionANuevo ? undefined : cambiosDefinidos.actualizadoEnAppAt || ahoraISO,
  };

  // Si se modificó el comentario o calleOCruce, verificar si corresponde auto-corregir el barrio
  const barrioAntesDeCheck = (combinado.barrio || 'Palermo').trim();
  const conBarrioSincronizado = sincronizarBarrioConDireccionComentario(combinado);
  const barrioAutocorregido =
    conBarrioSincronizado.barrio.toLowerCase() !== barrioAntesDeCheck.toLowerCase();

  let estadoFinal = conBarrioSincronizado.estadoFlujo;

  // Si el usuario cambió manualmente el estatus en el selector de Estado:
  if (cambioManualExplicitoEstado && cambios.estadoFlujo !== undefined) {
    estadoFinal = cambios.estadoFlujo;
    if (
      cambios.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
      cambios.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
    ) {
      conBarrioSincronizado.primerContactoEnviado = false;
      if (cambios.rsp === undefined) {
        conBarrioSincronizado.rsp = 'Nuevo';
      }
    } else {
      conBarrioSincronizado.primerContactoEnviado = true;
      if (conBarrioSincronizado.rsp === 'Nuevo' && cambios.rsp === undefined) {
        conBarrioSincronizado.rsp = 'No';
      }
    }

    if (
      cambios.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
      cambios.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO'
    ) {
      conBarrioSincronizado.adhirio = 'Sí';
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      conBarrioSincronizado.retiroConfirmado = false;
      if (
        rawActual.adhirio !== 'Sí' ||
        (rawActual.estadoFlujo !== 'YA_ADHIRIO_FIRMA_OK' &&
          rawActual.estadoFlujo !== 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO') ||
        !rawActual.fechaAdhesion
      ) {
        conBarrioSincronizado.fechaAdhesion = hoyBA.isoDate;
      }
    } else if (cambios.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS') {
      conBarrioSincronizado.adhirio = 'Sí';
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      if (rawActual.adhirio !== 'Sí' || !rawActual.fechaAdhesion) {
        conBarrioSincronizado.fechaAdhesion = hoyBA.isoDate;
      }
      if (!conBarrioSincronizado.fichasExtrasCantidad) {
        conBarrioSincronizado.fichasExtrasCantidad = 'X2';
      }
    } else if (
      rawActual.adhirio === 'Sí' &&
      cambios.adhirio === undefined
    ) {
      // Si ya había adherido (ficha verde con botón de mensaje deshabilitado) y el usuario cambia manualmente
      // el estatus para poder volver a escribirle, pasa `adhirio` a 'Pendiente' para habilitar el envío.
      conBarrioSincronizado.adhirio = 'Pendiente';
      conBarrioSincronizado.fechaAdhesion = undefined;
    }

    if (cambios.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') {
      if (!conBarrioSincronizado.fechaEstadoPuntoSede) {
        conBarrioSincronizado.fechaEstadoPuntoSede = hoyBA.isoDate;
      }
    }

    if (cambios.estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP') {
      conBarrioSincronizado.rsp = 'No';
      conBarrioSincronizado.adhirio = 'Pendiente';
      conBarrioSincronizado.intentos = Math.max(2, conBarrioSincronizado.intentos || 2);
    } else if (cambios.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP') {
      conBarrioSincronizado.rsp = 'No';
      conBarrioSincronizado.adhirio = 'Pendiente';
    } else if (
      cambios.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
      cambios.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
      cambios.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
      cambios.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
      cambios.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
    ) {
      conBarrioSincronizado.rsp = 'Sí';
    }

    if (cambios.estadoFlujo === 'DESCARTADO_O_BAJA') {
      conBarrioSincronizado.adhirio = 'No';
      conBarrioSincronizado.referidosCabaYaEnviado = true;
    } else if (cambios.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS') {
      conBarrioSincronizado.adhirio = 'No';
      conBarrioSincronizado.referidosCabaYaEnviado = false;
    }
  } else if (cambios.adhirio !== undefined && cambios.adhirio !== rawActual.adhirio) {
    if (cambios.adhirio === 'Sí') {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      if (rawActual.adhirio !== 'Sí' || !rawActual.fechaAdhesion) {
        conBarrioSincronizado.fechaAdhesion = hoyBA.isoDate;
      }
      const comLow = (conBarrioSincronizado.comentario || '').toLowerCase();
      estadoFinal =
        conBarrioSincronizado.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        comLow.includes('buscar fichas') ||
        /x\d/i.test(comLow)
          ? 'PENDIENTE_RETIRO_FICHAS'
          : 'YA_ADHIRIO_FIRMA_OK';
    } else if (
      rawActual.adhirio === 'Sí' &&
      conBarrioSincronizado.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
    ) {
      const sinNom =
        esCeldaSinNombre(conBarrioSincronizado.nombre) &&
        !conBarrioSincronizado.vocativoOverride?.trim();
      const calle = conBarrioSincronizado.calleOCruce || extraerCalleOCruce(conBarrioSincronizado.comentario);
      const fechas = extraerFechasMencionadas(
        [conBarrioSincronizado.diasEncuentro, conBarrioSincronizado.comentario].filter(Boolean).join(' ')
      );
      const franja = analizarFranjaHoraria(
        [conBarrioSincronizado.horarioEncuentro, conBarrioSincronizado.horaInicio, conBarrioSincronizado.comentario]
          .filter(Boolean)
          .join(' ')
      );
      estadoFinal = inferirEstadoFlujo(
        { ...conBarrioSincronizado, estadoFlujo: undefined },
        sinNom,
        calle,
        fechas,
        franja
      );
    }
  } else {
    const vocativoValido =
      conBarrioSincronizado.vocativoOverride?.trim() &&
      !esCeldaSinNombre(conBarrioSincronizado.vocativoOverride.trim());
    const sinNom = esCeldaSinNombre(conBarrioSincronizado.nombre) && !vocativoValido;
    const calle = (conBarrioSincronizado.calleOCruce || '').trim();
    const fechas = extraerFechasMencionadas(conBarrioSincronizado.diasEncuentro || '');
    const tieneHorarioExplicito = Boolean(
      (conBarrioSincronizado.horarioEncuentro && conBarrioSincronizado.horarioEncuentro.trim()) ||
        (conBarrioSincronizado.horaInicio && conBarrioSincronizado.horaInicio.trim())
    );
    const franja = analizarFranjaHoraria(
      [conBarrioSincronizado.horarioEncuentro, conBarrioSincronizado.horaInicio].filter(Boolean).join(' ')
    );
    const modificoAgendaODir =
      cambios.diasEncuentro !== undefined ||
      cambios.horarioEncuentro !== undefined ||
      cambios.horaInicio !== undefined ||
      cambios.horaFin !== undefined ||
      cambios.calleOCruce !== undefined;

    if (rawActual.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS') {
      estadoFinal = 'PENDIENTE_RETIRO_FICHAS';
    } else if (
      (modificoAgendaODir ||
        rawActual.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
        rawActual.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO') &&
      calle.length > 0 &&
      (fechas.length > 0 || tieneHorarioExplicito || franja !== 'Flexible') &&
      conBarrioSincronizado.adhirio !== 'Sí' &&
      conBarrioSincronizado.adhirio !== 'No' &&
      conBarrioSincronizado.estadoFlujo !== 'ENCUENTRO_CONFIRMADO' &&
      conBarrioSincronizado.estadoFlujo !== 'RECORDATORIO_DIA_ENVIADO' &&
      conBarrioSincronizado.estadoFlujo !== 'PREFIERE_CAFE_HUB_O_SEDE'
    ) {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      estadoFinal = 'PASO_DATOS_FALTA_CONFIRMAR';
    } else if (
      modificoAgendaODir &&
      (calle.length > 0 || fechas.length > 0 || tieneHorarioExplicito) &&
      (rawActual.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
        rawActual.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
        rawActual.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ||
        rawActual.estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP')
    ) {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      estadoFinal =
        calle.length > 0 && (fechas.length > 0 || tieneHorarioExplicito)
          ? 'PASO_DATOS_FALTA_CONFIRMAR'
          : 'RESPONDIO_FALTA_DNI_O_ZONA';
    } else if (
      !sinNom &&
      conBarrioSincronizado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
    ) {
      estadoFinal =
        conBarrioSincronizado.rsp === 'Sí'
          ? 'RESPONDIO_FALTA_DNI_O_ZONA'
          : conBarrioSincronizado.primerContactoEnviado ||
              Boolean(conBarrioSincronizado.ultimoMensajeCorteEnviadoAt)
            ? '1ER_MSJ_ENVIADO_SIN_RSP'
            : 'SIN_CONTACTAR_1ER_MSJ';
    } else if (rawActual.estadoFlujo) {
      estadoFinal = rawActual.estadoFlujo;
    } else {
      estadoFinal = inferirEstadoFlujo(
        { ...conBarrioSincronizado, estadoFlujo: undefined },
        sinNom,
        calle,
        fechas,
        franja
      );
    }
  }

  const actualizado: RawContactRow = {
    ...conBarrioSincronizado,
    actualizadoEnAppAt: esReversionANuevo ? undefined : cambiosDefinidos.actualizadoEnAppAt || ahoraISO,
    estadoFlujo: estadoFinal,
    estadoFlujoEtiqueta: estadoFinal ? obtenerEtiquetaEstadoFlujo(estadoFinal) : undefined,
  };

  return {
    actualizado,
    barrioAutocorregido,
    barrioAnterior: barrioAutocorregido ? barrioAntesDeCheck : undefined,
    barrioFinal: actualizado.barrio,
  };
}

/**
 * Marca que al vecino se le dejaron fichas extra (X1/X2/X3) para familiares/amigos
 * y agenda automáticamente el recordatorio de retiro para dentro de 1 semana (7 días),
 * conservando su dirección previa por defecto.
 */
export function marcarEntregaFichasExtra(
  raw: RawContactRow,
  cantidad: 'X1' | 'X2' | 'X3' | 'X4' | 'X5' = 'X2',
  ahoraMs: number = Date.now()
): RawContactRow {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const enUnaSemana = sumarDiasAFechaBA(ahoraMs, 7);
  const calle = (raw.calleOCruce || '').trim() || extraerCalleOCruce(raw.comentario);

  return sincronizarBarrioConDireccionComentario({
    ...raw,
    enSheets: true,
    rsp: 'Sí',
    adhirio: 'Sí',
    primerContactoEnviado: true,
    fechaAdhesion: raw.fechaAdhesion || hoyBA.isoDate,
    calleOCruce: calle || raw.calleOCruce,
    diasEncuentro: enUnaSemana.ddmm,
    fichasExtrasCantidad: cantidad,
    retiroConfirmado: false,
    estadoFlujo: 'PENDIENTE_RETIRO_FICHAS',
    estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('PENDIENTE_RETIRO_FICHAS'),
    actualizadoEnAppAt: new Date(ahoraMs).toISOString(),
  });
}

/**
 * Registra el clic en el botón de enviar mensaje (WhatsApp) y calcula automáticamente
 * el nuevo estado del contacto según el tipo de plantilla y contenido del mensaje,
 * sin regresar nunca un contacto ya avanzado a "1er mensaje enviado".
 */
export function registrarEnvioMensajeContacto(
  raw: RawContactRow,
  plantillaEnviada: TipoPlantillaWA = 'auto',
  fechaHoyISO: string = new Date().toISOString().slice(0, 10),
  mensajeTexto?: string
): {
  actualizado: RawContactRow;
  estadoAnteriorEtiqueta: string;
  estadoNuevo: EstadoFlujo;
  estadoNuevoEtiqueta: string;
  eraPrimerContacto: boolean;
} {
  const procActual = procesarContacto(raw);
  const estadoAnteriorEtiqueta = procActual.estadoFlujoEtiqueta;
  const tplEfectiva =
    plantillaEnviada === 'auto' ? procActual.tipoPlantillaSugerida : plantillaEnviada;
  const msgLow = (mensajeTexto || '').toLowerCase();

  const estadosAvanzados: EstadoFlujo[] = [
    'ENCUENTRO_CONFIRMADO',
    'RECORDATORIO_DIA_ENVIADO',
    'PASO_DATOS_FALTA_CONFIRMAR',
    'PREFIERE_CAFE_HUB_O_SEDE',
    'RESPONDIO_FALTA_DNI_O_ZONA',
    'SEGUNDO_SEGUIMIENTO_SIN_RSP',
    'PIDIO_MAS_INFO_ENVIADA',
    'PENDIENTE_RETIRO_FICHAS',
    'YA_ADHIRIO_FIRMA_OK',
    'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO',
  ];
  const yaEstabaAvanzado = Boolean(raw.estadoFlujo && estadosAvanzados.includes(raw.estadoFlujo));

  const eraPrimerContacto =
    !yaEstabaAvanzado &&
    (esContactoSinPrimerContacto(raw) ||
      procActual.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
      procActual.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO');

  let estadoNuevo: EstadoFlujo = procActual.estadoFlujo;
  let rspNuevo: RawContactRow['rsp'] = raw.rsp === 'Nuevo' ? 'No' : raw.rsp;
  let adhirioNuevo: RawContactRow['adhirio'] = raw.adhirio;
  let referidosCabaYaEnviado = raw.referidosCabaYaEnviado;

  if (
    tplEfectiva === 'agradecimiento_post_firma' ||
    raw.adhirio === 'Sí' ||
    procActual.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    procActual.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO'
  ) {
    estadoNuevo =
      procActual.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' || tplEfectiva === 'retiro_fichas'
        ? 'PENDIENTE_RETIRO_FICHAS'
        : tplEfectiva === 'agradecimiento_post_firma' ||
            procActual.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO'
          ? 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO'
          : 'YA_ADHIRIO_FIRMA_OK';
    adhirioNuevo = 'Sí';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'retiro_fichas' || procActual.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS') {
    estadoNuevo = 'PENDIENTE_RETIRO_FICHAS';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'no_caba_referidos' ||
    procActual.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    procActual.situacion === 'DESCARTADO_NO_CABA'
  ) {
    estadoNuevo = 'DESCARTADO_O_BAJA';
    adhirioNuevo = 'No';
    referidosCabaYaEnviado = true;
  } else if (
    tplEfectiva === 'baja_respetuosa' ||
    tplEfectiva === 'baja_amable_sin_respuesta'
  ) {
    estadoNuevo = 'DESCARTADO_O_BAJA';
    adhirioNuevo = 'No';
    referidosCabaYaEnviado = true;
  } else if (
    tplEfectiva === 'en_camino' ||
    tplEfectiva === 'llegando' ||
    tplEfectiva === 'demorado' ||
    tplEfectiva === 'recordatorio_maniana_encuentro' ||
    /estoy en camino|saliendo para all|llego en 2|ya estoy en el caf|recordarte que hoy/i.test(msgLow)
  ) {
    estadoNuevo = 'RECORDATORIO_DIA_ENVIADO';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'disculpas_y_reprogramacion' ||
    tplEfectiva === 'esperado_no_estaba_reprogramar'
  ) {
    estadoNuevo =
      procActual.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
        ? 'PREFIERE_CAFE_HUB_O_SEDE'
        : 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'propuesta_bloque_agenda') {
    estadoNuevo =
      procActual.estadoFlujo === 'ENCUENTRO_CONFIRMADO'
        ? 'ENCUENTRO_CONFIRMADO'
        : 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'confirmacion_visita') {
    const esPropuestaPidiendoConfirmar =
      plantillaEnviada === 'auto' &&
      /confirmanos por ac|te paso la propuesta|¿te queda bien si paso|avisame si te queda bien/i.test(
        msgLow
      ) &&
      !/dejar confirmado|queda confirmado/i.test(msgLow);
    estadoNuevo = esPropuestaPidiendoConfirmar
      ? procActual.estadoFlujo === 'ENCUENTRO_CONFIRMADO'
        ? 'ENCUENTRO_CONFIRMADO'
        : 'PASO_DATOS_FALTA_CONFIRMAR'
      : 'ENCUENTRO_CONFIRMADO';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'convocatoria_cafe_hub') {
    estadoNuevo =
      procActual.estadoFlujo === 'ENCUENTRO_CONFIRMADO'
        ? 'ENCUENTRO_CONFIRMADO'
        : raw.rsp === 'Sí' || yaEstabaAvanzado
        ? 'PREFIERE_CAFE_HUB_O_SEDE'
        : '1ER_MSJ_ENVIADO_SIN_RSP';
  } else if (tplEfectiva === 'seguimiento_24h_falta_dato' || tplEfectiva === 'seguimiento_cambio_chip') {
    estadoNuevo = yaEstabaAvanzado ? procActual.estadoFlujo : 'RESPONDIO_FALTA_DNI_O_ZONA';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'seguimiento_24h_falta_confirmar') {
    estadoNuevo =
      procActual.estadoFlujo === 'ENCUENTRO_CONFIRMADO'
        ? 'ENCUENTRO_CONFIRMADO'
        : 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'seguimiento_sin_respuesta') {
    estadoNuevo = 'SEGUNDO_SEGUIMIENTO_SIN_RSP';
    rspNuevo = 'No';
  } else if (tplEfectiva === 'mas_info') {
    estadoNuevo = yaEstabaAvanzado ? procActual.estadoFlujo : 'PIDIO_MAS_INFO_ENVIADA';
    rspNuevo = 'Sí';
  } else if (eraPrimerContacto) {
    estadoNuevo = '1ER_MSJ_ENVIADO_SIN_RSP';
    rspNuevo = raw.rsp === 'Sí' ? 'Sí' : 'No';
  } else if (yaEstabaAvanzado && raw.estadoFlujo) {
    estadoNuevo = raw.estadoFlujo;
    rspNuevo = raw.rsp === 'Nuevo' ? 'Sí' : raw.rsp;
  } else {
    estadoNuevo = '1ER_MSJ_ENVIADO_SIN_RSP';
  }

  const estadoNuevoEtiqueta = obtenerEtiquetaEstadoFlujo(estadoNuevo);
  const ahoraISO = new Date().toISOString();

  const actualizado: RawContactRow = sincronizarBarrioConDireccionComentario({
    ...raw,
    enSheets: true,
    primerContactoEnviado: true,
    referidosCabaYaEnviado,
    fechaPrimerContacto: raw.fechaPrimerContacto || fechaHoyISO,
    ultimoContacto: fechaHoyISO,
    ultimoMensajeCorteEnviadoAt: ahoraISO,
    actualizadoEnAppAt: ahoraISO,
    intentos: (raw.intentos || 0) + 1,
    rsp: rspNuevo,
    adhirio: adhirioNuevo,
    fechaEstadoPuntoSede:
      estadoNuevo === 'PREFIERE_CAFE_HUB_O_SEDE'
        ? raw.fechaEstadoPuntoSede || fechaHoyISO
        : raw.fechaEstadoPuntoSede,
    estadoFlujo: estadoNuevo,
    estadoFlujoEtiqueta: estadoNuevoEtiqueta,
  });

  return {
    actualizado,
    estadoAnteriorEtiqueta,
    estadoNuevo,
    estadoNuevoEtiqueta,
    eraPrimerContacto,
  };
}

/**
 * Exporta el padrón actualizado a formato CSV (con BOM UTF-8 para Excel y Google Sheets)
 * Incluye la columna de Estado detallado del usuario y el control de 1er Contacto.
 */

