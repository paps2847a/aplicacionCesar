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
import { analizarYCorregirNombreCompleto, esCeldaSinNombre } from './nameCorrection';
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
    label: '1. Nuevo · Sin 1er mensaje',
    shortLabel: '1. Nuevo · Sin 1er mensaje',
    colorClass: 'bg-amber-100 text-amber-950 border-amber-300',
  },
  {
    value: 'FALTA_NOMBRE_Y_APELLIDO',
    label: '1b. Nuevo · Falta Nombre',
    shortLabel: '1b. Nuevo · Falta Nombre',
    colorClass: 'bg-rose-100 text-rose-950 border-rose-300',
  },
  {
    value: '1ER_MSJ_ENVIADO_SIN_RSP',
    label: '2. 1er Msj Enviado · Esperando respuesta',
    shortLabel: '2. 1er Msj Enviado · Esperando respuesta',
    colorClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  {
    value: 'RESPONDIO_FALTA_DNI_O_ZONA',
    label: '3. Respondió · Falta calle/esquina o día',
    shortLabel: '3. Respondió · Falta calle/esquina o día',
    colorClass: 'bg-orange-100 text-orange-950 border-orange-300',
  },
  {
    value: 'PIDIO_MAS_INFO_ENVIADA',
    label: '3b. Pidió más info (5 ejes enviados)',
    shortLabel: '3b. Pidió más info (5 ejes enviados)',
    colorClass: 'bg-sky-50 text-sky-900 border-sky-300',
  },
  {
    value: 'PREFIERE_CAFE_HUB_O_SEDE',
    label: '3c. Prefiere Punto / Café / Sede',
    shortLabel: '3c. Prefiere Punto / Café / Sede',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  {
    value: 'PASO_DATOS_FALTA_CONFIRMAR',
    label: '4. Pasó dirección/horario · Falta confirmar',
    shortLabel: '4. Pasó dirección/horario · Falta confirmar',
    colorClass: 'bg-sky-100 text-sky-950 border-sky-300',
  },
  {
    value: 'ENCUENTRO_CONFIRMADO',
    label: '5. Encuentro Confirmado (En Ruta)',
    shortLabel: '5. Encuentro Confirmado (En Ruta)',
    colorClass: 'bg-indigo-100 text-indigo-950 border-indigo-300',
  },
  {
    value: 'RECORDATORIO_DIA_ENVIADO',
    label: '6. Recordatorio / En Camino Enviado',
    shortLabel: '6. Recordatorio / En Camino Enviado',
    colorClass: 'bg-teal-100 text-teal-950 border-teal-300',
  },
  {
    value: 'PENDIENTE_RETIRO_FICHAS',
    label: '7. Llevó Fichas Extra · Pendiente Retiro',
    shortLabel: '7. Llevó Fichas Extra · Pendiente Retiro',
    colorClass: 'bg-emerald-200 text-emerald-950 border-emerald-400',
  },
  {
    value: 'POSTERGO_SALUD_O_VIAJE',
    label: '8. En Pausa (Viaje / Salud / Más adelante)',
    shortLabel: '8. En Pausa (Viaje / Salud / Más adelante)',
    colorClass: 'bg-purple-100 text-purple-950 border-purple-300',
  },
  {
    value: 'YA_ADHIRIO_FIRMA_OK',
    label: '9. ✅ Ya Firmó · Adhesión Completada',
    shortLabel: '9. ✅ Ya Firmó · Adhesión Completada',
    colorClass: 'bg-emerald-100 text-emerald-950 border-emerald-400',
  },
  {
    value: 'SIN_DNI_CABA_PEDIR_REFERIDOS',
    label: '10. Sin DNI en CABA · Pedir Referidos',
    shortLabel: '10. Sin DNI en CABA · Pedir Referidos',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  {
    value: 'DESCARTADO_O_BAJA',
    label: '11. Baja / Número Inválido / Descartado',
    shortLabel: '11. Baja / Número Inválido / Descartado',
    colorClass: 'bg-red-50 text-red-800 border-red-200',
  },
];

export function obtenerEtiquetaEstadoFlujo(estado: EstadoFlujo): string {
  const encontrado = ESTADOS_FLUJO_CATALOGO.find((e) => e.value === estado);
  if (encontrado) return encontrado.label;
  if (estado === 'SEGUNDO_SEGUIMIENTO_SIN_RSP') return '2. 1er Msj Enviado · Esperando respuesta';
  if (estado === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO') return '9. ✅ Ya Firmó · Adhesión Completada';
  return '2. 1er Msj Enviado · Esperando respuesta';
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
  // Coincidencia prioritaria por prefijo numérico / código exacto de los 14 chips de Google Sheets
  if (/^0\b|falta nombre|sin nombre|pedir nombre|^1b\b/i.test(low))
    return 'FALTA_NOMBRE_Y_APELLIDO';
  if (/^1\.\s*nuevo|sin contactar|sin 1er mensaje|enviar 1er/i.test(low))
    return 'SIN_CONTACTAR_1ER_MSJ';
  if (/^2b\b|2°\s*seguimiento|2do\s*seguimiento|segundo seguimiento/i.test(low))
    return 'SEGUNDO_SEGUIMIENTO_SIN_RSP';
  if (/^2\.\s*1er|1er mensaje enviado|1er msj enviado|esperando respuesta/i.test(low))
    return '1ER_MSJ_ENVIADO_SIN_RSP';
  if (/^3\.\s*respondi|validar dni|falta calle|falta corroborar|cambio de chip/i.test(low))
    return 'RESPONDIO_FALTA_DNI_O_ZONA';
  if (/^3b\b|m[aá]s info/i.test(low))
    return 'PIDIO_MAS_INFO_ENVIADA';
  if (/^4\.\s*datos pasados|^4\.\s*pas[oó]|datos pasados|proponer visita|falta confirmar/i.test(low))
    return 'PASO_DATOS_FALTA_CONFIRMAR';
  if (/^5\.\s*visita\/caf[eé]|^3c\b|visita\/caf[eé] propuesto|esperando ok|prefiere punto/i.test(low))
    return 'PREFIERE_CAFE_HUB_O_SEDE';
  if (/^6\.\s*encuentro|^5\.\s*encuentro|encuentro agendado|encuentro confirmado|confirmado/i.test(low))
    return 'ENCUENTRO_CONFIRMADO';
  if (/^7\.\s*recordatorio|^6\.\s*recordatorio|recordatorio|en camino/i.test(low))
    return 'RECORDATORIO_DIA_ENVIADO';
  if (/^8\.\s*en espera de retiro|^7\.\s*llev[oó] fichas|retiro de fichas|fichas|x1|x2|x3/i.test(low))
    return 'PENDIENTE_RETIRO_FICHAS';
  if (/^9b\b|agradecimiento enviado/i.test(low))
    return 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO';
  if (
    /^9\.\s*¡?ya adhir|^9\.\s*✅|ya adhirió|ya firmó|adhesión completada|proceso terminado|ficha firmada|firmada|firmó/i.test(
      low
    )
  )
    return 'YA_ADHIRIO_FIRMA_OK';
  if (/^10\.\s*sin dni|sin dni|referidos/i.test(low))
    return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
  if (/^11\.\s*baja|archivado|ya respondido|baja|descartado|inv[aá]lido/i.test(low))
    return 'DESCARTADO_O_BAJA';
  if (/salud|viaje|pausa/i.test(low))
    return 'POSTERGO_SALUD_O_VIAJE';
  if (low.includes('punto') || low.includes('café') || low.includes('sede'))
    return 'PREFIERE_CAFE_HUB_O_SEDE';
  if (low.includes('respondió')) return 'RESPONDIO_FALTA_DNI_O_ZONA';
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
 * Verifica si un contacto YA ADHIRIÓ antes (según estado explícito 8/9/9B, Columna F "Adhirió" = "Sí",
 * o nota explícita en Columna G de haber firmado). Si el contacto tiene un `estadoFlujo` explícito
 * distinto de 8/9/9B (por ejemplo `4. Datos pasados · Proponer Visita/Café`), se respeta ese estado explícito.
 */
export function yaAdhirioAntes(raw: {
  adhirio?: string;
  estadoFlujo?: EstadoFlujo;
  comentario?: string;
}): boolean {
  if (raw.estadoFlujo !== undefined) {
    return (
      raw.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
      raw.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO' ||
      raw.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
    );
  }
  const adh = (raw.adhirio || '').toLowerCase().trim();
  if (/^(s[ií]|firm[oó]|firmad[oa]|adherid[oa])$/i.test(adh)) return true;
  const com = (raw.comentario || '').toLowerCase().trim();
  return /\b(ya\s+adhir[ií]o|ya\s+firm[oó]|firm[oó]\s+el\s+\d|adhesi[oó]n\s+firmada|ficha\s+firmada|proceso\s+terminado)\b/i.test(
    com
  );
}

export function esComentarioDescartadoONoCaba(comentario: string, estadoFlujo?: EstadoFlujo): boolean {
  if (estadoFlujo !== undefined) {
    return (
      estadoFlujo === 'DESCARTADO_O_BAJA' ||
      estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS'
    );
  }
  const com = (comentario || '').toLowerCase().trim();
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
 * Determina si una persona marcada con baja/teléfono inválido o sin DNI en CABA ya fue cerrada/archivada:
 * - Si tiene estado explícito `DESCARTADO_O_BAJA` (`11. Baja / Número Inválido / Descartado`), está archivada.
 * - Si tiene estado explícito `SIN_DNI_CABA_PEDIR_REFERIDOS` (`10. Sin DNI CABA (Pedir Referidos)`), permanece
 *   en el estado 10 a menos que se haya registrado `referidosCabaYaEnviado === true`.
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

  if (raw.estadoFlujo === 'DESCARTADO_O_BAJA') {
    return true;
  }

  if (raw.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS') {
    if (
      raw.referidosCabaYaEnviado === true ||
      /referidos\s+caba\s+consultados|ya\s+respondido|\[cerrado/i.test(com)
    ) {
      return true;
    }
    return false;
  }

  if (raw.estadoFlujo !== undefined) {
    return false;
  }

  if (
    com.includes('no existe en whatsapp') ||
    com.includes('número equivocado') ||
    /\bbaja\b/i.test(com)
  ) {
    return true;
  }

  if (
    raw.referidosCabaYaEnviado === true ||
    /referidos\s+caba\s+consultados|ya\s+respondido|\[cerrado/i.test(com)
  ) {
    return true;
  }

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
    .replace(/\[(?:1er\s*(?:mensaje|msj|contacto)|Intento auto|Enviado|Reintentar)[^\]]*\]/gi, '')
    .replace(/ingresad[oa] en google sheets[^·;\n]*/gi, '')
    .replace(/tel[eé]fono (?:cargado|registrado) en google sheets[^·;\n]*/gi, '')
    .replace(/pendiente de 1er contacto/gi, '')
    .replace(/1er\s*(?:mensaje|msj|contacto)\s*(?:auto\s*)?enviado[^·;\n\]]*/gi, '')
    .replace(/^sin respuesta\.?$/gi, '')
    .replace(/^no contesta\.?$/gi, '')
    .replace(/[—\-·,;:\[\]\s]+/g, '')
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

  if (raw.estadoFlujo !== undefined) {
    if (
      raw.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
      raw.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
    ) {
      return raw.primerContactoEnviado !== true;
    }
    return false;
  }

  if (raw.primerContactoEnviado === true) return false;

  const rsp = (raw.rsp || '').toLowerCase().trim();
  const com = (raw.comentario || '').toLowerCase().trim();
  const numId = extraerNumeroIdContacto(raw.id);

  // Si el usuario lo marcó explícitamente como "Nuevo / Sin 1er mensaje" en la App
  if (raw.primerContactoEnviado === false && rsp === 'nuevo') {
    return true;
  }

  if (esComentarioDescartadoONoCaba(raw.comentario, raw.estadoFlujo)) return false;
  if (rsp === 'sí' || rsp === 'si') return false;

  const sinNom = esCeldaSinNombre(raw.nombre);
  const tieneInfoRealColG = tieneNuevaInformacionEnColumnaG(raw.comentario || '');
  const esIdSinNombreEspecial = /^s\/n/i.test((raw.id || '').trim());

  if (
    (esIdSinNombreEspecial || sinNom) &&
    !tieneInfoRealColG &&
    !com.includes('1er mensaje enviado') &&
    !com.includes('1er msj') &&
    !com.includes('sin respuesta') &&
    !com.includes('no contesta')
  ) {
    return true;
  }

  // Regla histórica: contactos #1 al #166 ya fueron contactados salvo que su RSP sea explícitamente 'Nuevo'
  if (numId > 0 && numId < UMBRAL_ID_SIN_PRIMER_CONTACTO && rsp !== 'nuevo') {
    return false;
  }

  if (raw.primerContactoEnviado === false) return true;

  if (rsp === 'nuevo' || raw.enSheets === false) {
    return true;
  }

  if (numId >= UMBRAL_ID_SIN_PRIMER_CONTACTO) {
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

/**
 * Analiza los datos de las Columnas B (Nombre), E (RSP), F (Adhirió) y G (Comentario)
 * de cada contacto para determinar su EstadoFlujo exacto dentro de las 14 categorías oficiales.
 */
export function analizarEstadoPorColumnasEFG(params: {
  id?: string;
  nombre?: string;
  rsp?: string;
  adhirio?: string;
  comentario?: string;
  estadoColH?: string;
  primerContactoEnviado?: boolean;
  vocativoOverride?: string;
}): EstadoFlujo {
  const nom = String(params.nombre || '').trim();
  const sinNom = esCeldaSinNombre(nom) && !String(params.vocativoOverride || '').trim();
  const rspLow = String(params.rsp || '').toLowerCase().trim();
  const adhLow = String(params.adhirio || '').toLowerCase().trim();
  const com = String(params.comentario || '').trim();
  const comLow = com.toLowerCase();
  const estH = String(params.estadoColH || '').trim();
  const estHLow = estH.toLowerCase();
  const numId = extraerNumeroIdContacto(params.id || '');

  // 1. ADHESIÓN COMPLETADA O RETIRO DE FICHAS EXTRA (Columna F = "Sí" o nota de firma en Columna G)
  const firmoEnComentario =
    /\b(ya\s+adhir[ií]o|ya\s+firm[oó]|firm[oó]\s+el\s+\d|adhesi[oó]n\s+firmada|ficha\s+firmada|proceso\s+terminado)\b/i.test(
      comLow
    );
  if (adhLow === 'sí' || adhLow === 'si' || firmoEnComentario || estHLow.startsWith('9.')) {
    if (
      comLow.includes('buscar fichas') ||
      /\bfichas\s*x\d/i.test(comLow) ||
      /\bx[123]\b/i.test(comLow) ||
      estHLow.startsWith('7. llev')
    ) {
      return 'PENDIENTE_RETIRO_FICHAS';
    }
    return 'YA_ADHIRIO_FIRMA_OK';
  }

  if (estHLow.startsWith('7. llev')) {
    return 'PENDIENTE_RETIRO_FICHAS';
  }

  // 2. EN PAUSA (Viaje / Salud / Más adelante: "regresa en diciembre", "enferma", "salud")
  if (
    comLow.includes('enferm') ||
    comLow.includes('salud') ||
    comLow.includes('regresa en') ||
    comLow.includes('viaje') ||
    comLow.includes('más adelante') ||
    estHLow.startsWith('8. en pausa')
  ) {
    return 'POSTERGO_SALUD_O_VIAJE';
  }

  // 3. BAJA / NÚMERO INVÁLIDO / DESCARTADO
  if (
    comLow.includes('no existe en whatsapp') ||
    comLow.includes('inexistente en whatsapp') ||
    comLow.includes('número equivocado') ||
    comLow.includes('adhesión digital') ||
    comLow.includes('vive en eeuu') ||
    comLow.includes('vive en brasil') ||
    comLow.includes('vive en españa') ||
    comLow.includes('vive fuera') ||
    comLow.includes('tiene domicilio fuera de caba') ||
    /\bbaja\b/i.test(comLow)
  ) {
    return 'DESCARTADO_O_BAJA';
  }

  // 4. SIN DNI EN CABA · PEDIR REFERIDOS
  if (
    comLow.includes('no tiene domicilio en caba') ||
    comLow.includes('sin dni en caba') ||
    comLow.includes('fuera de caba') ||
    comLow.includes('no vive en caba') ||
    comLow.includes('dni extranjero') ||
    comLow.includes('extranjero') ||
    comLow.includes('vive afuera')
  ) {
    return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
  }

  if (adhLow === 'no' && !comLow.includes('coordinar encuentro en caba')) {
    if (estHLow.includes('sin dni')) return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
    return 'DESCARTADO_O_BAJA';
  }

  // 5. RECORDATORIO / EN CAMINO ENVIADO (6)
  if (
    comLow.includes('recordatorio enviado') ||
    comLow.includes('en camino') ||
    estHLow.startsWith('6. recordatorio') ||
    estHLow.startsWith('7. recordatorio')
  ) {
    return 'RECORDATORIO_DIA_ENVIADO';
  }

  // 6. ENCUENTRO CONFIRMADO (EN RUTA) (5)
  if (
    /\bconfirmad[oa]\b/i.test(comLow) ||
    estHLow.startsWith('5. encuentro confirmado') ||
    estHLow.startsWith('6. encuentro agendado')
  ) {
    return 'ENCUENTRO_CONFIRMADO';
  }

  // 7. 3b. PIDIÓ MÁS INFO (5 EJES ENVIADOS)
  if (
    comLow.includes('pidió más info') ||
    comLow.includes('mas info') ||
    estHLow.startsWith('3b.')
  ) {
    return 'PIDIO_MAS_INFO_ENVIADA';
  }

  // 8. 3c. PREFIERE PUNTO / CAFÉ / SEDE
  if (
    comLow.includes('prefiere pasar por un punto') ||
    comLow.includes('pasar por un punto') ||
    comLow.includes('chile 1408') ||
    comLow.includes('reunión de los miércoles') ||
    estHLow.startsWith('3c.')
  ) {
    return 'PREFIERE_CAFE_HUB_O_SEDE';
  }

  // 9. EVALUAR DATOS DE DIRECCIÓN Y DÍA/HORARIO EN COLUMNA G (para distinguir 4 vs 3)
  const parenMatch = com.match(/\(([^)]+)\)/);
  const tieneDireccionOCalle =
    (Boolean(parenMatch) && !/visita\s+consertada/i.test(parenMatch![1])) ||
    /visita\s+con[sc]ertada/i.test(comLow) ||
    Boolean(extraerCalleOCruce(com));

  const tieneDiaOHorario =
    /\b\d{1,2}\/\d{1,2}\b/.test(comLow) ||
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(comLow) ||
    /\bcualquier\s+d[ií]a\b/i.test(comLow) ||
    /\b(a\s+las\s+\d|entre\s+las?\s+\d|de\s+\d{1,2}\s+a\s+\d{1,2}|luego\s+de\s+las|despu[eé]s\s+de\s+las|antes\s+de\s+las)\b/i.test(
      comLow
    ) ||
    /visita\s+con[sc]ertada/i.test(comLow);

  if (rspLow === 'sí' || rspLow === 'si' || comLow.includes('coordinar encuentro en caba')) {
    if (tieneDireccionOCalle && tieneDiaOHorario) {
      return 'PASO_DATOS_FALTA_CONFIRMAR';
    }
    return 'RESPONDIO_FALTA_DNI_O_ZONA';
  }

  if (tieneDireccionOCalle && tieneDiaOHorario) {
    return 'PASO_DATOS_FALTA_CONFIRMAR';
  }

  // 10. ¿YA FUE CONTACTADO (2. 1er Msj Enviado · Esperando respuesta) O ES NUEVO (1 / 1b)?
  const fueContactadoSegunColH =
    estHLow.startsWith('2.') ||
    estHLow.startsWith('2b.') ||
    estHLow.includes('1er msj enviado') ||
    estHLow.includes('1er mensaje enviado') ||
    estHLow.includes('seguimiento enviado');

  const fueContactadoSegunCom =
    comLow.includes('1er msj') ||
    comLow.includes('1er mensaje') ||
    comLow.includes('sin respuesta') ||
    comLow.includes('no contesta');

  const esHistorico1a166 =
    numId > 0 && numId < UMBRAL_ID_SIN_PRIMER_CONTACTO && rspLow !== 'nuevo';

  if (
    params.primerContactoEnviado === true ||
    fueContactadoSegunColH ||
    fueContactadoSegunCom ||
    esHistorico1a166
  ) {
    return '1ER_MSJ_ENVIADO_SIN_RSP';
  }

  if (sinNom) {
    return 'FALTA_NOMBRE_Y_APELLIDO';
  }
  return 'SIN_CONTACTAR_1ER_MSJ';
}

export function inferirEstadoFlujo(
  raw: RawContactRow,
  sinNombre: boolean,
  calleOCruce: string,
  fechasMencionadas: string[],
  franjaHoraria: FranjaHoraria
): EstadoFlujo {
  const com = (raw.comentario || '').toLowerCase();
  const adh = (raw.adhirio || '').toLowerCase().trim();
  const rsp = (raw.rsp || '').toLowerCase().trim();

  // Si el contacto ya trae un estado explícito desde Google Sheets (Columna H) o desde la App,
  // respetarlo de forma 1:1 (normalizando únicamente alias heredados).
  if (raw.estadoFlujo !== undefined) {
    if (raw.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' && sinNombre) {
      return 'FALTA_NOMBRE_Y_APELLIDO';
    }
    if (raw.estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP') {
      return '1ER_MSJ_ENVIADO_SIN_RSP';
    }
    if (raw.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO') {
      return 'YA_ADHIRIO_FIRMA_OK';
    }
    return raw.estadoFlujo;
  }

  // Si Columna F ("Adhirió") es "Sí" y no hay estadoFlujo explícito, garantizar estado 7 (Llevó Fichas Extra) o 9 (Ya Firmó)
  if (adh === 'sí' || adh === 'si') {
    if (
      com.includes('buscar fichas') ||
      /\bfichas\s*x\d/i.test(com) ||
      /\bx[123]\b/i.test(com)
    ) {
      return 'PENDIENTE_RETIRO_FICHAS';
    }
    return 'YA_ADHIRIO_FIRMA_OK';
  }

  const sinPrimerContacto = esContactoSinPrimerContacto(raw);

  // 1. VERIFICACIÓN PRIORITARIA DE ADHESIÓN PREVIA (cuando no hay estadoFlujo explícito):
  if (yaAdhirioAntes(raw)) {
    if (com.includes('buscar fichas') || /x\d/i.test(com)) {
      return 'PENDIENTE_RETIRO_FICHAS';
    }
    return 'YA_ADHIRIO_FIRMA_OK';
  }

  // 2. VERIFICACIÓN DE PERSONAS SIN DNI EN CABA O BAJA QUE YA FUERON RESPONDIDAS:
  if (esSinDniCabaYaRespondidoOCerrado(raw)) {
    return 'DESCARTADO_O_BAJA';
  }

  if (
    com.includes('no tiene domicilio en caba') ||
    com.includes('sin dni en caba') ||
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
    com.includes('regresa en ')
  ) {
    return 'POSTERGO_SALUD_O_VIAJE';
  }
  if (com.includes('vive en ') || com.includes('vive fuera')) {
    return 'SIN_DNI_CABA_PEDIR_REFERIDOS';
  }

  // Si aún NO recibió el primer contacto (#167 en adelante o marcado como Nuevo)
  if (sinPrimerContacto) {
    if (sinNombre && !raw.vocativoOverride?.trim()) {
      return 'FALTA_NOMBRE_Y_APELLIDO';
    }
    return 'SIN_CONTACTAR_1ER_MSJ';
  }

  const tieneAlgunDatoEnColG =
    tieneNuevaInformacionEnColumnaG(raw.comentario) ||
    Boolean(calleOCruce) ||
    fechasMencionadas.length > 0 ||
    franjaHoraria !== 'Flexible';

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

  const calleOCruce = (raw.calleOCruce || '').trim() || extraerCalleOCruce(raw.comentario);
  const tieneDireccionRealEnComentario = calleOCruce.trim().length > 0;
  const comentarioParaAgenda = (raw.comentario || '')
    .replace(/\[(?:1er\s*(?:mensaje|msj|contacto)|Intento auto|Enviado|Reintentar)[^\]]*\]/gi, '')
    .replace(/1er\s*(?:mensaje|msj|contacto)\s*(?:auto\s*)?enviado[^·;\n]*/gi, '');
  const fechasMencionadas = extraerFechasMencionadas(comentarioParaAgenda);
  const franjaHoraria = analizarFranjaHoraria(comentarioParaAgenda);
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
    estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
    (raw.estadoFlujo === undefined &&
      (adhirioPreviamente || adh === 'sí' || adh === 'si') &&
      (com.includes('buscar fichas') || /x\d/i.test(com)));
  const esVisitaConcretadaORetiro = visitaCompleta || esRetiroFichas;

  const esCerradoOArchivadoSinDniCaba =
    !adhirioPreviamente &&
    (estadoFlujo === 'DESCARTADO_O_BAJA' || esSinDniCabaYaRespondidoOCerrado(raw));

  const procesoCompletadoSinMensajes =
    (adhirioPreviamente ||
      estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
      estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO') &&
    !esRetiroFichas;

  let situacion: SituacionContacto = 'SEGUIMIENTO_CAMBIO_CHIP';
  let modalidadSugerida: Contact['modalidadSugerida'] = 'CAFE_HUB';
  let motivoEstrategico = '';
  let prioridadCorte = 3;

  // Reglas de clasificación basadas en el flujo real de César Rincón y EstadoFlujo
  // 1. PRIORIDAD ABSOLUTA: Si ya adhirió antes, marcar como proceso terminado (YA_ADHIRIO) o retiro de fichas extra,
  //    nunca como "Prefiere Punto (Convocar a Café Hub)" ni lista de envío.
  if (
    adhirioPreviamente ||
    estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO' ||
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
  } else if (
    estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    (raw.estadoFlujo === undefined && visitaCompleta)
  ) {
    situacion = 'VISITA_AGENDADA';
    modalidadSugerida = 'PUERTA_A_PUERTA';
    motivoEstrategico = `Visita concretada con datos completos (${calleOCruce || raw.barrio} · ${
      fechasMencionadas.join('/') || franjaHoraria
    }).`;
    prioridadCorte = 1;
  } else if (com.includes('pidió más info') || com.includes('mas info') || estadoFlujo === 'PIDIO_MAS_INFO_ENVIADA') {
    situacion = 'PIDIO_MAS_INFO';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = 'Pidió información sobre Popurrí en Comentario: falta coordinar punto/dirección de firma.';
    prioridadCorte = 2;
  } else if (
    estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    (raw.estadoFlujo === undefined &&
      (com.includes('punto') || com.includes('fds') || com.includes('plaza')))
  ) {
    situacion = 'PREFIERE_PUNTO';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = 'Visita/Café propuesto o prefiere acercarse a un punto: esperando confirmación de horario/lugar.';
    prioridadCorte = 2;
  } else if (
    estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
    estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
    (raw.estadoFlujo === undefined && (rsp === 'sí' || rsp === 'si' || tieneNuevaInfoEnColumnaG))
  ) {
    situacion = 'SEGUIMIENTO_CAMBIO_CHIP';
    modalidadSugerida = calleOCruce ? 'PUERTA_A_PUERTA' : 'CAFE_HUB';
    motivoEstrategico = tieneNuevaInfoEnColumnaG
      ? `Datos pasados en Comentario (${raw.comentario}): proponer o confirmar visita de 2 min o café cercano.`
      : `Respondió Sí: validar DNI en CABA y pedir esquina/zona y disponibilidad.`;
    prioridadCorte = 1;
  } else {
    situacion = 'SEGUIMIENTO_SIN_RESPUESTA';
    modalidadSugerida = 'CAFE_HUB';
    motivoEstrategico = sinNombre
      ? `1er mensaje enviado (esperando que responda su nombre y apellido + disponibilidad).`
      : `En Sheets sin respuesta tras ${horasDesdeUltimoContacto}h: hacer seguimiento suave proponiendo pasar por su zona o café cercano.`;
    prioridadCorte = 3;
  }

  const intentosEfectivos =
    raw.intentos ??
    (estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP' ? 2 : primerContactoEnviado ? 1 : 0);
  const adhirioEfectivo: RawContactRow['adhirio'] =
    adhirioPreviamente ||
    estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO'
      ? 'Sí'
      : estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
          estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
          estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
          estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
          estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
          estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ||
          estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP' ||
          estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
          estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO'
        ? 'Pendiente'
        : raw.adhirio;

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

