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
          '[1er msj auto enviado 21/10]'
        )
        .trim();
      return {
        ...reparado,
        rsp: 'No',
        adhirio: 'Pendiente',
        primerContactoEnviado: true,
        comentario: comCorregido || '[1er msj auto enviado 21/10]',
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

    // Si la fila ya tiene un estadoFlujo explícito (por ejemplo, sincronizado de la Columna H de Google Sheets
    // o asignado en la App), respetarlo 1:1 normalizando únicamente alias heredados.
    if (reparado.estadoFlujo !== undefined) {
      let estEfectivo: EstadoFlujo = reparado.estadoFlujo;
      if (estEfectivo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP') {
        estEfectivo = '1ER_MSJ_ENVIADO_SIN_RSP';
      } else if (estEfectivo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO') {
        estEfectivo = 'YA_ADHIRIO_FIRMA_OK';
      }
      const esSinPrimerMsj =
        estEfectivo === 'SIN_CONTACTAR_1ER_MSJ' ||
        estEfectivo === 'FALTA_NOMBRE_Y_APELLIDO';
      return {
        ...reparado,
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

  // 3. Garantizar que el padrón siempre incluya los contactos nuevos sin 1er mensaje de INITIAL_RAW_CONTACTS (#197 en adelante)
  // para que la pestaña "1. Cola y 7 Reglas" del Automatizador siempre tenga personas sin contactar por primera vez.
  const idsPresentes = new Set(migrados.map((r) => extraerNumeroIdContacto(r.id)));
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
  priorizarSheets: boolean = false
): { contactosFusionados: RawContactRow[]; nuevosParaPrimerContactoCount: number } {
  const mapaPreviosPorId = new Map<string, RawContactRow>();
  const mapaPreviosPorTel = new Map<string, RawContactRow>();
  const adheridosPorTel = new Set<string>();
  const adheridosPorNombre = new Set<string>();

  for (const prev of previosEnApp) {
    mapaPreviosPorId.set(String(prev.id).trim(), prev);
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
    const telKey = normalizarTelefonoWA(row.telRaw);
    const nomKey = (row.nombre || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (idKey) idsVistosEnSheet.add(idKey);
    if (telKey) telsVistosEnSheet.add(telKey);

    const previo = mapaPreviosPorId.get(idKey) || (telKey ? mapaPreviosPorTel.get(telKey) : undefined);

    // Detectar si en Google Sheets se modificó el comentario, estado o adhesión respecto del previo en App
    const comentarioSheet = (row.comentario || '').trim();
    const comentarioPrevio = (previo?.comentario || '').trim();
    const cambioEnSheetExplicito =
      priorizarSheets &&
      Boolean(previo) &&
      (comentarioSheet !== comentarioPrevio ||
        row.adhirio !== previo?.adhirio ||
        row.rsp !== previo?.rsp ||
        (row.estadoFlujo !== undefined && row.estadoFlujo !== previo?.estadoFlujo) ||
        (row.estadoFlujo === undefined &&
          (previo?.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
            previo?.estadoFlujo === 'DESCARTADO_O_BAJA') &&
          !esComentarioDescartadoONoCaba(comentarioSheet)));

    // Si el contacto fue editado explícitamente en la app (`actualizadoEnAppAt`) y NO fue modificado en Google Sheets, priorizar la app
    const editadoEnApp = Boolean(previo?.actualizadoEnAppAt) && !cambioEnSheetExplicito;

    const fueEnviadoEnApp =
      editadoEnApp ||
      controlEnviadosKeys.has(`id:${idKey}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`tel:${telKey}`)) ||
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
    };

    // Si fue editado en la App en los últimos segundos (mientras el push a Google Sheets está en vuelo),
    // preservar la edición local en la App para evitar cualquier reversión visual.
    const editadoRecientementeEnApp = Boolean(
      previo?.actualizadoEnAppAt &&
        Date.now() - Date.parse(previo.actualizadoEnAppAt) < 6000
    );

    if (editadoRecientementeEnApp && previo) {
      const estadoApp = previo.estadoFlujo || row.estadoFlujo;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...previo,
        nombre: previo.nombre || row.nombre,
        barrio: previo.barrio || row.barrio,
        email: previo.email || row.email,
        telRaw: previo.telRaw || row.telRaw,
        comentario: previo.comentario ?? row.comentario,
        estadoFlujo: estadoApp,
        estadoFlujoEtiqueta: estadoApp ? obtenerEtiquetaEstadoFlujo(estadoApp) : undefined,
      });
    }

    // 0a. Cuando priorizarSheets=true (sincronización con Google Sheets) y la Columna H ("Estado")
    // trae un estado explícito, o cuando no fue editado localmente en la App, sincronizar 1:1 con Google Sheets.
    if (row.estadoFlujo !== undefined && (priorizarSheets || !editadoEnApp)) {
      const esSin1erMsj =
        row.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
        row.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO';
      if (esSin1erMsj) {
        nuevosParaPrimerContactoCount++;
      }
      const calleExtraida = extraerCalleOCruce(comentarioSheet || comentarioEfectivo);
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        calleOCruce: calleExtraida || row.calleOCruce || undefined,
        comentario: comentarioSheet || comentarioEfectivo,
        primerContactoEnviado: !esSin1erMsj,
        referidosCabaYaEnviado:
          row.estadoFlujo === 'DESCARTADO_O_BAJA'
            ? true
            : row.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS'
              ? false
              : referidosCabaYaEnviado,
        vocativoOverride: previo?.vocativoOverride || row.vocativoOverride,
        fechaAgregado: previo?.fechaAgregado || row.fechaAgregado || '2025-05-14',
        ultimoContacto: esSin1erMsj
          ? ''
          : previo?.ultimoContacto || row.ultimoContacto || '2025-05-14',
        intentos: esSin1erMsj
          ? 0
          : row.estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP'
            ? Math.max(2, previo?.intentos || 2)
            : Math.max(1, previo?.intentos || row.intentos || 1),
        estadoFlujo: row.estadoFlujo,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(row.estadoFlujo),
      });
    }

    // 0b. Si fue editado explícitamente en la app (`actualizadoEnAppAt`) y no cambió en Sheets, preservar su estado actualizado en la app
    if (editadoEnApp && previo) {
      const estadoApp = previo.estadoFlujo || row.estadoFlujo;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...previo,
        ...metadatosPreservados,
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
      const calleExtraida = extraerCalleOCruce(comentarioEfectivo);
      const fechasExtraidas = extraerFechasMencionadas(comentarioEfectivo);
      const franjaExtraida = analizarFranjaHoraria(comentarioEfectivo);
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

  // Preservar también cualquier contacto agregado manualmente en la app que aún no figure en la exportación CSV de Sheets
  for (const prev of previosEnApp) {
    const idKey = String(prev.id).trim();
    const telKey = normalizarTelefonoWA(prev.telRaw);
    const yaIncluidoPorId = Boolean(idKey && idsVistosEnSheet.has(idKey));
    const yaIncluidoPorTelMismoNombre =
      !idKey && Boolean(telKey) && telsVistosEnSheet.has(telKey);
    if (!yaIncluidoPorId && !yaIncluidoPorTelMismoNombre) {
      contactosFusionados.push(sincronizarBarrioConDireccionComentario(prev));
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

  // Si se editó calleOCruce y aún no figura en comentario, reflejarla en comentario para Google Sheets
  let comentarioCombinado = cambios.comentario !== undefined ? cambios.comentario : rawActual.comentario || '';
  const nuevaCalle = cambios.calleOCruce !== undefined ? cambios.calleOCruce.trim() : (rawActual.calleOCruce || '').trim();
  if (
    cambios.calleOCruce !== undefined &&
    nuevaCalle &&
    !comentarioCombinado.toLowerCase().includes(nuevaCalle.toLowerCase())
  ) {
    comentarioCombinado = comentarioCombinado.trim()
      ? `${comentarioCombinado.trim()} (${nuevaCalle})`
      : `(${nuevaCalle})`;
  }

  const esReversionANuevo =
    cambios.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    cambios.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO';

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
    calleOCruce: nuevaCalle || undefined,
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
  if (cambios.estadoFlujo !== undefined) {
    estadoFinal = cambios.estadoFlujo;
    if (
      cambios.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
      cambios.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
    ) {
      conBarrioSincronizado.primerContactoEnviado = false;
      conBarrioSincronizado.actualizadoEnAppAt = undefined;
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
    } else if (
      rawActual.adhirio === 'Sí' &&
      cambios.adhirio === undefined
    ) {
      // Si ya había adherido (ficha verde con botón de mensaje deshabilitado) y el usuario cambia manualmente
      // el estatus para poder volver a escribirle, pasa `adhirio` a 'Pendiente' para habilitar el envío.
      conBarrioSincronizado.adhirio = 'Pendiente';
      conBarrioSincronizado.fechaAdhesion = undefined;
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
  } else if (cambios.adhirio !== undefined) {
    if (cambios.adhirio === 'Sí') {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      if (rawActual.adhirio !== 'Sí' || !rawActual.fechaAdhesion) {
        conBarrioSincronizado.fechaAdhesion = hoyBA.isoDate;
      }
      const comLow = (conBarrioSincronizado.comentario || '').toLowerCase();
      estadoFinal =
        comLow.includes('buscar fichas') || /x\d/i.test(comLow)
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
      const fechas = extraerFechasMencionadas(conBarrioSincronizado.comentario);
      const franja = analizarFranjaHoraria(conBarrioSincronizado.comentario);
      estadoFinal = inferirEstadoFlujo(
        { ...conBarrioSincronizado, estadoFlujo: undefined },
        sinNom,
        calle,
        fechas,
        franja
      );
    }
  } else {
    const sinNom = esCeldaSinNombre(conBarrioSincronizado.nombre) && !conBarrioSincronizado.vocativoOverride?.trim();
    const calle = conBarrioSincronizado.calleOCruce || extraerCalleOCruce(conBarrioSincronizado.comentario);
    const fechas = extraerFechasMencionadas(conBarrioSincronizado.comentario);
    const franja = analizarFranjaHoraria(conBarrioSincronizado.comentario);
    // Si cargó dirección o día en Comentario o calleOCruce y estaba en sin respuesta, pasar a PASO_DATOS_FALTA_CONFIRMAR y RSP = Sí
    if (
      (cambios.comentario !== undefined || cambios.calleOCruce !== undefined) &&
      (calle.length > 0 || fechas.length > 0) &&
      conBarrioSincronizado.adhirio !== 'Sí' &&
      conBarrioSincronizado.adhirio !== 'No' &&
      conBarrioSincronizado.estadoFlujo !== 'ENCUENTRO_CONFIRMADO' &&
      conBarrioSincronizado.estadoFlujo !== 'RECORDATORIO_DIA_ENVIADO'
    ) {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
      estadoFinal = 'PASO_DATOS_FALTA_CONFIRMAR';
    } else if (
      cambios.nombre !== undefined &&
      !sinNom &&
      conBarrioSincronizado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
    ) {
      estadoFinal = conBarrioSincronizado.primerContactoEnviado
        ? '1ER_MSJ_ENVIADO_SIN_RSP'
        : 'SIN_CONTACTAR_1ER_MSJ';
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
    actualizadoEnAppAt: esReversionANuevo
      ? undefined
      : conBarrioSincronizado.actualizadoEnAppAt || ahoraISO,
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
 * y agenda automáticamente el recordatorio de retiro para dentro de 1 semana (7 días).
 */
export function marcarEntregaFichasExtra(
  raw: RawContactRow,
  cantidad: 'X1' | 'X2' | 'X3' = 'X2',
  ahoraMs: number = Date.now()
): RawContactRow {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const enUnaSemana = sumarDiasAFechaBA(ahoraMs, 7);
  const calle = (raw.calleOCruce || '').trim() || extraerCalleOCruce(raw.comentario);
  const comPrevio = (raw.comentario || '')
    .replace(/COORDINAR para buscar fichas\s+X\d[^\n·]*/gi, '')
    .trim();
  const notaRetiro = `COORDINAR para buscar fichas ${cantidad} el ${enUnaSemana.ddmm}${
    calle ? ` (${calle})` : ''
  }`;
  const nuevoComentario = comPrevio ? `${comPrevio} · ${notaRetiro}` : notaRetiro;

  return sincronizarBarrioConDireccionComentario({
    ...raw,
    enSheets: true,
    rsp: 'Sí',
    adhirio: 'Sí',
    primerContactoEnviado: true,
    fechaAdhesion: raw.fechaAdhesion || hoyBA.isoDate,
    comentario: nuevoComentario,
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
        : 'PREFIERE_CAFE_HUB_O_SEDE';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'confirmacion_visita') {
    estadoNuevo = 'ENCUENTRO_CONFIRMADO';
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
        : 'PREFIERE_CAFE_HUB_O_SEDE';
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

