import { Contact, ModoSaludoMismoDia, TipoPlantillaWA, VoiceProfile } from '../../types';
import { obtenerPartesFechaHoraBA } from '../calendar/availability';
import { normalizarTelefonoWA } from '../contacts/phoneUtils';
import { DIAS_SEMANA_ES, DIAS_SEMANA_MINUSCULA_ES } from './messageTemplates';
import { OpcionesCafeMensaje } from '../geo/cafesHub';

export function corregirPelonesDiaSemanaEnTexto(
  texto: string,
  anioDefault: number = 2026
): string {
  if (!texto) return texto;
  const regexDiaFecha =
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(\s+(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)\b/gi;

  return texto.replace(
    regexDiaFecha,
    (matchCompleto, diaEscrito: string, sufijoFecha: string, ddStr: string, mmStr: string, yyStr?: string) => {
      const day = parseInt(ddStr, 10);
      const month = parseInt(mmStr, 10);
      if (!Number.isFinite(day) || !Number.isFinite(month) || month < 1 || month > 12 || day < 1 || day > 31) {
        return matchCompleto;
      }
      let year = anioDefault;
      if (yyStr) {
        const parsedY = parseInt(yyStr, 10);
        if (Number.isFinite(parsedY)) {
          year = parsedY < 100 ? 2000 + parsedY : parsedY;
        }
      }
      const fechaUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (
        fechaUTC.getUTCFullYear() !== year ||
        fechaUTC.getUTCMonth() !== month - 1 ||
        fechaUTC.getUTCDate() !== day
      ) {
        return matchCompleto;
      }
      const dow = fechaUTC.getUTCDay();
      const empiezaMayus =
        diaEscrito.charAt(0) === diaEscrito.charAt(0).toUpperCase() &&
        diaEscrito.charAt(0) !== diaEscrito.charAt(0).toLowerCase();
      const todoMayus = diaEscrito === diaEscrito.toUpperCase() && diaEscrito.length > 1;
      const diaReal = todoMayus
        ? DIAS_SEMANA_ES[dow].toUpperCase()
        : empiezaMayus
        ? DIAS_SEMANA_ES[dow]
        : DIAS_SEMANA_MINUSCULA_ES[dow];
      return `${diaReal}${sufijoFecha}`;
    }
  );
}

/**
 * Verifica si un timestamp ISO o cadena de fecha corresponde al día de hoy en horario de Buenos Aires.
 */
export function esTimestampDeHoyBA(isoOrDateStr?: string, ahoraMs: number = Date.now()): boolean {
  if (!isoOrDateStr) return false;
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const trimmed = isoOrDateStr.trim();
  if (trimmed === hoyBA.isoDate || trimmed === hoyBA.ddmm || trimmed.startsWith(hoyBA.isoDate)) {
    return true;
  }
  const ms = Date.parse(trimmed);
  if (Number.isFinite(ms)) {
    return obtenerPartesFechaHoraBA(ms).isoDate === hoyBA.isoDate;
  }
  return false;
}

/**
 * Determina si el contacto tuvo cualquier movimiento en el día de hoy (en horario de Buenos Aires):
 * edición en la app (`actualizadoEnAppAt`), cambio de estado, mensaje enviado hoy, adhesión hoy o alta hoy.
 */
export function esMovimientoDeHoy(
  contact: {
    id?: string;
    ultimoContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    fechaAdhesion?: string;
    fechaAgregado?: string;
    enviadoEnSesion?: boolean;
    comentario?: string;
  },
  ahoraMs: number = Date.now()
): boolean {
  if (!contact) return false;
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const com = contact.comentario || '';
  if (yaSeHabloConContactoHoy(contact, ahoraMs)) return true;
  if (esTimestampDeHoyBA(contact.fechaAdhesion, ahoraMs)) return true;
  if (esTimestampDeHoyBA(contact.fechaAgregado, ahoraMs)) return true;
  if (
    com.includes(`Modificado el ${hoyBA.ddmm}`) ||
    com.includes(`Último cambio: ${hoyBA.ddmm}`) ||
    com.includes(`Firmó ficha ${hoyBA.ddmm}`)
  ) {
    return true;
  }
  if (esTimestampDeHoyBA(contact.actualizadoEnAppAt, ahoraMs)) {
    // Evitar falsos positivos si el comentario tiene una fecha histórica explícita (ej. "Visita 16/10", "Visita 21/10") y ninguna mención de hoy
    const matchesVisitaPasada = Array.from(
      com.matchAll(/\b(?:visita|firm[oó]|adhesi[oó]n|adhir[ií]o|retiro)\b[^0-9\n]{0,18}(\d{1,2})\/(\d{1,2})\b/gi)
    );
    if (
      matchesVisitaPasada.length > 0 &&
      !com.includes(hoyBA.ddmm) &&
      matchesVisitaPasada.every(
        (m) => `${String(Number(m[1])).padStart(2, '0')}/${String(Number(m[2])).padStart(2, '0')}` !== hoyBA.ddmm
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Determina si ya se le envió un mensaje o se registró interacción con esta persona en el día de hoy (en horario de Buenos Aires),
 * en función de las marcas temporales (`ultimoMensajeCorteEnviadoAt`, `ultimoContacto`, `enviadoEnSesion` o sello en comentario).
 */
export function yaSeHabloConContactoHoy(
  contact: {
    ultimoContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    comentario?: string;
  },
  ahoraMs: number = Date.now()
): boolean {
  if (!contact) return false;
  if (contact.enviadoEnSesion === true) return true;
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  if (contact.ultimoContacto && esTimestampDeHoyBA(contact.ultimoContacto, ahoraMs)) {
    return true;
  }
  if (contact.ultimoMensajeCorteEnviadoAt && esTimestampDeHoyBA(contact.ultimoMensajeCorteEnviadoAt, ahoraMs)) {
    return true;
  }
  const com = contact.comentario || '';
  if (
    com.includes(`Corte ${hoyBA.ddmm}`) ||
    com.includes(`auto enviado ${hoyBA.ddmm}`) ||
    com.includes(`Enviado ${hoyBA.ddmm}`) ||
    com.includes(`Modificado el ${hoyBA.ddmm}`)
  ) {
    return true;
  }
  return false;
}

/**
 * Si ya se habló con la persona en el mismo día (o si el usuario elige `SIN_SALUDO`),
 * elimina el saludo repetitivo de apertura ("Hola, Nombre, ¿cómo estás?", "Hola, buen día, ¿cómo te va?", etc.)
 * para que el mensaje continúe la conversación del día de manera fluida y humana.
 */
export function aplicarReglaSaludoMismoDia(
  texto: string,
  contact: {
    primerNombre?: string;
    sinNombre?: boolean;
    ultimoContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    comentario?: string;
  },
  modoSaludo: ModoSaludoMismoDia = 'AUTO_MISMO_DIA',
  ahoraMs: number = Date.now()
): string {
  const textoCorregido = corregirPelonesDiaSemanaEnTexto(texto);
  if (modoSaludo === 'SIEMPRE_SALUDAR') return textoCorregido;

  const debeOmitirSaludo =
    modoSaludo === 'SIN_SALUDO' ||
    (modoSaludo === 'AUTO_MISMO_DIA' && yaSeHabloConContactoHoy(contact, ahoraMs));

  if (!debeOmitirSaludo) return textoCorregido;

  let limpio = textoCorregido.trim();

  // Quitar encabezados de saludo iniciales como:
  // "Hola, Nombre, buen día, ¿cómo estás? ", "Hola, Nombre, ¿cómo estás? ", "Hola, ¿cómo va? ", "Buen día, Nombre. ¿Cómo te va? "
  const regexSaludoConPregunta =
    /^¡?(?:hola|buen\s+d[ií]a|buenas(?:\s+tardes|\s+noches)?|qu[eé]\s+tal)(?:[,.\s]+[^.!?\n]{1,35})?[,.\s]*¿\s*(?:c[oó]mo\s+(?:est[aá]s|te\s+va|va(?:\s+todo)?|and[aá]s|viene\s+la\s+semana)|todo\s+bien|qu[eé]\s+tal)[^?\n]*\?\s*(?:espero\s+que\s+(?:est[eé]s\s+)?(?:muy\s+)?bien\.?\s*)?/i;

  const regexPreguntaSola =
    /^¿\s*(?:qu[eé]\s+tal|c[oó]mo\s+(?:est[aá]s|and[aá]s|va\s+todo))[^?\n]*\?\s*(?:¿[^?\n]*\?\s*)?/i;

  const regexSaludoSimple =
    /^¡?(?:hola|buen\s+d[ií]a|buenas(?:\s+tardes|\s+noches)?)(?:,?\s+[a-záéíóúñü]+(?:\s+[a-záéíóúñü]+)?)?(?:,?\s*(?:muy\s+)?buen(?:os)?\s+(?:d[ií]as?|tardes|noches))?[.,!]\s*/i;

  if (regexSaludoConPregunta.test(limpio)) {
    limpio = limpio.replace(regexSaludoConPregunta, '').trim();
  } else if (regexPreguntaSola.test(limpio)) {
    limpio = limpio.replace(regexPreguntaSola, '').trim();
  } else if (regexSaludoSimple.test(limpio)) {
    limpio = limpio.replace(regexSaludoSimple, '').trim();
  }

  if (!limpio) return textoCorregido;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

export function postProcesarMensajeAntiPelonesYSaludo(
  res: { tipoUsado: TipoPlantillaWA; asunto: string; texto: string; objetivo: string },
  contact: {
    primerNombre?: string;
    sinNombre?: boolean;
    ultimoContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    comentario?: string;
  },
  tipo: TipoPlantillaWA,
  extra?: OpcionesCafeMensaje
): { tipoUsado: TipoPlantillaWA; asunto: string; texto: string; objetivo: string } {
  const modo = extra?.modoSaludo ?? (tipo === 'primer_contacto' ? 'SIEMPRE_SALUDAR' : 'AUTO_MISMO_DIA');
  return {
    ...res,
    texto: aplicarReglaSaludoMismoDia(res.texto, contact, modo, extra?.ahoraMs),
  };
}

/**
 * Obtiene determinísticamente la fecha y hora en huso horario de Buenos Aires (UTC-3)
 * a partir de cualquier timestamp `ms`.
 */

export function crearEnlaceWhatsApp(rawTel: string, mensaje: string): string {
  const num = normalizarTelefonoWA(rawTel);
  if (!num) return '';
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Divide una línea TSV o CSV respetando comillas dobles RFC-4180 y SIN recortar tabs iniciales
 * (para que una Columna A vacía jamás desplace la Columna B hacia la izquierda).
 */

