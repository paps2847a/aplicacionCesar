import { EstadoFlujo, SituacionContacto, VoiceProfile } from '../../types';
import {
  AlertaPendienteVencido,
  Contact,
  FranjaHoraria,
  TipoAlertaPendienteVencido,
} from '../../types';
import { extraerCalleOCruce } from '../geo/cabaLocations';
import { DIAS_SEMANA_ES } from '../messaging/messageTemplates';
import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';
import { OpcionesCafeMensaje, describirCafeConDistanciaDesdeContacto } from '../geo/cafesHub';

export function extraerFechasMencionadas(comentario: string): string[] {
  if (!comentario) return [];
  const text = String(comentario);
  const encontradas: string[] = [];
  const agregarFecha = (dStr: string | number, mStr: string | number) => {
    const d = Number(dStr);
    const m = Number(mStr);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const ddmm = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
      if (!encontradas.includes(ddmm)) {
        encontradas.push(ddmm);
      }
    }
  };

  // 1. Expresiones compuestas con conjunción ("20 o 21/10", "21 o 22/10", "21 o 23/10", "20, 21 o 22/10", "21 y 22/10")
  const regexCompuesta =
    /\b(\d{1,2})\s*(?:,\s*(\d{1,2})\s*)?(?:o|u|y|e)\s*(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/gi;
  for (const m of text.matchAll(regexCompuesta)) {
    const mes = m[4];
    agregarFecha(m[1], mes);
    if (m[2]) agregarFecha(m[2], mes);
    agregarFecha(m[3], mes);
  }

  // 2. Rangos de días que comparten mes ("del 20 al 22/10", "entre el 20 y 24/10", "entre el 21 y el 23/10")
  const regexRangoDias =
    /\b(?:del|entre(?:\s+el)?)\s+(\d{1,2})\s+(?:al|a|y(?:\s+el)?|-)\s*(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/gi;
  for (const m of text.matchAll(regexRangoDias)) {
    const d1 = Number(m[1]);
    const d2 = Number(m[2]);
    const mes = m[3];
    if (d2 >= d1 && d2 - d1 <= 10) {
      for (let d = d1; d <= d2; d++) {
        agregarFecha(d, mes);
      }
    }
  }

  // 3. Fechas directas DD/MM o DD/MM/YYYY
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    agregarFecha(m[1], m[2]);
  }

  return encontradas;
}

/**
 * Limpia menciones de fechas simples ("el 21/10") y rangos/listas de fechas ("entre el 20 y 24/10", "20 o 21/10")
 * para que los números de día ("20") nunca sean confundidos con una hora del día al analizar franjas horarias.
 */
export function limpiarFechasDeTextoParaHorario(comentario: string): string {
  const raw = String(comentario || '');
  const sinPropuestaBloque = raw
    .replace(/\[Propuesta\s+[^\]]*\]/gi, ' ')
    .replace(/\(\d{1,2}:\d{2}\s*a\s*\d{1,2}:\d{2}\s*hs(?:\s*\([^)]*\))?\)/gi, ' ');
  const sinFechas = (txt: string) =>
    txt
      .replace(
        /\b(?:entre\s+(?:el\s+)?|del\s+|el\s+)?\d{1,2}(?:\s*(?:o|y|al|a|-|,)\s*(?:el\s+)?\d{1,2})+\/\d{1,2}(?:\/\d{2,4})?\b/gi,
        ' '
      )
      .replace(/\b(?:el\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, ' ');
  const limpioDePropuesta = sinFechas(sinPropuestaBloque);
  if (
    /\b(\d{1,2}(?::\d{2})?\s*(?:hs|h|horas)?|antes\s+de\s+las|despu[eé]s\s+de\s+las|luego\s+de\s+las|a\s+las|ma[ñn]ana|mediod[ií]a|tarde|noche|vespertin[oa]|cualquier\s+hora)\b/i.test(
      limpioDePropuesta
    )
  ) {
    return limpioDePropuesta;
  }
  return sinFechas(raw);
}

/**
 * Determina la franja horaria compatible a partir del comentario en la Columna G,
 * evitando confundir límites superiores ("hasta las 18", "antes de las 18", "entre 10 y 18:00") con horario Vespertino.
 */
