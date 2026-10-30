import { compararFechaDDMMConHoyBA, sumarDiasAFechaBA } from '../calendar/availability';
import { FranjaHoraria } from '../../types';
import { normalizarBarrioCABA } from '../geo/cabaLocations';
import {
  Contact,
  EstadoFlujo,
  RawContactRow,
  SituacionContacto,
  VoiceProfile,
} from '../../types';
import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';
import { analizarYCorregirNombreCompleto } from './nameCorrection';
import { esTelefonoValido, normalizarTelefonoWA } from './phoneUtils';
import {
  extraerCalleOCruce,
  geocodificarContactoLocal,
  sincronizarBarrioConDireccionComentario,
  esBarrioDeCABA,
  esEmailValido,
  esIdFilaValido,
  tienePuntoEncuentroODireccionDeterminada,
} from '../geo/cabaLocations';
import { diagnosticarYGenerarMensajeSeguimiento48h, generarMensajeContextual } from '../messaging/messageTemplates';
import {
  analizarDisponibilidadColumnaG,
  analizarFranjaHoraria,
  detectarAlertaPendienteVencido,
  extraerFechasMencionadas,
  horaAMinutosDelDia,
  obtenerPartesFechaHoraBA,
} from '../calendar/availability';

export function repararContactoDesfasado(raw: RawContactRow, index: number = 0): RawContactRow {
  const nombreEsBarrio = esBarrioDeCABA(raw.nombre);
  const barrioEsEmail = esEmailValido(raw.barrio);

  if (!nombreEsBarrio && !barrioEsEmail) {
    return raw;
  }

  const rawIdLimpio = String(raw.id || '')
    .replace(/^#/, '')
    .trim();
  const idContieneNombrePersona =
    Boolean(rawIdLimpio) &&
    !esIdFilaValido(rawIdLimpio) &&
    !esBarrioDeCABA(rawIdLimpio) &&
    !esEmailValido(rawIdLimpio) &&
    !esTelefonoValido(rawIdLimpio);

  const nombreReal = idContieneNombrePersona
    ? rawIdLimpio
    : !nombreEsBarrio
    ? raw.nombre
    : '';

  const barrioReal = nombreEsBarrio
    ? normalizarBarrioCABA(raw.nombre)
    : esBarrioDeCABA(raw.barrio)
    ? normalizarBarrioCABA(raw.barrio)
    : 'Palermo';

  const emailReal = barrioEsEmail ? raw.barrio.trim() : raw.email;
  const idReal = idContieneNombrePersona ? String(index + 1) : raw.id || String(index + 1);

  return {
    ...raw,
    id: idReal,
    nombre: nombreReal,
    barrio: barrioReal,
    email: emailReal,
    // Recalcular estadoFlujo si había quedado con un estado genérico producto del desfase
    estadoFlujo:
      raw.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ? undefined : raw.estadoFlujo,
  };
}

export function asegurarIdsUnicosContactos(rows: RawContactRow[]): RawContactRow[] {
  let maxIdNum = rows.reduce((max, r, idx) => {
    const num = Number(String(r?.id || '').replace(/^#/, '').trim());
    return Number.isFinite(num) && num > 0 ? Math.max(max, num) : Math.max(max, idx + 1);
  }, rows.length);

  const idsUsados = new Set<string>();
  return rows.map((row) => {
    const idLimpio = String(row.id || '')
      .replace(/^#/, '')
      .trim();
    if (idLimpio && !idsUsados.has(idLimpio)) {
      idsUsados.add(idLimpio);
      return row.id === idLimpio ? row : { ...row, id: idLimpio };
    }
    maxIdNum += 1;
    while (idsUsados.has(String(maxIdNum))) {
      maxIdNum += 1;
    }
    const nuevoId = String(maxIdNum);
    idsUsados.add(nuevoId);
    return {
      ...row,
      id: nuevoId,
    };
  });
}

export function repararContactosDesfasados(rows: RawContactRow[]): RawContactRow[] {
  return asegurarIdsUnicosContactos(rows.map((r, i) => repararContactoDesfasado(r, i)));
}


export const ESTADOS_FLUJO_CATALOGO: {
  value: EstadoFlujo;
  label: string;
  shortLabel: string;
  colorClass: string;
}[] = [
  {
    value: 'SIN_CONTACTAR_1ER_MSJ',
    label: '1. Sin contactar (Enviar 1er mensaje)',
    shortLabel: '1. Enviar 1er msj',
    colorClass: 'bg-amber-100 text-amber-950 border-amber-300',
  },
  {
    value: 'FALTA_NOMBRE_Y_APELLIDO',
    label: '2. Teléfono sin nombre (Pedir nombre y apellido)',
    shortLabel: '2. Pedir nombre y apellido',
    colorClass: 'bg-rose-100 text-rose-950 border-rose-300',
  },
  {
    value: '1ER_MSJ_ENVIADO_SIN_RSP',
    label: '3. 1er mensaje enviado (Sin respuesta aún)',
    shortLabel: '3. 1er msj enviado (Sin rsp)',
    colorClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  {
    value: 'RESPONDIO_FALTA_DNI_O_ZONA',
    label: '4. Respondió Sí — Falta corroborar DNI CABA / zona',
    shortLabel: '4. Respondió Sí (Falta zona/DNI)',
    colorClass: 'bg-orange-100 text-orange-950 border-orange-300',
  },
  {
    value: 'PIDIO_MAS_INFO_ENVIADA',
    label: '5. Pidió más info (5 ejes enviados)',
    shortLabel: '5. Pidió más info',
    colorClass: 'bg-purple-100 text-purple-950 border-purple-300',
  },
  {
    value: 'PREFIERE_CAFE_HUB_O_SEDE',
    label: '6. Prefiere Punto / Café Hub / Sede Chile 1408',
    shortLabel: '6. Prefiere Punto / Café Hub',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  {
    value: 'PASO_DATOS_FALTA_CONFIRMAR',
    label: '7. Pasó día/franja/dirección — Falta confirmar encuentro',
    shortLabel: '7. Pasó datos (Falta confirmar)',
    colorClass: 'bg-sky-100 text-sky-950 border-sky-300',
  },
  {
    value: 'ENCUENTRO_CONFIRMADO',
    label: '8. Encuentro confirmado (En agenda de ruta)',
    shortLabel: '8. Encuentro confirmado',
    colorClass: 'bg-indigo-100 text-indigo-950 border-indigo-300',
  },
  {
    value: 'RECORDATORIO_DIA_ENVIADO',
    label: '9. Recordatorio del día / En camino enviado',
    shortLabel: '9. Recordatorio del día enviado',
    colorClass: 'bg-teal-100 text-teal-950 border-teal-300',
  },
  {
    value: 'YA_ADHIRIO_FIRMA_OK',
    label: '10. ✅ Proceso terminado — Ya adhirió (Listo)',
    shortLabel: '10. ✅ Listo · Ya adhirió',
    colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
  },
  {
    value: 'PENDIENTE_RETIRO_FICHAS',
    label: '11. Adhirió + Retirar fichas extra (X1/X2/X3)',
    shortLabel: '11. Retirar fichas X1/X2/X3',
    colorClass: 'bg-emerald-200 text-emerald-950 border-emerald-400',
  },
  {
    value: 'POSTERGO_SALUD_O_VIAJE',
    label: '12. En pausa temporal (Salud / Viaje)',
    shortLabel: '12. Pausa (Salud/Viaje)',
    colorClass: 'bg-slate-200 text-slate-800 border-slate-300',
  },
  {
    value: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
    label: '13. Sin DNI en CABA (Consultar referidos CABA — Pendiente envío)',
    shortLabel: '13. Sin DNI CABA (Consultar ref.)',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  {
    value: 'DESCARTADO_O_BAJA',
    label: '14. Archivado / Sin DNI CABA ya respondido / Baja',
    shortLabel: '14. Archivado / Ya respondido',
    colorClass: 'bg-red-50 text-red-800 border-red-200',
  },
];

export function obtenerEtiquetaEstadoFlujo(estado: EstadoFlujo): string {
  return (
    ESTADOS_FLUJO_CATALOGO.find((e) => e.value === estado)?.label ||
    '3. 1er mensaje enviado (Sin respuesta aún)'
  );
}

export function parsearTextoAEstadoFlujo(textoRaw: string): EstadoFlujo | undefined {
  const t = String(textoRaw || '').trim();
  if (!t) return undefined;
  const exact = ESTADOS_FLUJO_CATALOGO.find(
    (e) =>
      e.value === t ||
      e.label.toLowerCase() === t.toLowerCase() ||
      e.shortLabel.toLowerCase() === t.toLowerCase()
  );
  if (exact) return exact.value;

  const low = t.toLowerCase();
  if (low.includes('sin nombre') || low.includes('pedir nombre')) return 'FALTA_NOMBRE_Y_APELLIDO';
  if (low.includes('sin contactar') || low.includes('enviar 1er')) return 'SIN_CONTACTAR_1ER_MSJ';
  if (low.includes('recordatorio') || low.includes('en camino')) return 'RECORDATORIO_DIA_ENVIADO';
  if (low.includes('confirmado')) return 'ENCUENTRO_CONFIRMADO';
  if (low.includes('pasó') || low.includes('falta confirmar')) return 'PASO_DATOS_FALTA_CONFIRMAR';
  if (low.includes('punto') || low.includes('café hub') || low.includes('sede'))
    return 'PREFIERE_CAFE_HUB_O_SEDE';
  if (low.includes('más info') || low.includes('mas info')) return 'PIDIO_MAS_INFO_ENVIADA';
  if (low.includes('fichas') || low.includes('x1') || low.includes('x2') || low.includes('x3'))
    return 'PENDIENTE_RETIRO_FICHAS';
  if (
    low.includes('ya adhirió') ||
    low.includes('proceso terminado') ||
    low.includes('firmada') ||
    low.includes('firmó')
  )
    return 'YA_ADHIRIO_FIRMA_OK';
  if (low.includes('salud') || low.includes('viaje') || low.includes('pausa'))
    return 'POSTERGO_SALUD_O_VIAJE';
  if (low.includes('archivado') || low.includes('ya respondido') || low.includes('baja') || low.includes('inválido'))
    return 'DESCARTADO_O_BAJA';
  if (low.includes('sin dni') || low.includes('referidos')) return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
  if (low.includes('respondió sí') || low.includes('cambio de chip'))
    return 'RESPONDIO_FALTA_DNI_O_ZONA';
  if (low.includes('sin respuesta')) return '1ER_MSJ_ENVIADO_SIN_RSP';
  return undefined;
}

export const UMBRAL_ID_SIN_PRIMER_CONTACTO = 167;

export function extraerNumeroIdContacto(idRaw: string): number {
  const limpio = String(idRaw || '').trim();
  const digits = limpio.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) || 0;
}

/**
 * Verifica si un contacto YA ADHIRIÓN antes (según Columna F "Adhirió" = "Sí", estado `YA_ADHIRIO_FIRMA_OK`,
 * o nota explícita en Columna G de haber firmado), para garantizar que nunca sea agregado por error
 * a estados activos como "3. Prefiere Punto (Convocar a Café Hub)" ni a listas de envío de mensajes.
 */
export function yaAdhirioAntes(raw: {
  adhirio?: string;
  estadoFlujo?: EstadoFlujo;
  comentario?: string;
}): boolean {
  const adh = (raw.adhirio || '').toLowerCase().trim();
  if (/^(s[ií]|firm[oó]|firmad[oa]|adherid[oa])$/i.test(adh)) return true;
  if (
    raw.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    raw.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
  ) {
    return true;
  }
  const com = (raw.comentario || '').toLowerCase().trim();
  return /\b(ya\s+adhir[ií]o|ya\s+firm[oó]|firm[oó]\s+el\s+\d|adhesi[oó]n\s+firmada|ficha\s+firmada|proceso\s+terminado)\b/i.test(
    com
  );
}

export function esComentarioDescartadoONoCaba(comentario: string, estadoFlujo?: EstadoFlujo): boolean {
  const com = (comentario || '').toLowerCase().trim();
  if (
    estadoFlujo === 'DESCARTADO_O_BAJA' ||
    estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS'
  ) {
    return true;
  }
  return (
    com.includes('no tiene domicilio en caba') ||
    com.includes('fuera de caba') ||
    com.includes('no vive en caba') ||
    com.includes('extranjero') ||
    com.includes('adhesión digital') ||
    com.includes('vive en ') ||
    com.includes('vive fuera') ||
    com.includes('no existe en whatsapp') ||
    com.includes('número equivocado') ||
    /\bbaja\b/i.test(com)
  );
}

/**
 * Determina si una persona marcada sin DNI en CABA ("No tiene domicilio en CABA", "Vive fuera", etc.)
 * o con baja/teléfono inválido YA FUE RESPONDIDA y por lo tanto debe salir de la lista de pendientes
 * y dejar de ser visible en las colas activas:
 * 1. Si es anterior al #167 y tiene en Columna G "No tiene domicilio en CABA" (o equivalente fuera de CABA)
 *    y en Columna F ("Adhirió") no ha adherido ("No" / "Pendiente"), ya se le respondió históricamente.
 * 2. De aquí en adelante (#167+ o nuevos cambios a `SIN_DNI_CABA_PEDIR_REFERIDOS`), una vez que se envía
 *    el mensaje de consulta de referidos CABA (`referidosCabaYaEnviado === true` o nota `[Referidos CABA consultados — Cerrado]`),
 *    pasa automáticamente a cerrado/archivado y sale de la lista de pendientes.
 */
export function esSinDniCabaYaRespondidoOCerrado(raw: {
  id?: string;
  adhirio?: string;
  comentario?: string;
  estadoFlujo?: EstadoFlujo;
  referidosCabaYaEnviado?: boolean;
}): boolean {
  if (yaAdhirioAntes(raw)) return false;

  const com = (raw.comentario || '').toLowerCase().trim();
  const adh = (raw.adhirio || '').toLowerCase().trim();

  if (
    com.includes('no existe en whatsapp') ||
    com.includes('número equivocado') ||
    /\bbaja\b/i.test(com)
  ) {
    return true;
  }

  if (raw.estadoFlujo === 'DESCARTADO_O_BAJA') {
    return true;
  }

  if (
    raw.referidosCabaYaEnviado === true ||
    /referidos\s+caba\s+consultados|ya\s+respondido|\[cerrado/i.test(com)
  ) {
    return true;
  }

  // Si el usuario acaba de poner explícitamente `referidosCabaYaEnviado: false` para poder enviarle el mensaje por primera vez
  if (raw.referidosCabaYaEnviado === false) {
    return false;
  }

  const tieneComentarioNoCaba =
    com.includes('no tiene domicilio en caba') ||
    com.includes('fuera de caba') ||
    com.includes('no vive en caba') ||
    com.includes('extranjero') ||
    com.includes('adhesión digital') ||
    com.includes('vive en ') ||
    com.includes('vive fuera');

  const numId = extraerNumeroIdContacto(raw.id || '');
  // Regla del usuario: cuando las personas están marcadas como "6. Sin DNI en CABA" y a su vez
  // en la Columna G ("Comentario") tienen "No tiene domicilio en CABA" (o fuera de CABA)
  // y en la Columna F ("Adhirió") es "No" (antes del #167), ya se les respondió y deben salir de pendientes.
  if (
    tieneComentarioNoCaba &&
    adh === 'no' &&
    numId > 0 &&
    numId < UMBRAL_ID_SIN_PRIMER_CONTACTO
  ) {
    return true;
  }

  return false;
}

/**
 * Determina si la Columna "G" ("Comentario") tiene información nueva real cargada sobre el contacto
 * (ignorando notas automáticas de sistema como "Ingresado en Google Sheets", "1er mensaje enviado", "Sin respuesta").
 */
export function tieneNuevaInformacionEnColumnaG(comentario: string): boolean {
  const com = (comentario || '').trim();
  if (!com) return false;
  const sinNotasSistema = com
    .replace(/ingresad[oa] en google sheets[^·;\n]*/gi, '')
    .replace(/tel[eé]fono cargado en google sheets[^·;\n]*/gi, '')
    .replace(/pendiente de 1er contacto/gi, '')
    .replace(/1er\s*(mensaje|msj|contacto)\s*enviado[^·;\n]*/gi, '')
    .replace(/^sin respuesta\.?$/gi, '')
    .replace(/^no contesta\.?$/gi, '')
    .replace(/[—\-·,;:\s]+/g, '')
    .trim();
  return sinNotasSistema.length > 0;
}

/**
 * Determina si una persona NO adherida ya tiene una VISITA CONCRETADA con TODOS los datos necesarios
 * para realizarla (dirección/lugar específico + fecha/día concreto o confirmación explícita).
 */
export function tieneVisitaConcretadaConDatosCompletos(params: {
  adhirio: string;
  comentario: string;
  calleOCruce: string;
  fechasMencionadas: string[];
  estadoFlujo?: EstadoFlujo;
}): boolean {
  if (yaAdhirioAntes(params)) return false;
  if (esComentarioDescartadoONoCaba(params.comentario, params.estadoFlujo)) return false;

  const com = (params.comentario || '').toLowerCase().trim();
  const tieneLugarConcreto =
    Boolean(params.calleOCruce && params.calleOCruce.trim().length > 0) ||
    com.includes('chile 1408') ||
    /visita\s+con[sc]ertada/i.test(com);

  if (!tieneLugarConcreto) return false;

  // Si explícitamente dice "CONFIRMAR Visita" o "por confirmar" y no fue confirmada aún, le falta confirmación
  const pideConfirmarExplicitamente =
    /\b(confirmar\s+visita|visita\s+por\s+confirmar|falta\s+confirmar|esperando\s+confirmaci[oó]n)\b/i.test(
      com
    ) &&
    params.estadoFlujo !== 'ENCUENTRO_CONFIRMADO' &&
    params.estadoFlujo !== 'RECORDATORIO_DIA_ENVIADO' &&
    !/visita\s+confirmada/i.test(com);

  if (pideConfirmarExplicitamente) return false;

  if (
    params.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    params.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    /visita\s+confirmada|visita\s+con[sc]ertada|va\s+a\s+pasar\s+por\s+chile\s*1408/i.test(com)
  ) {
    return true;
  }

  const tieneDiaDeSemanaExplicito =
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(com) &&
    !/pidi[oó]\s+que\s+le\s+escribiera/i.test(com);

  const tieneFechaConcreta = params.fechasMencionadas.length > 0 || tieneDiaDeSemanaExplicito;

  // Si dice "cualquier día" sin fecha ni día de semana puntual, falta concretar el día exacto
  if (!tieneFechaConcreta) return false;

  return true;
}

/**
 * Determina si un contacto aún NO ha recibido el mensaje de primer contacto.
 * Regla operativa:
 * 1. Todas las personas desde el #167 en adelante (y toda persona nueva que se incluya en Google Sheets)
 *    necesitan un mensaje de primer contacto hasta que se haga clic en el botón de enviar mensaje
 *    (lo cual marca `primerContactoEnviado = true` y pasa su estado a `3. 1er mensaje enviado`).
 * 2. Las personas del #1 al #166 ya fueron contactadas históricamente (salvo que figuren explícitamente como Nuevo).
 */
export function esContactoSinPrimerContacto(raw: RawContactRow): boolean {
  if (yaAdhirioAntes(raw)) return false;
  if (raw.primerContactoEnviado === true) return false;
  if (raw.primerContactoEnviado === false) return true;

  const rsp = (raw.rsp || '').toLowerCase().trim();
  const com = (raw.comentario || '').toLowerCase().trim();

  if (esComentarioDescartadoONoCaba(raw.comentario, raw.estadoFlujo)) return false;
  if (rsp === 'sí' || rsp === 'si') return false;

  if (
    raw.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    raw.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
    rsp === 'nuevo' ||
    raw.enSheets === false
  ) {
    return true;
  }

  if (
    raw.estadoFlujo &&
    raw.estadoFlujo !== '1ER_MSJ_ENVIADO_SIN_RSP'
  ) {
    return false;
  }

  const numId = extraerNumeroIdContacto(raw.id);
  if (numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO) {
    const tieneInfoRealColG = tieneNuevaInformacionEnColumnaG(raw.comentario || '');
    const tieneEvidenciaContactoPrevio =
      tieneInfoRealColG ||
      com.includes('1er mensaje enviado') ||
      com.includes('1er msj enviado') ||
      com.includes('sin respuesta') ||
      com.includes('no contesta') ||
      com.includes('visita ') ||
      com.includes('vive en ') ||
      com.includes('no tiene domicilio') ||
      com.includes('no existe en whatsapp') ||
      com.includes('número equivocado');
    if (!tieneEvidenciaContactoPrevio) {
      return true;
    }
  }

  return false;
}

export function inferirEstadoFlujo(
  raw: RawContactRow,
  sinNombre: boolean,
  calleOCruce: string,
  fechasMencionadas: string[],
  franjaHoraria: FranjaHoraria
): EstadoFlujo {
  const com = (raw.comentario || '').toLowerCase();
  const adh = (raw.adhirio || '').toLowerCase();
  const rsp = (raw.rsp || '').toLowerCase();
  const sinPrimerContacto = esContactoSinPrimerContacto(raw);

  // 1. VERIFICACIÓN PRIORITARIA DE ADHESIÓN PREVIA:
  // Antes de asignar cualquier estado activo (como "Prefiere Punto / Café Hub"), verificar si ya adhirió antes.
  if (yaAdhirioAntes(raw)) {
    if (
      raw.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
      com.includes('ficha') ||
      com.includes('retiro') ||
      com.includes('buscar fichas') ||
      /x\d/i.test(com)
    ) {
      return 'PENDIENTE_RETIRO_FICHAS';
    }
    return 'YA_ADHIRIO_FIRMA_OK';
  }

  // 2. VERIFICACIÓN DE PERSONAS SIN DNI EN CABA O BAJA QUE YA FUERON RESPONDIDAS:
  // Si es < #167 con "No tiene domicilio en CABA" + Adhirió=No, o si ya se le envió el mensaje de referidos CABA,
  // pasa directamente a DESCARTADO_O_BAJA (Archivado / Ya respondido) para salir de la lista de pendientes.
  if (esSinDniCabaYaRespondidoOCerrado(raw)) {
    return 'DESCARTADO_O_BAJA';
  }

  if (
    com.includes('no tiene domicilio en caba') ||
    com.includes('fuera de caba') ||
    com.includes('no vive en caba') ||
    com.includes('extranjero') ||
    com.includes('adhesión digital')
  ) {
    return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
  }
  if (
    com.includes('enferm') ||
    com.includes('salud') ||
    com.includes('vive en ') ||
    com.includes('vive fuera') ||
    com.includes('regresa en ')
  ) {
    if (adh === 'no' || com.includes('vive en ') || com.includes('vive fuera')) {
      return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
    }
    return 'POSTERGO_SALUD_O_VIAJE';
  }

  // Si es un teléfono sin nombre en Google Sheets y aún no se registró envío de 1er contacto
  if (sinNombre && !raw.vocativoOverride?.trim() && raw.primerContactoEnviado !== true) {
    return 'FALTA_NOMBRE_Y_APELLIDO';
  }

  // Si aún NO recibió el primer contacto (#167 en adelante o nuevo ingreso en Sheets)
  if (sinPrimerContacto) {
    return 'SIN_CONTACTAR_1ER_MSJ';
  }

  // Si ya tenía un estado explícito guardado y ya recibió el 1er contacto
  if (raw.estadoFlujo) {
    if (
      (raw.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
        raw.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ') &&
      raw.primerContactoEnviado === true
    ) {
      return '1ER_MSJ_ENVIADO_SIN_RSP';
    }
    if (raw.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' && !sinNombre) {
      // Sigue abajo para inferir su estado con nombre
    } else {
      return raw.estadoFlujo;
    }
  }

  if (com.includes('recordatorio enviado') || com.includes('en camino')) {
    return 'RECORDATORIO_DIA_ENVIADO';
  }

  if (
    com.includes('chile 1408') ||
    com.includes('reunión de los miércoles') ||
    com.includes('punto') ||
    com.includes('fds')
  ) {
    return 'PREFIERE_CAFE_HUB_O_SEDE';
  }

  if (com.includes('pidió más info') || com.includes('mas info')) {
    return 'PIDIO_MAS_INFO_ENVIADA';
  }

  const visitaCompleta = tieneVisitaConcretadaConDatosCompletos({
    adhirio: raw.adhirio,
    comentario: raw.comentario,
    calleOCruce,
    fechasMencionadas,
    estadoFlujo: raw.estadoFlujo,
  });

  if (visitaCompleta) {
    return 'ENCUENTRO_CONFIRMADO';
  }

  const tieneAlgunDatoEnColG =
    tieneNuevaInformacionEnColumnaG(raw.comentario) ||
    Boolean(calleOCruce) ||
    fechasMencionadas.length > 0 ||
    franjaHoraria !== 'Flexible';

  if (rsp === 'sí' || rsp === 'si') {
    if (tieneAlgunDatoEnColG) {
      return 'PASO_DATOS_FALTA_CONFIRMAR';
    }
    return 'RESPONDIO_FALTA_DNI_O_ZONA';
  }

  if (tieneAlgunDatoEnColG) {
    return 'PASO_DATOS_FALTA_CONFIRMAR';
  }

  return '1ER_MSJ_ENVIADO_SIN_RSP';
}


export function procesarContacto(
  rawInput: RawContactRow,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now()
): Contact {
  const rawDesfasado = repararContactoDesfasado(rawInput);
  // Si la dirección en Columna G ("Comentario") no coincide con el barrio de la Columna C,
  // auto-corregir automáticamente al barrio real correspondiente a esa dirección/punto.
  const raw = sincronizarBarrioConDireccionComentario(rawDesfasado);

  const analisisNombre = analizarYCorregirNombreCompleto(raw.nombre);
  const sinNombre = analisisNombre.sinNombre && !raw.vocativoOverride?.trim();
  const primerNombre = raw.vocativoOverride?.trim()
    ? raw.vocativoOverride.trim()
    : analisisNombre.vocativo;
  const nombreCompletoCorregido =
    sinNombre && raw.vocativoOverride?.trim()
      ? raw.vocativoOverride.trim()
      : analisisNombre.nombreCompletoOrdenado;
  const telWA = normalizarTelefonoWA(raw.telRaw);
  const com = (raw.comentario || '').toLowerCase();
  const adh = (raw.adhirio || '').toLowerCase();
  const rsp = (raw.rsp || '').toLowerCase();
  const enSheets = raw.enSheets !== undefined ? raw.enSheets : raw.rsp !== 'Nuevo';

  const calleOCruce = extraerCalleOCruce(raw.comentario);
  const tieneDireccionRealEnComentario = calleOCruce.trim().length > 0;
  const fechasMencionadas = extraerFechasMencionadas(raw.comentario);
  const franjaHoraria = analizarFranjaHoraria(raw.comentario);
  const geo = geocodificarContactoLocal(calleOCruce, raw.barrio, raw.id);

  const adhirioPreviamente = yaAdhirioAntes(raw);
  const sinPrimerContacto = adhirioPreviamente ? false : esContactoSinPrimerContacto(raw);
  const primerContactoEnviado = adhirioPreviamente ? true : !sinPrimerContacto;

  const estadoFlujo = inferirEstadoFlujo(
    raw,
    sinNombre,
    calleOCruce,
    fechasMencionadas,
    franjaHoraria
  );
  const estadoFlujoEtiqueta = obtenerEtiquetaEstadoFlujo(estadoFlujo);

  const fechaRefStr = raw.ultimoContacto || raw.fechaAgregado || '2026-10-16';
  const fechaRefMs = new Date(fechaRefStr).getTime();
  const horasDesdeUltimoContacto = Number.isNaN(fechaRefMs)
    ? 72
    : Math.max(0, Math.round((ahoraMs - fechaRefMs) / (1000 * 60 * 60)));

  const tieneNuevaInfoEnColumnaG = tieneNuevaInformacionEnColumnaG(raw.comentario);
  const visitaCompleta = tieneVisitaConcretadaConDatosCompletos({
    adhirio: adhirioPreviamente ? 'Sí' : raw.adhirio,
    comentario: raw.comentario,
    calleOCruce,
    fechasMencionadas,
    estadoFlujo,
  });
  const esRetiroFichas =
    (adhirioPreviamente || adh === 'sí' || adh === 'si' || estadoFlujo === 'PENDIENTE_RETIRO_FICHAS') &&
    (estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' || com.includes('buscar fichas') || /x\d/i.test(com));
  const esVisitaConcretadaORetiro = visitaCompleta || esRetiroFichas;

  const esCerradoOArchivadoSinDniCaba =
    !adhirioPreviamente &&
    (estadoFlujo === 'DESCARTADO_O_BAJA' || esSinDniCabaYaRespondidoOCerrado(raw));

  const procesoCompletadoSinMensajes =
    (adhirioPreviamente || estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') && !esRetiroFichas;

  let situacion: SituacionContacto = 'SEGUIMIENTO_CAMBIO_CHIP';
  let modalidadSugerida: Contact['modalidadSugerida'] = 'CAFE_HUB';
  let motivoEstrategico = '';
  let prioridadCorte = 3;

  // Reglas de clasificación basadas en el flujo real de César Rincón y EstadoFlujo
  // 1. PRIORIDAD ABSOLUTA: Si ya adhirió antes, marcar como proceso terminado (YA_ADHIRIO) o retiro de fichas extra,
  //    nunca como "Prefiere Punto (Convocar a Café Hub)" ni lista de envío.
  if (
    adhirioPreviamente ||
    adh === 'sí' ||
    adh === 'si' ||
    estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
  ) {
    if (esRetiroFichas) {
      situacion = 'RETIRO_FICHAS';
      modalidadSugerida = 'PUERTA_A_PUERTA';
      motivoEstrategico = `Ya adhirió y juntó fichas adicionales (${calleOCruce || raw.barrio}): coordinar retiro rápido en puerta.`;
      prioridadCorte = 2;
    } else {
      situacion = 'YA_ADHIRIO';
      modalidadSugerida = 'REMOTO_O_BAJA';
      motivoEstrategico = '✅ Proceso terminado (Ya adhirió): no incluir en listas de envío de mensajes.';
      prioridadCorte = 5;
    }
  } else if (esCerradoOArchivadoSinDniCaba || esComentarioDescartadoONoCaba(raw.comentario, estadoFlujo)) {
    situacion = 'DESCARTADO_NO_CABA';
    modalidadSugerida = 'REMOTO_O_BAJA';
    motivoEstrategico = esCerradoOArchivadoSinDniCaba
      ? 'Archivado / Ya respondido (Sin DNI en CABA o Baja): fuera de la lista de pendientes.'
      : 'Sin domicilio DNI en CABA (pendiente de enviar mensaje consultando referidos CABA).';
    prioridadCorte = 5;
  } else if (
    sinPrimerContacto ||
    estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
  ) {
    situacion = 'NUEVO_SIN_PRIMER_MENSAJE';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = sinNombre
      ? 'Teléfono en Sheets sin nombre y sin 1er contacto: enviar 1er mensaje con consulta sutil de nombre y apellido.'
      : `Sin 1er contacto (#${raw.id}): enviar 1er mensaje de presentación y actualizar estado automáticamente.`;
    prioridadCorte = 1;
  } else if (com.includes('enferm') || com.includes('salud') || estadoFlujo === 'POSTERGO_SALUD_O_VIAJE') {
    situacion = 'SITUACION_SALUD';
    modalidadSugerida = 'PUERTA_A_PUERTA';
    motivoEstrategico = 'Situación familiar/salud reportada: seguimiento empático sin presionar.';
    prioridadCorte = 3;
  } else if (
    com.includes('chile 1408') ||
    /reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(com)
  ) {
    situacion = 'EVENTO_CHILE_1408';
    modalidadSugerida = 'PUNTO_ENCUENTRO';
    motivoEstrategico = 'Acordó acercarse a la reunión de los miércoles en la sede de Chile 1408.';
    prioridadCorte = 2;
  } else if (visitaCompleta) {
    situacion = 'VISITA_AGENDADA';
    modalidadSugerida = 'PUERTA_A_PUERTA';
    motivoEstrategico = `Visita concretada con datos completos (${calleOCruce || raw.barrio} · ${
      fechasMencionadas.join('/') || franjaHoraria
    }).`;
    prioridadCorte = 1;
  } else if (com.includes('pidió más info') || com.includes('mas info') || estadoFlujo === 'PIDIO_MAS_INFO_ENVIADA') {
    situacion = 'PIDIO_MAS_INFO';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = 'Pidió información sobre Popurrí en Columna G: falta coordinar punto/dirección de firma.';
    prioridadCorte = 2;
  } else if (
    com.includes('punto') ||
    com.includes('fds') ||
    com.includes('plaza') ||
    estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
  ) {
    situacion = 'PREFIERE_PUNTO';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = 'Expresó en Columna G que prefiere ir a un punto (verificado que NO adhirió antes): proponer café del grupo barrial.';
    prioridadCorte = 2;
  } else if (rsp === 'sí' || rsp === 'si' || tieneNuevaInfoEnColumnaG) {
    situacion = 'SEGUIMIENTO_CAMBIO_CHIP';
    modalidadSugerida = calleOCruce ? 'PUERTA_A_PUERTA' : 'CAFE_HUB';
    motivoEstrategico = tieneNuevaInfoEnColumnaG
      ? `Pasó dato parcial en Columna G (${raw.comentario}) pero es insuficiente para concretar visita: enviar mensaje personalizado para cerrar ${
          calleOCruce ? 'día/hora' : 'dirección o café cercano'
        }.`
      : `Respondió Sí en Columna E pero aún no tiene información cargada en Columna G ni confirmación enviada.`;
    prioridadCorte = 1;
  } else {
    situacion = 'SEGUIMIENTO_SIN_RESPUESTA';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = sinNombre
      ? `1er mensaje enviado (esperando que responda su nombre y apellido + disponibilidad).`
      : `En Sheets sin respuesta tras ${horasDesdeUltimoContacto}h: hacer seguimiento suave proponiendo pasar por su zona o café cercano.`;
    prioridadCorte = 3;
  }

  const intentosEfectivos = raw.intentos ?? (primerContactoEnviado ? 1 : 0);
  const adhirioEfectivo: RawContactRow['adhirio'] =
    adhirioPreviamente || estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ? 'Sí' : raw.adhirio;

  // Regla Card 3 ("RSP: SÍ"): respondieron según Columna E ("RSP" = "Sí"), no adhirieron aún,
  // no tienen todavía ninguna nueva información cargada en Columna G ("Comentario") y no se les envió confirmación de encuentro.
  const esRspSiSinInfoColG =
    primerContactoEnviado &&
    !procesoCompletadoSinMensajes &&
    !esCerradoOArchivadoSinDniCaba &&
    adhirioEfectivo !== 'Sí' &&
    situacion !== 'DESCARTADO_NO_CABA' &&
    (rsp === 'sí' || rsp === 'si') &&
    !tieneNuevaInfoEnColumnaG &&
    estadoFlujo !== 'ENCUENTRO_CONFIRMADO' &&
    estadoFlujo !== 'RECORDATORIO_DIA_ENVIADO';

  // Regla Card 4 ("SIN RSP +48H"): marca temporal +48h sin respuesta en Col. E o con dato insuficiente en Col. G
  const diagnostico48h =
    procesoCompletadoSinMensajes || esCerradoOArchivadoSinDniCaba
      ? undefined
      : diagnosticarYGenerarMensajeSeguimiento48h(
          {
            sinNombre,
            primerNombre,
            barrio: raw.barrio,
            rsp: rsp === 'sí' || rsp === 'si' ? 'Sí' : sinPrimerContacto ? 'Nuevo' : 'No',
            adhirio: adhirioEfectivo === 'Sí' ? 'Sí' : 'Pendiente',
            comentario: raw.comentario,
            calleOCruce,
            franjaHoraria,
            fechasMencionadas,
            primerContactoEnviado,
            horasDesdeUltimoContacto,
            intentos: intentosEfectivos,
            situacion,
            estadoFlujo,
            esVisitaConcretadaORetiro,
            tieneNuevaInfoEnColumnaG,
            lat: geo.lat,
            lng: geo.lng,
          },
          profile,
          ahoraMs
        );

  const esSinRsp48h = Boolean(diagnostico48h?.aplica);
  const tieneDatoInsuficienteEnColG =
    tieneNuevaInfoEnColumnaG &&
    !esVisitaConcretadaORetiro &&
    !procesoCompletadoSinMensajes &&
    !esCerradoOArchivadoSinDniCaba &&
    adhirioEfectivo !== 'Sí' &&
    situacion !== 'DESCARTADO_NO_CABA';

  const tienePuntoEncuentroDeterminado = tienePuntoEncuentroODireccionDeterminada({
    adhirio: adhirioEfectivo,
    estadoFlujo,
    situacion,
    calleOCruce,
    tieneDireccionRealEnComentario,
    comentario: raw.comentario,
  });

  const alertaVencido =
    procesoCompletadoSinMensajes || esCerradoOArchivadoSinDniCaba
      ? undefined
      : detectarAlertaPendienteVencido(
          {
            sinNombre,
            primerNombre,
            barrio: raw.barrio,
            calleOCruce,
            comentario: raw.comentario,
            franjaHoraria,
            fechasMencionadas,
            situacion,
            estadoFlujo,
            adhirio: adhirioEfectivo,
            horasDesdeUltimoContacto,
            lat: geo.lat,
            lng: geo.lng,
          },
          profile,
          ahoraMs
        );

  if (alertaVencido?.activa) {
    motivoEstrategico = `⚠️ ${alertaVencido.titulo}: ${alertaVencido.motivo}`;
    prioridadCorte = 1;
  } else if (diagnostico48h?.aplica) {
    motivoEstrategico = `⏱️ ${diagnostico48h.etiquetaCorta}: ${diagnostico48h.motivoDetallado}`;
  }

  const msgObj = generarMensajeContextual(
    {
      sinNombre,
      primerNombre,
      barrio: raw.barrio,
      calleOCruce,
      comentario: raw.comentario,
      franjaHoraria,
      fechasMencionadas,
      situacion,
      estadoFlujo,
      lat: geo.lat,
      lng: geo.lng,
    },
    profile,
    alertaVencido?.activa ? 'disculpas_y_reprogramacion' : 'auto'
  );

  const mensajeSugeridoFinal = alertaVencido?.activa
    ? alertaVencido.mensajeDisculpasReprogramacion
    : diagnostico48h?.aplica
    ? diagnostico48h.mensajePersonalizado48h
    : msgObj.texto;

  const objetivoMensajeFinal = procesoCompletadoSinMensajes
    ? 'Proceso finalizado (Ya adhirió) — Botones de envío deshabilitados salvo cambio manual de estatus.'
    : esCerradoOArchivadoSinDniCaba
    ? 'Caso Sin DNI en CABA / Baja ya respondido y archivado — Fuera de la lista de pendientes.'
    : alertaVencido?.activa
    ? 'Disculpas / seguimiento de pendiente vencido y propuesta de reprogramación.'
    : diagnostico48h?.aplica
    ? `${diagnostico48h.etiquetaCorta} — Solicitar: ${diagnostico48h.datoFaltanteResumen}`
    : msgObj.objetivo;

  const barrioParaMaps = /chile\s+1408/i.test(calleOCruce || '')
    ? 'Monserrat'
    : raw.barrio || 'Palermo';
  const direccionMaps = calleOCruce
    ? `${calleOCruce}, ${barrioParaMaps ? barrioParaMaps + ', ' : ''}CABA, Argentina`
    : `${barrioParaMaps}, CABA, Argentina`;

  return {
    ...raw,
    adhirio: adhirioEfectivo,
    sinNombre,
    primerNombre,
    nombreCompletoCorregido,
    analisisNombre,
    estadoFlujo,
    estadoFlujoEtiqueta,
    telWA,
    enSheets,
    primerContactoEnviado,
    fechaPrimerContacto: raw.fechaPrimerContacto,
    fechaAgregado: raw.fechaAgregado || '2026-10-15',
    ultimoContacto: raw.ultimoContacto || '2026-10-15',
    horasDesdeUltimoContacto,
    intentos: intentosEfectivos,
    calleOCruce,
    tieneDireccionRealEnComentario,
    tienePuntoEncuentroDeterminado,
    tieneNuevaInfoEnColumnaG,
    tieneDatoInsuficienteEnColG,
    esRspSiSinInfoColG,
    esSinRsp48h,
    esVisitaConcretadaORetiro,
    esCerradoOArchivadoSinDniCaba,
    procesoCompletadoSinMensajes,
    diagnostico48h,
    direccionMaps,
    franjaHoraria,
    fechasMencionadas,
    lat: geo.lat,
    lng: geo.lng,
    tieneCoordenadasExactas: geo.exacta,
    situacion,
    modalidadSugerida,
    motivoEstrategico,
    prioridadCorte,
    tipoPlantillaSugerida: msgObj.tipoUsado,
    mensajeSugerido: mensajeSugeridoFinal,
    objetivoMensaje: objetivoMensajeFinal,
    alertaVencido,
  };
}

/**
 * Resuelve la fecha operativa objetivo (DD/MM) de un contacto respecto del día actual (`ahoraMs`):
 * - Si el contacto tiene varias fechas en Columna G (ej. "20 o 21/10", "21 o 22/10", "21 o 23/10"),
 *   prioriza HOY (`hoyBA.ddmm`) si está incluida, o la próxima fecha futura operativa más cercana.
 * - Si no tiene fecha numérica pero menciona días de la semana ("martes a jueves", "martes o jueves")
 *   sin postergación a otra semana futura, la vincula con el día operativo coincidente.
 */
export function resolverFechaObjetivoContacto(
  c: { fechasMencionadas: string[]; comentario: string },
  ahoraMs: number = Date.now()
): string | undefined {
  const diasProx = [0, 1, 2, 3, 4].map((offset) => sumarDiasAFechaBA(ahoraMs, offset));
  const diasSemanaCompleta = [0, 1, 2, 3, 4, 5, 6].map((offset) => sumarDiasAFechaBA(ahoraMs, offset));
  const hoyBA = diasProx[0];
  const comLow = (c.comentario || '').toLowerCase();

  // Las reuniones en Chile 1408 son los miércoles
  if (comLow.includes('chile 1408') || /reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(comLow)) {
    const matchMiercoles = diasSemanaCompleta.find(
      (d) =>
        d.dayOfWeek === 3 ||
        ['miércoles', 'miercoles'].includes(d.nombreDia.toLowerCase())
    );
    if (matchMiercoles) return matchMiercoles.ddmm;
  }

  if (c.fechasMencionadas && c.fechasMencionadas.length > 0) {
    // 1. Si alguna de las fechas mencionadas es HOY, priorizar HOY sin excepción
    if (c.fechasMencionadas.includes(hoyBA.ddmm)) {
      return hoyBA.ddmm;
    }
    // 2. Si alguna coincide con los próximos días operativos (Mañana, Pasado, etc.), elegir la más próxima
    for (const d of diasProx.slice(1)) {
      if (c.fechasMencionadas.includes(d.ddmm)) {
        return d.ddmm;
      }
    }
    // 3. Si tiene alguna otra fecha futura respecto de hoy
    const futura = c.fechasMencionadas.find((f) => compararFechaDDMMConHoyBA(f, hoyBA) > 0);
    if (futura) return futura;
    // 4. Si sólo tiene fechas pasadas, devolver la más reciente
    return c.fechasMencionadas[c.fechasMencionadas.length - 1];
  }

  if (!comLow || comLow.includes('semana del ')) return undefined;

  const dispRango = analizarDisponibilidadColumnaG(c.comentario);
  const minActualHoy = hoyBA.hour * 60 + hoyBA.minute;
  const yaPasoVentanaHoy =
    dispRango.minFinVentana !== undefined
      ? minActualHoy >= dispRango.minFinVentana - 15
      : minActualHoy >= 18 * 60;
  const diasBusquedaRango = yaPasoVentanaHoy ? diasProx.slice(1, 4) : diasProx.slice(0, 3);

  if (comLow.includes('martes a jueves')) {
    const matchDia = diasBusquedaRango.find((d) =>
      ['martes', 'miércoles', 'miercoles', 'jueves'].includes(d.nombreDia.toLowerCase())
    );
    if (matchDia) return matchDia.ddmm;
  }
  if (comLow.includes('martes o jueves')) {
    const matchDia = diasBusquedaRango.find((d) =>
      ['martes', 'jueves'].includes(d.nombreDia.toLowerCase())
    );
    if (matchDia) return matchDia.ddmm;
  }
  return undefined;
}

export function obtenerRangoHorarioEfectivoContacto(c: Contact): {
  minIni: number;
  minFin: number;
  horaPuntualMin?: number;
  turno: 'AM' | 'PM' | 'FLEX';
} {
  const disp = analizarDisponibilidadColumnaG(c.comentario);
  if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
    const min = horaAMinutosDelDia(disp.horaPuntualPactada);
    return {
      minIni: Math.max(8 * 60, min - 60),
      minFin: Math.min(20 * 60 + 30, min + 75),
      horaPuntualMin: min,
      turno: min < 14 * 60 ? 'AM' : 'PM',
    };
  }
  if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
    const amplitud = disp.minFinVentana - disp.minInicioVentana;
    const turno =
      amplitud >= 360
        ? 'FLEX'
        : disp.minFinVentana <= 14 * 60 + 15
        ? 'AM'
        : disp.minInicioVentana >= 14 * 60
        ? 'PM'
        : 'FLEX';
    return {
      minIni: disp.minInicioVentana,
      minFin: disp.minFinVentana,
      turno,
    };
  }
  if (c.franjaHoraria === 'Mañana') {
    return { minIni: 8 * 60 + 30, minFin: 12 * 60 + 30, turno: 'AM' };
  }
  if (c.franjaHoraria === 'Mediodía') {
    return { minIni: 12 * 60, minFin: 14 * 60 + 30, turno: 'AM' };
  }
  if (c.franjaHoraria === 'Tarde') {
    return { minIni: 14 * 60 + 30, minFin: 18 * 60 + 30, turno: 'PM' };
  }
  if (c.franjaHoraria === 'Vespertino') {
    return { minIni: 17 * 60 + 30, minFin: 20 * 60 + 30, turno: 'PM' };
  }
  return { minIni: 9 * 60, minFin: 20 * 60, turno: 'FLEX' };
}

export function sonHorariosCompatiblesEnCircuito(
  miembrosExistentes: Contact[],
  candidato: Contact
): boolean {
  const rCand = obtenerRangoHorarioEfectivoContacto(candidato);
  let maxIni = rCand.minIni;
  let minFin = rCand.minFin;

  for (const m of miembrosExistentes) {
    const rM = obtenerRangoHorarioEfectivoContacto(m);
    if (rCand.turno !== 'FLEX' && rM.turno !== 'FLEX' && rCand.turno !== rM.turno) {
      return false;
    }
    // Si ambos tienen hora puntual fija, no deben estar separados por más de 90 minutos
    if (rCand.horaPuntualMin !== undefined && rM.horaPuntualMin !== undefined) {
      if (Math.abs(rCand.horaPuntualMin - rM.horaPuntualMin) > 90) {
        return false;
      }
    }
    maxIni = Math.max(maxIni, rM.minIni);
    minFin = Math.min(minFin, rM.minFin);
  }

  // Debe existir intersección real entre las ventanas horarias de todos los integrantes del circuito
  return maxIni <= minFin + 15;
}

export function obtenerTurnoMacroContacto(c: Contact): 'AM' | 'PM' | 'FLEX' {
  return obtenerRangoHorarioEfectivoContacto(c).turno;
}

/**
 * Algoritmo de Micro-Clustering Geoespacial + Fecha en Columna G + Franja Horaria Compatible
 * Reglas clave:
 * 1. SÓLO considera personas que AÚN NO HAN ADHERIDO (c.adhirio !== 'Sí') y no están archivadas/descartadas.
 * 2. SÓLO considera personas que tienen una DIRECCIÓN o PUNTO DE ENCUENTRO cargado en la Columna "G" ("Comentario")
 *    del Google Sheets (no contempla contactos que sólo tienen el barrio sin dirección en Columna G).
 * 3. Al agrupar, respeta las fechas contenidas en la Columna "G" ("Comentario") y separa turnos/ventanas incompatibles
 *    (Mañana/Mediodía vs Tarde/Vespertino) para que citas matutinas (ej: Laura Masson 10:00 hs) tengan su propio bloque.
 */

