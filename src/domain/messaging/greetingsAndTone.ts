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
 * Determina si ya se le envió un mensaje a esta persona en el día de hoy (en horario de Buenos Aires),
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
  if (contact.ultimoContacto && contact.ultimoContacto.startsWith(hoyBA.isoDate)) {
    return true;
  }
  if (contact.ultimoMensajeCorteEnviadoAt) {
    const msEnvio = Date.parse(contact.ultimoMensajeCorteEnviadoAt);
    if (Number.isFinite(msEnvio)) {
      const envioBA = obtenerPartesFechaHoraBA(msEnvio);
      if (envioBA.isoDate === hoyBA.isoDate) return true;
    } else if (contact.ultimoMensajeCorteEnviadoAt.startsWith(hoyBA.isoDate)) {
      return true;
    }
  }
  const com = contact.comentario || '';
  if (
    com.includes(`Corte ${hoyBA.ddmm}`) ||
    com.includes(`auto enviado ${hoyBA.ddmm}`) ||
    com.includes(`Enviado ${hoyBA.ddmm}`)
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
  const patronesSaludoInicial = [
    /^¡?(?:hola|buen\s+d[ií]a|buenas(?:\s+tardes|\s+noches)?|qu[eé]\s+tal)[^.!?\n]*[.!?]\s*(?:¿\s*(?:c[oó]mo\s+(?:est[aá]s|te\s+va|va(?:\s+todo)?|and[aá]s)|todo\s+bien|qu[eé]\s+tal)[^?\n]*\?\s*)?(?:espero\s+que\s+(?:est[eé]s\s+)?(?:muy\s+)?bien\.?\s*)?/i,
    /^¿\s*(?:qu[eé]\s+tal|c[oó]mo\s+(?:est[aá]s|and[aá]s|va\s+todo))[^?\n]*\?\s*(?:¿[^?\n]*\?\s*)?/i,
    /^hola(?:,\s*[^\s,.!?]+)?,\s*(?:quer[ií]a\s+escribirte|ya\s+estoy|te\s+aviso|claro)/i,
  ];

  if (/^hola(?:,\s*[^\s,.!?]+)?[.,]\s*(?:quer[ií]a|ya\s+estoy|te\s+aviso|claro)/i.test(limpio)) {
    limpio = limpio.replace(/^hola(?:,\s*[^\s,.!?]+)?[.,]\s*/i, '');
  } else {
    for (const regex of patronesSaludoInicial) {
      if (regex.test(limpio)) {
        limpio = limpio.replace(regex, '').trim();
        break;
      }
    }
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

