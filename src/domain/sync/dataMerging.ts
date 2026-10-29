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
import { analizarFranjaHoraria, extraerFechasMencionadas, obtenerPartesFechaHoraBA } from '../calendar/availability';
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
      !reparado.actualizadoEnAppAt &&
      (/\[Intento auto fallido[^\]]*Tiempo de espera agotado al abrir el chat\]/i.test(comRaw) ||
        (IDS_ENVIADOS_FALSO_TIMEOUT.has(numId) && /Intento auto fallido/i.test(comRaw)))
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
    // pero habían quedado marcados como primerContactoEnviado: true (#190, #191)
    if (
      !reparado.actualizadoEnAppAt &&
      (/\[Intento auto fallido[^\]]*(?:Target page, context or browser has been closed|browser has been closed)[^\]]*\]/i.test(
        comRaw
      ) ||
        (IDS_CERRADOS_ANTES_DE_ENVIAR.has(numId) && (!comRaw || /Intento auto fallido/i.test(comRaw))))
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

    // 1. Verificar si esta persona ya adhirió antes (directamente o en un registro previo)
    if (
      yaAdhirioAntes(reparado) ||
      (Boolean(telKey) && adheridosPorTel.has(telKey)) ||
      (nomKey.length >= 5 && adheridosPorNombre.has(nomKey))
    ) {
      const comLow = (reparado.comentario || '').toLowerCase();
      const esRetiro =
        reparado.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        comLow.includes('buscar fichas') ||
        /x\d/i.test(comLow);
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

    const yaEnviadoEnControl =
      controlEnviadosKeys.has(`id:${reparado.id}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`tel:${telKey}`));

    if (yaEnviadoEnControl) {
      const nextEstado =
        reparado.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
        reparado.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
        !reparado.estadoFlujo
          ? '1ER_MSJ_ENVIADO_SIN_RSP'
          : reparado.estadoFlujo;
      return {
        ...reparado,
        primerContactoEnviado: true,
        rsp: reparado.rsp === 'Nuevo' ? 'No' : reparado.rsp,
        estadoFlujo: nextEstado,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(nextEstado),
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
  controlEnviadosKeys: Set<string> = new Set()
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

    // Si el contacto fue editado explícitamente en la app (`actualizadoEnAppAt`), priorizar el comentario y estatus de la app
    const editadoEnApp = Boolean(previo?.actualizadoEnAppAt);

    const fueEnviadoEnApp =
      editadoEnApp ||
      controlEnviadosKeys.has(`id:${idKey}`) ||
      (Boolean(telKey) && controlEnviadosKeys.has(`tel:${telKey}`)) ||
      Boolean(previo?.primerContactoEnviado === true) ||
      Boolean(previo?.ultimoMensajeCorteEnviadoAt);

    const numId = extraerNumeroIdContacto(row.id);
    const esPersonaNuevaEnSheet = !previo && previosEnApp.length > 0;
    const comentarioEfectivo =
      editadoEnApp && previo?.comentario
        ? previo.comentario
        : tieneNuevaInformacionEnColumnaG(row.comentario)
          ? row.comentario
          : tieneNuevaInformacionEnColumnaG(previo?.comentario || '')
            ? previo!.comentario
            : row.comentario || previo?.comentario || '';
    const referidosCabaYaEnviado =
      previo?.referidosCabaYaEnviado ?? row.referidosCabaYaEnviado;
    const metadatosPreservados = {
      actualizadoEnAppAt: previo?.actualizadoEnAppAt || row.actualizadoEnAppAt,
      ultimoMensajeCorteEnviadoAt:
        previo?.ultimoMensajeCorteEnviadoAt || row.ultimoMensajeCorteEnviadoAt,
      alertaVencidoOcultaFecha:
        previo?.alertaVencidoOcultaFecha || row.alertaVencidoOcultaFecha,
    };

    // 1. Si en el Google Sheet actual o en la App la persona figura como Adhirió = Sí, marcar como proceso terminado (YA_ADHIRIO_FIRMA_OK)
    const adhirioEnSheetOApp =
      row.adhirio === 'Sí' ||
      previo?.adhirio === 'Sí' ||
      yaAdhirioAntes(row) ||
      (previo ? yaAdhirioAntes(previo) : false) ||
      (Boolean(telKey) && adheridosPorTel.has(telKey)) ||
      (nomKey.length >= 5 && adheridosPorNombre.has(nomKey));

    if (adhirioEnSheetOApp) {
      const comLow = comentarioEfectivo.toLowerCase();
      const esRetiro =
        row.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
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
      estadoFlujo: previo?.estadoFlujo === 'DESCARTADO_O_BAJA' ? 'DESCARTADO_O_BAJA' : row.estadoFlujo,
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

    // 1c. Si fue editado explícitamente en la app (`actualizadoEnAppAt`), preservar íntegramente su estado actualizado en la app
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

    // 2. Si la persona respondió Sí en el Sheet (Columna E = Sí) o en la App, o ya tiene información real cargada en Columna G ("Comentario")
    const tieneInfoRealEnColG = tieneNuevaInformacionEnColumnaG(comentarioEfectivo);
    if (row.rsp === 'Sí' || previo?.rsp === 'Sí' || tieneInfoRealEnColG) {
      const estadoPreservado =
        previo?.estadoFlujo &&
        previo.estadoFlujo !== 'SIN_CONTACTAR_1ER_MSJ' &&
        previo.estadoFlujo !== 'FALTA_NOMBRE_Y_APELLIDO' &&
        previo.estadoFlujo !== '1ER_MSJ_ENVIADO_SIN_RSP'
          ? previo.estadoFlujo
          : row.estadoFlujo;
      return sincronizarBarrioConDireccionComentario({
        ...row,
        ...metadatosPreservados,
        rsp: 'Sí',
        adhirio: esComentarioDescartadoONoCaba(comentarioEfectivo, estadoPreservado)
          ? 'No'
          : previo?.adhirio || 'Pendiente',
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
    const yaIncluido =
      (idKey && idsVistosEnSheet.has(idKey)) ||
      (Boolean(telKey) && telsVistosEnSheet.has(telKey));
    if (!yaIncluido) {
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

    const rem = mapaRemotosPorId.get(idK) || (tK ? mapaRemotosPorTel.get(tK) : undefined);
    if (!rem) {
      resultado.push(loc);
    } else {
      resultado.push(elegirMasReciente(loc, rem));
    }
  }

  for (const rem of remotos) {
    const idK = String(rem.id || '').trim();
    const tK = normalizarTelefonoWA(rem.telRaw);
    const visto = (idK && idsProcesados.has(idK)) || (Boolean(tK) && telsProcesados.has(tK));
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
  const combinado: RawContactRow = {
    ...rawActual,
    ...cambios,
    enSheets: true,
    actualizadoEnAppAt: cambios.actualizadoEnAppAt || ahoraISO,
  };

  // Si se modificó el comentario (Columna G) o ya tiene dirección en Columna G, verificar si corresponde auto-corregir el barrio
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
      if (cambios.rsp === undefined) {
        conBarrioSincronizado.rsp = 'Nuevo';
      }
    } else {
      conBarrioSincronizado.primerContactoEnviado = true;
      if (conBarrioSincronizado.rsp === 'Nuevo' && cambios.rsp === undefined) {
        conBarrioSincronizado.rsp = 'No';
      }
    }

    if (cambios.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') {
      conBarrioSincronizado.adhirio = 'Sí';
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
    } else if (
      rawActual.adhirio === 'Sí' &&
      cambios.adhirio === undefined &&
      cambios.estadoFlujo !== 'PENDIENTE_RETIRO_FICHAS'
    ) {
      // Si ya había adherido (ficha verde con botón de mensaje deshabilitado) y el usuario cambia manualmente
      // el estatus para poder volver a escribirle, pasa `adhirio` a 'Pendiente' para habilitar el envío.
      conBarrioSincronizado.adhirio = 'Pendiente';
    }

    if (cambios.estadoFlujo === 'DESCARTADO_O_BAJA') {
      conBarrioSincronizado.adhirio = 'No';
      conBarrioSincronizado.referidosCabaYaEnviado = true;
    } else if (cambios.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS') {
      conBarrioSincronizado.referidosCabaYaEnviado = false;
    }
  } else if (cambios.adhirio !== undefined) {
    if (cambios.adhirio === 'Sí') {
      conBarrioSincronizado.rsp = 'Sí';
      conBarrioSincronizado.primerContactoEnviado = true;
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
      const calle = extraerCalleOCruce(conBarrioSincronizado.comentario);
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
    const calle = extraerCalleOCruce(conBarrioSincronizado.comentario);
    const fechas = extraerFechasMencionadas(conBarrioSincronizado.comentario);
    const franja = analizarFranjaHoraria(conBarrioSincronizado.comentario);
    // Si cargó dirección o día en Comentario y estaba en sin respuesta, pasar a PASO_DATOS_FALTA_CONFIRMAR y RSP = Sí
    if (
      cambios.comentario !== undefined &&
      (calle.length > 0 || fechas.length > 0) &&
      conBarrioSincronizado.adhirio !== 'Sí' &&
      conBarrioSincronizado.adhirio !== 'No'
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
    actualizadoEnAppAt: conBarrioSincronizado.actualizadoEnAppAt || ahoraISO,
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
 * Registra el clic en el botón de enviar mensaje (WhatsApp) y calcula automáticamente
 * el nuevo estado del contacto para actualizar tanto la app como la tabla de Excel / Google Sheets.
 */
export function registrarEnvioMensajeContacto(
  raw: RawContactRow,
  plantillaEnviada: TipoPlantillaWA = 'auto',
  fechaHoyISO: string = new Date().toISOString().slice(0, 10)
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

  const eraPrimerContacto =
    esContactoSinPrimerContacto(raw) ||
    procActual.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    procActual.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
    tplEfectiva === 'primer_contacto';

  let estadoNuevo: EstadoFlujo = procActual.estadoFlujo;
  let rspNuevo: RawContactRow['rsp'] = raw.rsp === 'Nuevo' ? 'No' : raw.rsp;
  let adhirioNuevo: RawContactRow['adhirio'] = raw.adhirio;
  let referidosCabaYaEnviado = raw.referidosCabaYaEnviado;

  if (eraPrimerContacto) {
    estadoNuevo = '1ER_MSJ_ENVIADO_SIN_RSP';
    rspNuevo = raw.rsp === 'Sí' ? 'Sí' : 'No';
  } else if (tplEfectiva === 'disculpas_y_reprogramacion') {
    estadoNuevo =
      procActual.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
        ? 'PREFIERE_CAFE_HUB_O_SEDE'
        : 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'en_camino' ||
    tplEfectiva === 'llegando' ||
    tplEfectiva === 'demorado' ||
    tplEfectiva === 'recordatorio_maniana_encuentro'
  ) {
    estadoNuevo = 'RECORDATORIO_DIA_ENVIADO';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'esperado_no_estaba_reprogramar') {
    estadoNuevo = 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'seguimiento_24h_falta_dato') {
    estadoNuevo = 'RESPONDIO_FALTA_DNI_O_ZONA';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'seguimiento_24h_falta_confirmar') {
    estadoNuevo = 'PASO_DATOS_FALTA_CONFIRMAR';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'confirmacion_visita' ||
    procActual.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR'
  ) {
    estadoNuevo = 'ENCUENTRO_CONFIRMADO';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'convocatoria_cafe_hub') {
    estadoNuevo =
      raw.rsp === 'Sí' ? 'PREFIERE_CAFE_HUB_O_SEDE' : '1ER_MSJ_ENVIADO_SIN_RSP';
  } else if (tplEfectiva === 'mas_info') {
    estadoNuevo = 'PIDIO_MAS_INFO_ENVIADA';
    rspNuevo = 'Sí';
  } else if (tplEfectiva === 'agradecimiento_post_firma') {
    estadoNuevo = 'YA_ADHIRIO_FIRMA_OK';
    adhirioNuevo = 'Sí';
    rspNuevo = 'Sí';
  } else if (
    tplEfectiva === 'no_caba_referidos' ||
    procActual.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    procActual.situacion === 'DESCARTADO_NO_CABA'
  ) {
    // Una vez enviado el mensaje de consulta de referidos en CABA, cambiar estatus a Archivado/Cerrado
    // para sacarlo automáticamente de la lista de pendientes y de la cola de mensajes.
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