export function analizarFranjaHoraria(comentario: string): FranjaHoraria {
  if (!comentario) return 'Flexible';
  // Quitar fechas DD/MM(/YYYY) y rangos de fechas ("entre el 20 y 24/10", "20 o 21/10")
  const com = limpiarFechasDeTextoParaHorario(comentario).toLowerCase();

  // 1. Rango explícito "entre X y Y" o "de X a Y"
  const mRango = com.match(
    /\b(?:entre\s+(?:las\s+)?|de\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:y|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\b/i
  );
  if (mRango) {
    const h1 = Number(mRango[1]);
    const min1 = mRango[2] ? Number(mRango[2]) : 0;
    const h2 = Number(mRango[3]);
    const min2 = mRango[4] ? Number(mRango[4]) : 0;
    if (h1 >= 6 && h1 <= 22 && h2 > h1 && h2 <= 23) {
      const ini = h1 * 60 + min1;
      const fin = h2 * 60 + min2;
      // Si cubre casi toda la jornada (ej: "entre 10 y 18:00" o "de 14 a 20:00" con >= 7 horas)
      if (fin - ini >= 450) return 'Flexible';
      if (ini >= 17 * 60) return 'Vespertino';
      if (ini >= 14 * 60 + 30) return 'Tarde';
      if (ini >= 12 * 60 && fin <= 15 * 60 + 30) return 'Mediodía';
      if (ini < 12 * 60 && fin <= 13 * 60 + 30) return 'Mañana';
      const medio = (ini + fin) / 2;
      if (medio < 12 * 60 + 30) return 'Mañana';
      if (medio < 14 * 60 + 30) return 'Mediodía';
      if (medio < 17 * 60 + 45) return 'Tarde';
      return 'Vespertino';
    }
  }

  // 2. Vespertino real: "después de las 18", "luego de las 18", "a partir de las 18", o cita puntual a las 18/19/20 (NO "antes de las 18" ni "hasta las 18")
  if (
    /\b(despu[eé]s|luego|a\s+partir|cerca)\s+de\s+las\s*(18|19|20|21)\b/.test(com) ||
    /\ba\s+las\s*(18|19|20|21)(\b|:)/.test(com) ||
    (!/\b(antes|hasta)\s+de?\s*(las\s+)?(18|19|20)\b/.test(com) &&
      /(^|\s)(18|19|20):\d{2}/.test(com))
  ) {
    return 'Vespertino';
  }

  // 3. Mención explícita de "por la tarde" / "a la tarde" o "antes de las 18" / "hasta las 18"
  if (
    com.includes('por la tarde') ||
    com.includes('a la tarde') ||
    /\b(a las|cerca de las|tipo|después de las|luego de las)\s+(15|16|17)(\b|:)/.test(com) ||
    /(^|\s)(15|16|17):\d{2}/.test(com)
  ) {
    return 'Tarde';
  }

  // 4. Mañana ("a la mañana", "a las 10", "antes de las 11:30")
  if (
    com.includes('mañana') ||
    /\b(a las|cerca de las|tipo|antes de las|hasta las)\s+(8|9|10|11)(\b|:)/.test(com) ||
    /(^|\s)(8|9|10|11):\d{2}/.test(com)
  ) {
    return 'Mañana';
  }

  // 5. Mediodía ("a las 12/13/14", "mediodía")
  if (
    com.includes('mediodía') ||
    com.includes('mediodia') ||
    /\b(a las|cerca de las|tipo|antes de las|hasta las)\s+(12|13|14)(\b|:)/.test(com) ||
    /(^|\s)(12|13|14):\d{2}/.test(com)
  ) {
    return 'Mediodía';
  }

  if (com.includes('tarde') || /\b(antes de las|hasta las)\s+(16|17|18)\b/.test(com)) {
    return 'Tarde';
  }

  return 'Flexible';
}

/**
 * Geocodifica determinísticamente las intersecciones y alturas conocidas de CABA
 */

export function obtenerPartesFechaHoraBA(ms: number = Date.now()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
  nombreDia: string;
  ddmm: string;
  isoDate: string;
  hhmm: string;
  etiquetaCompleta: string;
} {
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  // Argentina es permanentemente UTC-3
  const dBA = new Date(safeMs - 3 * 3600 * 1000);
  const year = dBA.getUTCFullYear();
  const month = dBA.getUTCMonth() + 1;
  const day = dBA.getUTCDate();
  const hour = dBA.getUTCHours();
  const minute = dBA.getUTCMinutes();
  const dayOfWeek = dBA.getUTCDay();
  const nombreDia = DIAS_SEMANA_ES[dayOfWeek] || 'Hoy';
  const ddmm = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek,
    nombreDia,
    ddmm,
    isoDate,
    hhmm,
    etiquetaCompleta: `${nombreDia} ${ddmm} · ${hhmm} hs`,
  };
}

