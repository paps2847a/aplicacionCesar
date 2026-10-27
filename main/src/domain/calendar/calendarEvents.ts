import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';
import { CalendarEventItem, VoiceProfile } from '../../types';
import {
  COORDENADAS_BARRIOS_CABA,
  COORDENADAS_DIRECCIONES_CABA,
} from '../../data/estatusPopurriData';
import { compararFechaDDMMConHoyBA, horaAMinutosDelDia, obtenerPartesFechaHoraBA, sumarMinutosAHora } from './availability';
import { EVENTOS_FICTICIOS_LEGACY_IDS, EVENTOS_FICTICIOS_LEGACY_SUMMARIES, resolverCoordenadasPartidaPerfil } from '../geo/cabaLocations';

export function esEventoVirtualCalendar(ev: CalendarEventItem): boolean {
  const texto = `${ev.summary || ''} ${ev.location || ''}`.toLowerCase();
  return /\b(virtual|zoom|meet|google\s*meet|teams|online|remota|videollamada|streaming|webinar)\b/i.test(
    texto
  );
}

/**
 * Geocodifica la dirección de un evento de Google Calendar para calcular traslados reales hacia/desde el evento
 */
export function geocodificarEventoCalendar(
  ev: CalendarEventItem,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): { lat: number; lng: number; label: string } {
  if (typeof ev.lat === 'number' && typeof ev.lng === 'number') {
    return { lat: ev.lat, lng: ev.lng, label: ev.location || ev.summary };
  }
  if (esEventoVirtualCalendar(ev)) {
    return {
      lat: profile.latPartida,
      lng: profile.lngPartida,
      label: 'Virtual (sin traslado físico)',
    };
  }
  const loc = `${ev.location || ''} ${ev.summary || ''}`
    .toLowerCase()
    .replace(/\bsta\.?\s*fe\b/g, 'santa fe')
    .replace(/\bcnel\.?\b/g, 'coronel')
    .replace(/\bgral\.?\b/g, 'general');
  const coordenadasOrdenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
    (a, b) => b.match.length - a.match.length
  );
  for (const d of coordenadasOrdenadas) {
    if (loc.includes(d.match)) {
      return { lat: d.lat, lng: d.lng, label: d.label };
    }
  }
  for (const [barrio, coords] of Object.entries(COORDENADAS_BARRIOS_CABA)) {
    if (loc.includes(barrio.toLowerCase())) {
      return { lat: coords.lat, lng: coords.lng, label: ev.location || `${barrio}, CABA` };
    }
  }
  if (loc.includes('santa fe 32') || loc.includes('santa fe 31') || loc.includes('santa fe 33')) {
    return { lat: -34.5882, lng: -58.4112, label: 'Av. Santa Fe 3242, Palermo, CABA' };
  }
  if (loc.includes('virrey arredondo') || loc.includes('loreto garden') || loc.includes('virrey loreto')) {
    return { lat: -34.5688, lng: -58.4512, label: 'Virrey Arredondo 2427, Colegiales, CABA' };
  }
  if (loc.includes('cabildo')) {
    return { lat: -34.5618, lng: -58.4565, label: 'Av. Cabildo 2040, Belgrano, CABA' };
  }
  if (loc.includes('chile 1408') || loc.includes('monserrat')) {
    return { lat: -34.6158, lng: -58.3862, label: 'Chile 1408, Monserrat, CABA' };
  }
  const partida = resolverCoordenadasPartidaPerfil(profile);
  return {
    lat: partida.lat,
    lng: partida.lng,
    label: ev.location || profile.direccionPartida,
  };
}