export function sumarDiasAFechaBA(baseMs: number, diasOffset: number) {
  return obtenerPartesFechaHoraBA(baseMs + diasOffset * 86400 * 1000);
}

/**
 * Compara una fecha corta 'dd/MM' (ej: '16/10', '20/10') contra la fecha actual en Buenos Aires.
 * Devuelve < 0 si ya pasó (día anterior), 0 si es HOY, > 0 si es una fecha futura.
 */
export function compararFechaDDMMConHoyBA(
  ddmm: string,
  hoyBA: { year: number; month: number; day: number }
): number {
  const m = (ddmm || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return 1;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (!Number.isFinite(dia) || !Number.isFinite(mes)) return 1;
  const valFecha = mes * 100 + dia;
  const valHoy = hoyBA.month * 100 + hoyBA.day;
  return valFecha - valHoy;
}

/**
 * Determina si un contacto NO adherido ya tiene un punto de encuentro, dirección, esquina,
 * sede o lugar determinado en Google Sheets o en la sección "1. Contacto y Respuestas".
 */

export function extraerHoraVencimientoEnColumnaG(
  comentario: string,
  franjaHoraria: FranjaHoraria
): { tieneHoraEnCelda: boolean; minutosFin: number; etiquetaHora: string } {
  const com = limpiarFechasDeTextoParaHorario(comentario || '').toLowerCase();

  // 1. Hora puntual explícita con prefijo ("a las 10", "cerca de las 17:30", "alrededor de las 15", "tipo 16 hs")
  // Se evalúa primero para que una cita puntual (ej. Laura 10:00 hs) nunca sea eclipsada por un rango secundario.
  const mPuntualPrefijo = com.match(
    /\b(?:a\s+las\s+|cerca\s+de\s+las\s+|alrededor\s+de\s+las\s+|tipo\s+)(\d{1,2})(?::(\d{2}))?(?!\s*\/)(?:\s*hs|\s*h)?\b/i
  );
  if (mPuntualPrefijo) {
    const h = parseInt(mPuntualPrefijo[1], 10);
    const min = mPuntualPrefijo[2] ? parseInt(mPuntualPrefijo[2], 10) : 0;
    if (Number.isFinite(h) && h >= 6 && h <= 23) {
      return {
        tieneHoraEnCelda: true,
        minutosFin: Math.min(23 * 60 + 59, h * 60 + min + 5),
        etiquetaHora: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 2. "antes de las 11:30 y 12:00", "antes de las 18", "hasta las 16"
  const mAntesRango = com.match(
    /\b(?:antes\s+de\s+(?:las\s+)?|hasta\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?(?:\s*(?:y|o|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?)?\b/i
  );
  if (mAntesRango) {
    const h1 = parseInt(mAntesRango[1], 10);
    const min1 = mAntesRango[2] ? parseInt(mAntesRango[2], 10) : 0;
    const h2 = mAntesRango[3] ? parseInt(mAntesRango[3], 10) : h1;
    const min2 = mAntesRango[4] ? parseInt(mAntesRango[4], 10) : mAntesRango[3] ? 0 : min1;
    if (Number.isFinite(h1) && h1 >= 7 && h1 <= 23 && h2 >= h1 && h2 <= 23) {
      const etiq = mAntesRango[3]
        ? `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} y ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`
        : `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} hs`;
      return {
        tieneHoraEnCelda: true,
        minutosFin: h1 * 60 + min1,
        etiquetaHora: etiq,
      };
    }
  }

  // 3. Rango explícito: "entre (las) 15 y (las) 18", "entre 15:30 y 17:30", "de 13 a 15", "10 a 13 hs"
  const mRango = com.match(
    /\b(?:(?:entre\s+(?:las\s+)?|de\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:y|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?|(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h))\b/i
  );
  if (mRango) {
    const h1 = parseInt(mRango[1] || mRango[5], 10);
    const min1 = (mRango[2] || mRango[6]) ? parseInt(mRango[2] || mRango[6], 10) : 0;
    const h2 = parseInt(mRango[3] || mRango[7], 10);
    const min2 = (mRango[4] || mRango[8]) ? parseInt(mRango[4] || mRango[8], 10) : 0;
    if (Number.isFinite(h2) && h2 >= 6 && h2 <= 23 && h1 >= 6 && h2 >= h1) {
      return {
        tieneHoraEnCelda: true,
        minutosFin: h2 * 60 + min2,
        etiquetaHora: `${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} a ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`,
      };
    }
  }

  // 4. "después de las 15", "luego de las 18:00", "a partir de las 16"
  const mDespues = com.match(
    /\b(?:despu[eé]s\s+de\s+las|luego\s+de\s+las|a\s+partir\s+de\s+las|desde\s+las)\s+(\d{1,2})(?::(\d{2}))?(?!\s*\/)\s*(?:hs|h)?\b/i
  );
  if (mDespues) {
    const h = parseInt(mDespues[1], 10);
    const min = mDespues[2] ? parseInt(mDespues[2], 10) : 0;
    if (Number.isFinite(h) && h >= 0 && h <= 23) {
      const fin = Math.min(22 * 60, Math.max((h + 2) * 60 + min, 18 * 60));
      return {
        tieneHoraEnCelda: true,
        minutosFin: fin,
        etiquetaHora: `después de las ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 5. Hora puntual directa: "16hs", "15:30 hs", "10:00"
  const mPuntualDirecta = com.match(
    /\b(\d{1,2}):(\d{2})\s*(?:hs|h)?\b|\b(\d{1,2})\s*(?:hs|horas|h)\b/i
  );
  if (mPuntualDirecta) {
    const hRaw = mPuntualDirecta[1] || mPuntualDirecta[3];
    const minRaw = mPuntualDirecta[2] || '0';
    const h = parseInt(hRaw, 10);
    const min = parseInt(minRaw, 10);
    if (Number.isFinite(h) && h >= 6 && h <= 23) {
      return {
        tieneHoraEnCelda: true,
        minutosFin: Math.min(23 * 60 + 59, h * 60 + min + 5),
        etiquetaHora: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 6. Franja horaria o mención explícita en la celda ("mañana", "mediodía", "tarde", "noche", "cualquier hora")
  if (/\b(cualquier\s+hora|todo\s+el\s+d[ií]a)\b/i.test(com)) {
    return {
      tieneHoraEnCelda: true,
      minutosFin: 19 * 60 + 30,
      etiquetaHora: 'cualquier hora',
    };
  }

  if (
    /\b(ma[ñn]ana|mediod[ií]a|tarde|noche|vespertin[oa])\b/i.test(com) ||
    franjaHoraria !== 'Flexible'
  ) {
    const horaFin =
      franjaHoraria === 'Mañana'
        ? 12 * 60 + 45
        : franjaHoraria === 'Mediodía'
        ? 14 * 60 + 45
        : franjaHoraria === 'Tarde'
        ? 18 * 60 + 15
        : 20 * 60 + 30;
    return {
      tieneHoraEnCelda: true,
      minutosFin: horaFin,
      etiquetaHora: franjaHoraria,
    };
  }

  return {
    tieneHoraEnCelda: false,
    minutosFin: 20 * 60,
    etiquetaHora: '',
  };
}

/**
 * Detecta si un contacto califica como "Atención Prioritaria · Pendientes de Fecha / Hora Anterior":
 * REGLA ESTRICTA DEL USUARIO:
 * Un contacto SÓLO se considera "Atención Prioritaria · Pendientes de Fecha / Hora Anterior"
 * (Visitas sin confirmar, encuentros vencidos sin pasar a "Ya adhirió" o vecinos pendientes de recibir en Café HUB)
 * SI Y SÓLO SI:
 * 1) Tenía la INFORMACIÓN COMPLETA en la columna "G" ("Comentario"):
 *    - Dirección / esquina / punto de encuentro determinado en la celda, Y
 *    - Día / Fecha concreta en la celda (`fechasMencionadas.length > 0`), Y
 *    - Hora o franja horaria explícita en la celda (`tieneHoraEnCelda === true`, o día anterior ya concluido), Y
 * 2) YA PASÓ TANTO EL DÍA COMO LA HORA contenidos en la celda de ese usuario/persona en la Columna G
 *    respecto de la fecha y hora actual (`ahoraMs`), Y
 * 3) Aún no figura como "Adhirió: Sí".
 */
export function detectarAlertaPendienteVencido(
  params: {
    sinNombre: boolean;
    primerNombre: string;
    barrio: string;
    calleOCruce: string;
    comentario: string;
    franjaHoraria: FranjaHoraria;
    fechasMencionadas: string[];
    situacion: SituacionContacto;
    estadoFlujo: EstadoFlujo;
    adhirio: string;
    horasDesdeUltimoContacto: number;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now(),
  opcionesCafe?: OpcionesCafeMensaje
): AlertaPendienteVencido | undefined {
  const adh = (params.adhirio || '').toLowerCase().trim();
  if (
    adh === 'sí' ||
    adh === 'si' ||
    params.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    params.estadoFlujo === 'DESCARTADO_O_BAJA' ||
    params.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    params.situacion === 'YA_ADHIRIO' ||
    params.situacion === 'DESCARTADO_NO_CABA' ||
    params.situacion === 'NUEVO_SIN_PRIMER_MENSAJE'
  ) {
    return undefined;
  }

  const comLower = (params.comentario || '').toLowerCase().trim();
  if (!comLower) return undefined;

  // 1. Verificar que tenga LUGAR / DIRECCIÓN / PUNTO en la celda de Columna G
  const tieneLugarEnColG =
    Boolean(params.calleOCruce && params.calleOCruce.trim().length > 0) ||
    /\b(chile\s*1408|caf[eé]\s*hub|plaza|pza\.|parque|pqe\.|estaci[oó]n|sede)\b/i.test(comLower);

  // 2. Verificar que tenga FECHA (día) en la celda de Columna G
  const tieneFechaEnColG = params.fechasMencionadas.length > 0;
  if (!tieneLugarEnColG || !tieneFechaEnColG) {
    return undefined;
  }

  // 3. Verificar que tenga HORA / FRANJA HORARIA en la celda de Columna G
  const infoHoraColG = extraerHoraVencimientoEnColumnaG(params.comentario, params.franjaHoraria);

  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);
  const minutosActualesBA = hoyBA.hour * 60 + hoyBA.minute;

  // Si ninguna fecha es anterior a hoy y tampoco tiene hora en celda para hoy, no se puede dar por vencido hoy
  const tieneAlgunaFechaAnteriorAHoy = params.fechasMencionadas.some(
    (f) => compararFechaDDMMConHoyBA(f, hoyBA) < 0
  );
  if (!infoHoraColG.tieneHoraEnCelda && !tieneAlgunaFechaAnteriorAHoy) {
    return undefined;
  }

  // Evaluar si YA PASÓ el día y la hora contenidos en la celda de Columna G
  let fechaVencidaDetectada: string | undefined;
  let tieneFechaHoraHoyOFuturaVigente = false;

  for (const f of params.fechasMencionadas) {
    const cmp = compararFechaDDMMConHoyBA(f, hoyBA);
    if (cmp < 0) {
      // El día contenido en la celda es anterior a hoy -> ya pasaron tanto el día como la hora
      if (!fechaVencidaDetectada) {
        const etiqH = infoHoraColG.etiquetaHora || 'jornada vencida';
        fechaVencidaDetectada = `${f} (${etiqH})`;
      }
    } else if (cmp === 0) {
      // El día es HOY -> verificar si ya pasó la hora contenida en la celda
      if (infoHoraColG.tieneHoraEnCelda && minutosActualesBA >= infoHoraColG.minutosFin) {
        fechaVencidaDetectada = `${f} (${infoHoraColG.etiquetaHora})`;
      } else {
        tieneFechaHoraHoyOFuturaVigente = true;
      }
    } else {
      tieneFechaHoraHoyOFuturaVigente = true;
    }
  }

  if (!fechaVencidaDetectada) {
    return undefined;
  }
  if (tieneFechaHoraHoyOFuturaVigente && !tieneAlgunaFechaAnteriorAHoy) {
    return undefined;
  }

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: params.barrio,
      calleOCruce: params.calleOCruce,
      lat: params.lat,
      lng: params.lng,
    },
    profile,
    opcionesCafe
  );
  const { incluirCafe, cafeNombre, cafeDireccion, fraseCafe } = infoCafe;
  const lugarRef = params.calleOCruce || cafeNombre;

  let tipoAlerta: TipoAlertaPendienteVencido;
  let titulo = '';
  let motivo = '';

  if (/confirmar\s+visita|visita\s+por\s+confirmar|falta\s+confirmar/i.test(comLower)) {
    tipoAlerta = 'VISITA_SIN_CONFIRMAR_A_TIEMPO';
    titulo = `Visita sin confirmar vencida (${fechaVencidaDetectada}) en ${lugarRef}`;
    motivo = `Tenía información completa en Columna G (${lugarRef} · ${fechaVencidaDetectada}), pero ya pasó el día y la hora sin confirmarse ni cambiar a "Ya adhirió".`;
  } else if (
    params.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    params.situacion === 'PREFIERE_PUNTO' ||
    params.situacion === 'EVENTO_CHILE_1408' ||
    /caf[eé]\s*hub|punto|chile\s*1408/i.test(comLower)
  ) {
    tipoAlerta = 'NO_RECIBIDO_EN_CAFE_HUB_O_SEDE';
    titulo = `Encuentro en punto/café vencido (${fechaVencidaDetectada}) — Sin cambio a "Ya adhirió"`;
    motivo = `Tenía encuentro pactado en Columna G para el ${fechaVencidaDetectada} en ${lugarRef} y ya pasó el día y la hora sin pasar a "Ya adhirió".`;
  } else {
    tipoAlerta = 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION';
    titulo = `Encuentro / Visita vencida (${fechaVencidaDetectada}) sin cambio a "Ya adhirió"`;
    motivo = `Tenía dirección (${lugarRef}) y fecha/hora completa en Columna G (${fechaVencidaDetectada}), y ya pasó el día y la hora sin que cambiara a "Adhirió: Sí".`;
  }

  const saludo = params.sinNombre ? 'Hola' : `Hola, ${params.primerNombre}`;
  const posdataNombre = params.sinNombre
    ? `\n\n_(De paso: como en la planilla me quedó en blanco tu nombre, ¿me recordarías tu *nombre y apellido* para agendarte bien?)_`
    : '';

  const propuestaReprogramacion = params.calleOCruce
    ? `Reprogramar pasada Puerta a Puerta por ${params.calleOCruce} (${params.barrio}) para mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}${
        incluirCafe ? ` o en ${cafeNombre} (${cafeDireccion})` : ''
      }`
    : `Reprogramar encuentro en ${
        incluirCafe ? `${cafeNombre} (${cafeDireccion}) o ` : ''
      }domicilio en ${params.barrio} mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}`;

  const altCafeTexto = incluirCafe
    ? `, o bien encontrarnos unos minutos en ${fraseCafe}`
    : '';

  const mensajeDisculpasReprogramacion =
    tipoAlerta === 'NO_RECIBIDO_EN_CAFE_HUB_O_SEDE'
      ? `${saludo}, ¿cómo estás? Te pido disculpas porque no pude cumplir con nuestro compromiso de encontrarnos en *${lugarRef}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo entre mañana (*${manianaBA.nombreDia} ${manianaBA.ddmm}*) y los próximos días en *${params.barrio}*: ${
          incluirCafe
            ? `podemos vernos 2 minutos en ${fraseCafe} o, si te resulta más cómodo, paso yo directo por *${params.calleOCruce || `tu cuadra en ${params.barrio}`}*`
            : `puedo pasar 2 minutos por *${params.calleOCruce || `tu cuadra en ${params.barrio}`}*`
        }. ¿Qué día y horario te viene mejor?${posdataNombre}`
      : `${saludo}, ¿cómo estás? Te pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${params.calleOCruce || params.barrio}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para mañana *${manianaBA.nombreDia} ${manianaBA.ddmm}* (o el día de esta semana que te quede más cómodo) pasando un ratito por *${params.calleOCruce || `tu cuadra en ${params.barrio}`}*${altCafeTexto}. ¿Qué día y franja horaria te queda mejor?${posdataNombre}`;

  return {
    activa: true,
    tipo: tipoAlerta,
    titulo,
    motivo,
    fechaVencida: fechaVencidaDetectada,
    propuestaReprogramacion,
    mensajeDisculpasReprogramacion,
  };
}

/**
 * Diagnostica por qué un contacto califica en "SIN RSP +48H" (ya sea por falta de respuesta al 1er mensaje,
 * por falta de avance tras responder Sí, o porque tiene algún dato cargado en la Columna "G" ("Comentario")
 * que resulta INSUFICIENTE para concretar una visita o encuentro) y genera automáticamente
 * el mensaje personalizado en función de la información disponible de ese usuario.
 */

export function sumarMinutosAHora(horaHHMM: string, minutosASumar: number): string {
  const [hh, mm] = horaHHMM.split(':').map(Number);
  const totalMin = (hh || 0) * 60 + (mm || 0) + Math.round(minutosASumar);
  const normalized = ((totalMin % 1440) + 1440) % 1440;
  const finalH = Math.floor(normalized / 60);
  const finalM = normalized % 60;
  return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
}

export function horaAMinutosDelDia(horaHHMM: string): number {
  const [hh, mm] = (horaHHMM || '00:00').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}


export function analizarDisponibilidadColumnaG(comentario: string): {
  esVentanaAmplia: boolean;
  minInicioVentana?: number;
  minFinVentana?: number;
  etiquetaVentana?: string;
  horaPuntualPactada?: string;
} {
  if (!comentario) {
    return { esVentanaAmplia: false };
  }
  const texto = limpiarFechasDeTextoParaHorario(comentario);

  // 1. "antes de las 11:30 y 12:00", "antes de las 13", "hasta las 16"
  const mAntes = texto.match(
    /\b(?:antes\s+de\s+(?:las\s+)?|hasta\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?(?:\s*(?:y|o|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?)?\b/i
  );
  if (mAntes) {
    const h1 = Number(mAntes[1]);
    const min1 = mAntes[2] ? Number(mAntes[2]) : 0;
    const h2 = mAntes[3] ? Number(mAntes[3]) : h1;
    const min2 = mAntes[4] ? Number(mAntes[4]) : mAntes[3] ? 0 : min1;
    if (h1 >= 9 && h1 <= 21 && h2 >= h1 && h2 <= 22) {
      const ini = 9 * 60;
      const fin = h2 * 60 + min2;
      const etiq = mAntes[3]
        ? `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} y ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`
        : `antes de las ${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} hs`;
      return {
        esVentanaAmplia: fin - ini >= 90,
        minInicioVentana: ini,
        minFinVentana: fin,
        etiquetaVentana: etiq,
      };
    }
  }

  // 2. Rango explícito: "entre (las) 9 y (las) 16:00", "de 10 a 17 hs", "entre 13:30 y 18", "10 a 13 hs"
  const mRango = texto.match(
    /\b(?:(?:entre\s+(?:las\s+)?|de\s+(?:las\s+)?)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:y|a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?|(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\s*(?:a|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h))\b/i
  );
  if (mRango) {
    const h1 = Number(mRango[1] || mRango[5]);
    const min1 = (mRango[2] || mRango[6]) ? Number(mRango[2] || mRango[6]) : 0;
    const h2 = Number(mRango[3] || mRango[7]);
    const min2 = (mRango[4] || mRango[8]) ? Number(mRango[4] || mRango[8]) : 0;
    if (h1 >= 6 && h1 <= 22 && h2 > h1 && h2 <= 23) {
      const ini = h1 * 60 + min1;
      const fin = h2 * 60 + min2;
      const etiq = `${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')} a ${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')} hs`;
      if (fin - ini >= 90) {
        return {
          esVentanaAmplia: true,
          minInicioVentana: ini,
          minFinVentana: fin,
          etiquetaVentana: etiq,
        };
      }
      return {
        esVentanaAmplia: false,
        minInicioVentana: ini,
        minFinVentana: fin,
        etiquetaVentana: etiq,
        horaPuntualPactada: `${String(h1).padStart(2, '0')}:${String(min1).padStart(2, '0')}`,
      };
    }
  }

  // 3. Ventana abierta desde cierta hora: "después de las 15", "luego de las 18:00", "a partir de las 14"
  const mDespues = texto.match(
    /\b(?:despu[eé]s\s+de\s+las|luego\s+de\s+las|a\s+partir\s+de\s+las|desde\s+las)\s+(\d{1,2})(?::(\d{2}))?(?!\s*\/)\s*(?:hs|h)?\b/i
  );
  if (mDespues) {
    const h = Number(mDespues[1]);
    const min = mDespues[2] ? Number(mDespues[2]) : 0;
    if (h >= 7 && h <= 21) {
      const ini = h * 60 + min;
      const fin = Math.max(ini + 150, 20 * 60);
      return {
        esVentanaAmplia: true,
        minInicioVentana: ini,
        minFinVentana: fin,
        etiquetaVentana: `después de las ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} hs`,
      };
    }
  }

  // 3. Hora puntual pactada: "a las 11hs", "a las 10", "a las 15", "cerca de las 17:30", "tipo 16 hs", "15:30 hs"
  const mHoraPrefijo = texto.match(
    /\b(?:a\s+las|cerca\s+de\s+las|alrededor\s+de\s+las|tipo)\s+([01]?\d|2[0-3])(?::([0-5]\d))?(?!\s*\/)\s*(?:hs|horas|h)?\b/i
  );
  if (mHoraPrefijo) {
    const hh = Number(mHoraPrefijo[1]);
    const mm = mHoraPrefijo[2] ? Number(mHoraPrefijo[2]) : 0;
    if (hh >= 7 && hh <= 22) {
      return {
        esVentanaAmplia: false,
        horaPuntualPactada: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      };
    }
  }
  const mHoraMin = texto.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:hs|h)?\b/i);
  if (mHoraMin) {
    const hh = Number(mHoraMin[1]);
    const mm = Number(mHoraMin[2]);
    if (hh >= 7 && hh <= 22) {
      return {
        esVentanaAmplia: false,
        horaPuntualPactada: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      };
    }
  }
  const mHoraHs = texto.match(
    /\b([01]?\d|2[0-3])\s*(?:hs|horas)\b/i
  );
  if (mHoraHs) {
    const hh = Number(mHoraHs[1]);
    if (hh >= 7 && hh <= 22) {
      return {
        esVentanaAmplia: false,
        horaPuntualPactada: `${String(hh).padStart(2, '0')}:00`,
      };
    }
  }

  // 4. Expresiones de turno explícito ("por la tarde", "a la tarde", "por la mañana", "al mediodía")
  if (/\b(?:por\s+la\s+tarde|a\s+la\s+tarde|durante\s+la\s+tarde|tarde)\b/i.test(texto)) {
    return {
      esVentanaAmplia: true,
      minInicioVentana: 14 * 60,
      minFinVentana: 19 * 60,
      etiquetaVentana: 'por la tarde',
    };
  }
  if (/\b(?:por\s+la\s+ma[ñn]ana|a\s+la\s+ma[ñn]ana|durante\s+la\s+ma[ñn]ana)\b/i.test(texto)) {
    return {
      esVentanaAmplia: true,
      minInicioVentana: 9 * 60,
      minFinVentana: 12 * 60 + 30,
      etiquetaVentana: 'por la mañana',
    };
  }
  if (/cualquier\s+hor(?:a|ario)|todo\s+el\s+d[ií]a|amplia\s+disponibilidad/i.test(texto)) {
    return {
      esVentanaAmplia: true,
      minInicioVentana: 9 * 60,
      minFinVentana: 19 * 60 + 30,
      etiquetaVentana: 'cualquier horario (09:00 a 19:30 hs)',
    };
  }

  return { esVentanaAmplia: false };
}

/**
 * Extrae una hora puntual pactada en la Columna G ("Comentario"), por ejemplo "11hs", "17:30", "a las 16".
 * Si la persona dejó una franja amplia (ej. "entre 9 y 16:00" o "luego de las 18:00"), devuelve `undefined`
 * para que el planificador elija un horario conveniente dentro de esa ventana sin asumir falso choque fijo.
 */
export function extraerHoraPactadaExplicita(comentario: string): string | undefined {
  const disp = analizarDisponibilidadColumnaG(comentario);
  if (disp.esVentanaAmplia) return undefined;
  return disp.horaPuntualPactada;
}

/**
 * Selecciona los mejores Cafés HUB de la lista oficial de Google Maps considerando:
 * 1) Cercanía geográfica (distancia y minutos a pie promedio) a las direcciones/puntos de los vecinos.
 * 2) El día compartido (`fechaClave`) y la franja horaria compartida (`franjaDominante`) del grupo.
 */

export function obtenerFechaSugeridaReprogramacionContacto(
  contact: { fechasMencionadas?: string[]; alertaVencido?: { activa?: boolean } },
  fallbackFecha?: string,
  ahoraMs: number = Date.now()
): string {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);

  const fechasCandidatas = [
    ...(contact.fechasMencionadas || []),
    ...(fallbackFecha ? [fallbackFecha] : []),
  ];

  for (const fRaw of fechasCandidatas) {
    const f = String(fRaw || '').trim();
    if (!/^\d{1,2}\/\d{1,2}$/.test(f)) continue;
    const cmp = compararFechaDDMMConHoyBA(f, hoyBA);
    if (cmp > 0) return f;
    if (cmp === 0 && !contact.alertaVencido?.activa) return f;
  }

  return manianaBA.ddmm;
}

/**
 * Procesa y consolida en la app y para Google Sheets la respuesta de una persona a la propuesta de la Agenda Diaria:
 * - Si confirma la propuesta -> pasa a ENCUENTRO_CONFIRMADO en el día/turno elegido y activa su mensaje en la Pestaña 3.
 * - Si se le propuso Café HUB y lo declina -> pasa automáticamente a un recorrido PUERTA_A_PUERTA confirmado en su dirección, día y turno.
 * - Si no puede en domicilio y prefiere punto -> pasa a PREFIERE_CAFE_HUB_O_SEDE con el Café HUB del bloque, día y turno.
 * - Si pide reprogramar día/hora -> actualiza la fecha, el turno/franja y el lugar en Columna G.
 * - Si avisa que ya firmó -> pasa a YA_ADHIRIO_FIRMA_OK (Adhirió: Sí) y sale de los pendientes.
 */