export function esEventoFicticioLegacyCalendar(ev?: CalendarEventItem | null): boolean {
  if (!ev) return true;
  const rawId = String(ev.id || '').trim().toLowerCase();
  for (const fakeId of EVENTOS_FICTICIOS_LEGACY_IDS) {
    if (rawId === fakeId || rawId.startsWith(`${fakeId}-`)) {
      return true;
    }
  }
  const summaryNorm = String(
    ev.summary || (ev as { title?: string; titulo?: string }).title || (ev as { titulo?: string }).titulo || ''
  )
    .trim()
    .toLowerCase();
  if (EVENTOS_FICTICIOS_LEGACY_SUMMARIES.has(summaryNorm)) {
    return true;
  }
  return false;
}

/**
 * Desduplica eventos de Google Calendar por (ID base / Resumen + Fecha + Hora de inicio),
 * descarta eventos ficticios legacy y normaliza `fecha` en formato DD/MM.
 */
export function deduplicarEventosCalendar(
  eventos: CalendarEventItem[] = []
): CalendarEventItem[] {
  const vistos = new Set<string>();
  const resultado: CalendarEventItem[] = [];

  for (let idx = 0; idx < eventos.length; idx++) {
    const ev = eventos[idx];
    if (!ev || esEventoFicticioLegacyCalendar(ev)) continue;

    let fechaDDMM = String(ev.fecha || '').trim();
    let fechaISO = String(ev.fechaISO || '').trim();

    const mIsoFromFecha = fechaDDMM.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mIsoFromFecha) {
      if (!fechaISO) fechaISO = `${mIsoFromFecha[1]}-${mIsoFromFecha[2]}-${mIsoFromFecha[3]}`;
      fechaDDMM = `${mIsoFromFecha[3]}/${mIsoFromFecha[2]}`;
    } else if (!fechaDDMM && fechaISO) {
      const mIso = fechaISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (mIso) {
        fechaDDMM = `${mIso[3]}/${mIso[2]}`;
      }
    } else if (!fechaISO && /^\d{1,2}\/\d{1,2}$/.test(fechaDDMM)) {
      const [dStr, mStr] = fechaDDMM.split('/');
      fechaISO = `2026-${mStr.padStart(2, '0')}-${dStr.padStart(2, '0')}`;
      fechaDDMM = `${dStr.padStart(2, '0')}/${mStr.padStart(2, '0')}`;
    }

    const baseId = String(ev.id || ev.summary || `cal-ev-${idx}`).trim();
    const fechaKey = fechaISO || fechaDDMM;
    const horaKey = String(ev.startTime || ev.startIso || '').trim();
    const summaryKey = String(ev.summary || '').toLowerCase().trim();

    const dedupeKeyId = `${baseId}|${fechaKey}|${horaKey}`;
    const dedupeKeySummary = `${summaryKey}|${fechaKey}|${horaKey}`;
    if (vistos.has(dedupeKeyId) || (summaryKey && vistos.has(dedupeKeySummary))) {
      continue;
    }
    vistos.add(dedupeKeyId);
    if (summaryKey) vistos.add(dedupeKeySummary);

    const uniqueId =
      baseId.includes(fechaKey) && baseId.includes(horaKey)
        ? baseId
        : `${baseId}-${fechaKey || 'dia'}-${horaKey.replace(':', '') || idx}`;

    resultado.push({
      ...ev,
      id: uniqueId,
      fecha: fechaDDMM || ev.fecha,
      fechaISO: fechaISO || ev.fechaISO,
    });
  }

  return resultado;
}

/**
 * Filtra únicamente los eventos de Google Calendar que sigan vigentes respecto de `ahoraMs`:
 * - Descarta eventos de días anteriores a hoy.
 * - Descarta eventos del día de hoy cuya hora de finalización (`endTime`) ya pasó.
 */
export function filtrarEventosCalendarVigentes(
  eventos: CalendarEventItem[] = [],
  ahoraMs: number = Date.now()
): CalendarEventItem[] {
  const dedup = deduplicarEventosCalendar(eventos);
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const minutosActualesBA = hoyBA.hour * 60 + hoyBA.minute;

  return dedup.filter((ev) => {
    const fechaEv = String(ev.fecha || '').trim();
    if (fechaEv && /^\d{1,2}\/\d{1,2}$/.test(fechaEv)) {
      const cmp = compararFechaDDMMConHoyBA(fechaEv, hoyBA);
      if (cmp < 0) return false;
      if (cmp === 0) {
        const minFin = horaAMinutosDelDia(ev.endTime || ev.startTime || '23:59');
        if (minutosActualesBA >= minFin) return false;
      }
      return true;
    }
    if (ev.fechaISO) {
      if (ev.fechaISO < hoyBA.isoDate) return false;
      if (ev.fechaISO === hoyBA.isoDate) {
        const minFin = horaAMinutosDelDia(ev.endTime || ev.startTime || '23:59');
        if (minutosActualesBA >= minFin) return false;
      }
      return true;
    }
    return true;
  });
}

/**
 * Analiza si la celda de la Columna "G" ("Comentario") expresa una FRANJA HORARIA AMPLIA
 * (por ejemplo: "entre 9 y 16:00", "de 10 a 18", "después de las 14", "luego de las 18:00")
 * o una HORA PUNTUAL PACTADA ("a las 11 hs", "cerca de las 17:30", "15:30 hs").
 *
 * REGLA ESTRATÉGICA:
 * Si la persona dejó una franja horaria amplia (ej. "entre 9 y 16:00") y un evento de Google Calendar
 * ocupa sólo una parte de esa franja (ej. 15:00-15:50), NO es un choque ni requiere cancelar/reprogramar:
 * el sistema debe elegir un horario conveniente libre dentro de su franja (o proponer el Café HUB del bloque)
 * y ordenarlo cronológicamente en la Hoja de Ruta en Terreno.
 */

export function filtrarEventosCalendarParaDia(
  eventosCalendar: CalendarEventItem[],
  diaBA: { ddmm: string; isoDate: string },
  ahoraMs?: number
): CalendarEventItem[] {
  const base =
    ahoraMs !== undefined
      ? filtrarEventosCalendarVigentes(eventosCalendar, ahoraMs)
      : deduplicarEventosCalendar(eventosCalendar);
  return base.filter((ev) => {
    if (ev.fechaISO && ev.fechaISO === diaBA.isoDate) return true;
    if (ev.fecha && ev.fecha === diaBA.ddmm) return true;
    if (ev.startIso && ev.startIso.startsWith(diaBA.isoDate)) return true;
    return false;
  });
}

/**
 * Motor "Hacer un Corte": Revisa toda la información cargada, toma en cuenta la FECHA Y HORA ACTUAL
 * en Buenos Aires, detecta visitas/encuentros pendientes vencidos (sin cambio a "Ya adhirió"),
 * descarta a todas las personas ya adheridas y arma la Agenda Recomendada Día por Día
 * SÓLO con quienes tienen dirección, punto de encuentro o lugar determinado en Google Sheets / Sección 1,
 * contemplando los eventos de Google Calendar, sus traslados, el cálculo real de ruta y los Cafés HUB óptimos.
 */

export function parsearICalEventosCalendar(
  icsText: string,
  ahoraMs: number = Date.now(),
  calendarNameOverride?: string
): CalendarEventItem[] {
  if (!icsText || !icsText.includes('BEGIN:VCALENDAR')) return [];

  // Desplegar líneas continuadas según RFC 5545 (CRLF o LF seguido de espacio o tab)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let calendarName = calendarNameOverride || 'Mi Google Calendar';
  for (const line of lines) {
    if (line.startsWith('X-WR-CALNAME:')) {
      calendarName = line.slice('X-WR-CALNAME:'.length).trim() || calendarName;
      break;
    }
  }

  const unescapeIcsText = (val: string) =>
    val
      .replace(/\\n/gi, ' ')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();

  const parseIcsDateToMs = (rawKey: string, rawVal: string): { ms: number; isAllDay: boolean } | null => {
    const val = rawVal.trim();
    // Formato sólo fecha: YYYYMMDD
    if (/^\d{8}$/.test(val)) {
      const y = Number(val.slice(0, 4));
      const m = Number(val.slice(4, 6)) - 1;
      const d = Number(val.slice(6, 8));
      // 09:00 hora Buenos Aires (12:00 UTC)
      return { ms: Date.UTC(y, m, d, 12, 0, 0), isAllDay: true };
    }
    const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const min = Number(m[5]);
    const sec = Number(m[6]);
    const isUtc = Boolean(m[7]) || /TZID=UTC/i.test(rawKey);
    if (isUtc) {
      return { ms: Date.UTC(year, month, day, hour, min, sec), isAllDay: false };
    }
    // Si está en hora local de Argentina (UTC-3), convertir a UTC sumando 3 horas
    return { ms: Date.UTC(year, month, day, hour + 3, min, sec), isAllDay: false };
  };

  const minWindowMs = ahoraMs - 24 * 3600 * 1000;
  const maxWindowMs = ahoraMs + 14 * 86400 * 1000;

  const events: CalendarEventItem[] = [];
  let inEvent = false;
  let currentProps: Record<string, { key: string; value: string }> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentProps = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      const status = currentProps.STATUS?.value?.toUpperCase();
      if (status === 'CANCELLED') continue;

      const dtStartProp = currentProps.DTSTART;
      if (!dtStartProp) continue;
      const parsedStart = parseIcsDateToMs(dtStartProp.key, dtStartProp.value);
      if (!parsedStart) continue;

      const dtEndProp = currentProps.DTEND;
      const parsedEnd = dtEndProp ? parseIcsDateToMs(dtEndProp.key, dtEndProp.value) : null;
      const durationMs =
        parsedEnd && parsedEnd.ms > parsedStart.ms
          ? parsedEnd.ms - parsedStart.ms
          : parsedStart.isAllDay
          ? 2 * 3600 * 1000
          : 3600 * 1000;

      const summary = unescapeIcsText(currentProps.SUMMARY?.value || 'Compromiso en Calendar');
      const location = unescapeIcsText(currentProps.LOCATION?.value || '');
      const uid = currentProps.UID?.value || `ics-${events.length + 1}`;
      const rrule = currentProps.RRULE?.value || '';

      const candidateStarts: number[] = [];
      if (parsedStart.ms >= minWindowMs && parsedStart.ms <= maxWindowMs) {
        candidateStarts.push(parsedStart.ms);
      } else if (rrule && parsedStart.ms < maxWindowMs) {
        // Proyectar eventos recurrentes semanales o diarios dentro de la ventana actual
        const untilMatch = rrule.match(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i);
        const untilParsed = untilMatch ? parseIcsDateToMs('UNTIL', untilMatch[1]) : null;
        const maxAllowedMs = untilParsed ? Math.min(maxWindowMs, untilParsed.ms) : maxWindowMs;

        if (/FREQ=WEEKLY/i.test(rrule)) {
          let cursor = parsedStart.ms;
          while (cursor <= maxAllowedMs) {
            if (cursor >= minWindowMs) candidateStarts.push(cursor);
            cursor += 7 * 86400 * 1000;
          }
        } else if (/FREQ=DAILY/i.test(rrule)) {
          let cursor = parsedStart.ms;
          while (cursor <= maxAllowedMs) {
            if (cursor >= minWindowMs) candidateStarts.push(cursor);
            cursor += 86400 * 1000;
          }
        }
      }

      for (const startMs of candidateStarts) {
        const endMs = startMs + durationMs;
        const startBA = obtenerPartesFechaHoraBA(startMs);
        const endBA = obtenerPartesFechaHoraBA(endMs);
        events.push({
          id: `${uid}-${startBA.isoDate}-${startBA.hhmm}`,
          summary,
          location: location || 'CABA',
          fecha: startBA.ddmm,
          fechaISO: startBA.isoDate,
          startTime: parsedStart.isAllDay ? '09:00' : startBA.hhmm,
          endTime: parsedStart.isAllDay ? '18:00' : endBA.hhmm,
          startIso: new Date(startMs).toISOString(),
          endIso: new Date(endMs).toISOString(),
          calendarName,
          source: 'ical',
        });
      }
      continue;
    }

    if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const fullKey = line.slice(0, colonIdx);
        const baseKey = fullKey.split(';')[0].toUpperCase();
        const val = line.slice(colonIdx + 1);
        currentProps[baseKey] = { key: fullKey, value: val };
      }
    }
  }

  return deduplicarEventosCalendar(events).sort((a, b) =>
    (a.startIso || '').localeCompare(b.startIso || '')
  );
}

/**
 * Parsea texto libre copiado de Google Calendar (vista Agenda/Semana) y extrae eventos con fecha, hora y lugar.
 * Ejemplos soportados:
 * - "21/10 11:00 - 12:30 Reunión equipo | Av. Cabildo 2040, Belgrano"
 * - "Miércoles 21/10 18:30 a 20:00 Encuentro Chile 1408, Monserrat"
 */
export function parsearTextoAgendaCalendar(
  texto: string,
  ahoraMs: number = Date.now()
): CalendarEventItem[] {
  if (!texto || !texto.trim()) return [];
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const resultados: CalendarEventItem[] = [];
  let fechaActivaDDMM = hoyBA.ddmm;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const mFecha = linea.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (mFecha) {
      fechaActivaDDMM = `${String(Number(mFecha[1])).padStart(2, '0')}/${String(
        Number(mFecha[2])
      ).padStart(2, '0')}`;
    }

    const mHora = linea.match(
      /\b(\d{1,2}:\d{2})\s*(?:[-–a]|hasta)?\s*(\d{1,2}:\d{2})?\b/i
    );
    if (!mHora) continue;

    const padHHMM = (hStr: string) => {
      const [h, m] = hStr.split(':').map(Number);
      return `${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
    };

    const startTime = padHHMM(mHora[1]);
    const endTime = mHora[2] ? padHHMM(mHora[2]) : sumarMinutosAHora(startTime, 60);

    let resto = linea
      .replace(mHora[0], '')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, '')
      .replace(
        /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|ma[ñn]ana)\b/gi,
        ''
      )
      .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
      .trim();

    if (!resto) resto = 'Compromiso en Calendar';

    let summary = resto;
    let location = 'CABA';

    if (resto.includes('|')) {
      const partes = resto.split('|').map((p) => p.trim());
      summary = partes[0] || 'Compromiso';
      location = partes.slice(1).join(', ') || 'CABA';
    } else {
      const mParen = resto.match(/\(([^)]+)\)\s*$/);
      if (mParen) {
        location = mParen[1].trim();
        summary = resto.replace(mParen[0], '').trim() || location;
      } else if (/\b en \b/i.test(resto)) {
        const idxEn = resto.toLowerCase().lastIndexOf(' en ');
        summary = resto.slice(0, idxEn).trim();
        location = resto.slice(idxEn + 4).trim();
      }
    }

    const [dd, mm] = fechaActivaDDMM.split('/');
    const fechaISO = `${hoyBA.year}-${mm}-${dd}`;

    resultados.push({
      id: `manual-txt-${Date.now()}-${i}`,
      summary,
      location,
      fecha: fechaActivaDDMM,
      fechaISO,
      startTime,
      endTime,
      startIso: `${fechaISO}T${startTime}:00-03:00`,
      endIso: `${fechaISO}T${endTime}:00-03:00`,
      source: 'manual',
    });
  }

  return resultados;
}

/**
 * Construye el enlace de envío en 1 clic a WhatsApp (wa.me) con el texto codificado
 */

