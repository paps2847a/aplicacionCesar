import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';
import { CalendarEventItem, VoiceProfile } from '../../types';
import {
  COORDENADAS_BARRIOS_CABA,
  COORDENADAS_DIRECCIONES_CABA,
} from '../../data/estatusPopurriData';
import { compararFechaDDMMConHoyBA, horaAMinutosDelDia, obtenerPartesFechaHoraBA, sumarMinutosAHora } from './availability';
import {
  EVENTOS_FICTICIOS_LEGACY_IDS,
  EVENTOS_FICTICIOS_LEGACY_SUMMARIES,
  geocodificarContactoLocal,
  inferirBarrioDesdeTextoCABA,
  resolverCoordenadasPartidaPerfil,
} from '../geo/cabaLocations';

const DIRECCIONES_CONOCIDAS_POR_RESUMEN_CALENDAR: { regex: RegExp; location: string }[] = [
  {
    regex: /\bsesi[oó]n\s+de\s+an[aá]lisis\b/i,
    location: 'Av. Sta. Fe 4945, C1425 Cdad. Autónoma de Buenos Aires, Argentina',
  },
  {
    regex: /\bsesi[oó]n\s+de\s+terapia\s+en\s+pareja\b/i,
    location: 'Arévalo 2885, C1426DJC Cdad. Autónoma de Buenos Aires, Argentina',
  },
  {
    regex: /\bcita\s+con\s+el\s+barbero\b/i,
    location: 'Formal Barbería, Ugarteche 2940, C1425 CABA, Argentina',
  },
  {
    regex: /\bhagamos\s+popurr[ií]\b/i,
    location: 'Chile 1408, C1098ABD Cdad. Autónoma de Buenos Aires, Argentina',
  },
];

export function enriquecerDireccionEventoCalendar(ev: CalendarEventItem): string {
  const loc = String(ev.location || '').trim();
  if (loc && loc.toUpperCase() !== 'CABA') {
    return loc;
  }
  const summary = String(ev.summary || '').trim();
  for (const item of DIRECCIONES_CONOCIDAS_POR_RESUMEN_CALENDAR) {
    if (item.regex.test(summary)) {
      return item.location;
    }
  }
  return loc;
}

export function esEventoVirtualCalendar(ev: CalendarEventItem): boolean {
  const texto = `${ev.summary || ''} ${ev.location || ''}`.toLowerCase();
  return /\b(virtual|zoom|meet|google\s*meet|teams|online|remota|videollamada|streaming|webinar|meet\.google\.com|zoom\.us)\b/i.test(
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
  const locationEfectiva = enriquecerDireccionEventoCalendar(ev);
  if (typeof ev.lat === 'number' && typeof ev.lng === 'number') {
    return { lat: ev.lat, lng: ev.lng, label: locationEfectiva || ev.summary };
  }
  if (esEventoVirtualCalendar(ev)) {
    return {
      lat: profile.latPartida,
      lng: profile.lngPartida,
      label: 'Virtual (sin traslado físico)',
    };
  }
  const loc = `${locationEfectiva} ${ev.summary || ''}`
    .toLowerCase()
    .replace(/\bsta\.?\s*fe\b/g, 'santa fe')
    .replace(/\bcnel\.?\b/g, 'coronel')
    .replace(/\bgral\.?\b/g, 'general');
  const coordenadasOrdenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
    (a, b) => b.match.length - a.match.length
  );
  for (const d of coordenadasOrdenadas) {
    if (loc.includes(d.match)) {
      return { lat: d.lat, lng: d.lng, label: locationEfectiva || d.label };
    }
  }
  if (loc.includes('santa fe 32') || loc.includes('santa fe 31') || loc.includes('santa fe 33')) {
    return { lat: -34.5882, lng: -58.4112, label: locationEfectiva || 'Av. Santa Fe 3242, Palermo, CABA' };
  }
  if (loc.includes('virrey arredondo') || loc.includes('loreto garden') || loc.includes('virrey loreto')) {
    return { lat: -34.5688, lng: -58.4512, label: locationEfectiva || 'Virrey Arredondo 2427, Colegiales, CABA' };
  }
  if (loc.includes('cabildo')) {
    return { lat: -34.5618, lng: -58.4565, label: locationEfectiva || 'Av. Cabildo 2040, Belgrano, CABA' };
  }
  if (loc.includes('chile 1408')) {
    return { lat: -34.6158, lng: -58.3862, label: locationEfectiva || 'Chile 1408, Monserrat, CABA' };
  }

  // Inferir barrio por calle + altura o intersección antes de buscar nombres de barrios sueltos
  if (locationEfectiva && locationEfectiva.toUpperCase() !== 'CABA') {
    const barrioPorCalle = inferirBarrioDesdeTextoCABA(locationEfectiva, '');
    if (barrioPorCalle) {
      const geoLocal = geocodificarContactoLocal(locationEfectiva, barrioPorCalle, ev.id || '0');
      return {
        lat: geoLocal.lat,
        lng: geoLocal.lng,
        label: locationEfectiva,
      };
    }
  }

  for (const [barrio, coords] of Object.entries(COORDENADAS_BARRIOS_CABA)) {
    const bLow = barrio.toLowerCase();
    if (bLow === 'flores' && /\blas\s+flores\b/i.test(loc)) continue;
    const regexBarrio = new RegExp(`\\b${bLow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regexBarrio.test(loc)) {
      return { lat: coords.lat, lng: coords.lng, label: locationEfectiva || `${barrio}, CABA` };
    }
  }
  const partida = resolverCoordenadasPartidaPerfil(profile);
  return {
    lat: partida.lat,
    lng: partida.lng,
    label: locationEfectiva || profile.direccionPartida,
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

    const locationEnriquecida = enriquecerDireccionEventoCalendar(ev);
    const evConLoc: CalendarEventItem = {
      ...ev,
      id: uniqueId,
      location: locationEnriquecida || ev.location,
      fecha: fechaDDMM || ev.fecha,
      fechaISO: fechaISO || ev.fechaISO,
    };
    const tieneDirEspecifica =
      Boolean(evConLoc.location) &&
      String(evConLoc.location || '').trim().toUpperCase() !== 'CABA' &&
      !esEventoVirtualCalendar(evConLoc);
    if (tieneDirEspecifica) {
      const geo = geocodificarEventoCalendar({ ...evConLoc, lat: undefined, lng: undefined });
      evConLoc.lat = geo.lat;
      evConLoc.lng = geo.lng;
    }

    resultado.push(evConLoc);
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

  interface ParsedVEventBlock {
    props: Record<string, { key: string; value: string }>;
    exdates: string[];
  }
  const rawBlocks: ParsedVEventBlock[] = [];
  let inEvent = false;
  let currentProps: Record<string, { key: string; value: string }> = {};
  let currentExdates: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentProps = {};
      currentExdates = [];
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      rawBlocks.push({ props: currentProps, exdates: currentExdates });
      continue;
    }
    if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const fullKey = line.slice(0, colonIdx);
        const baseKey = fullKey.split(';')[0].toUpperCase();
        const val = line.slice(colonIdx + 1);
        if (baseKey === 'EXDATE') {
          currentExdates.push(val);
        } else {
          currentProps[baseKey] = { key: fullKey, value: val };
        }
      }
    }
  }

  // Primer pase: recolectar por UID las fechas anuladas/reprogramadas con RECURRENCE-ID y la ubicación base de la serie
  const recurrenceOverrideDatesByUid = new Map<string, Set<string>>();
  const masterLocationByUid = new Map<string, string>();
  for (const block of rawBlocks) {
    const uid = block.props.UID?.value;
    if (!uid) continue;
    const loc = unescapeIcsText(block.props.LOCATION?.value || '');
    if (loc && block.props.RRULE?.value) {
      masterLocationByUid.set(uid, loc);
    }
    const recIdProp = block.props['RECURRENCE-ID'];
    if (recIdProp) {
      const parsedRec = parseIcsDateToMs(recIdProp.key, recIdProp.value);
      if (parsedRec) {
        const recBA = obtenerPartesFechaHoraBA(parsedRec.ms);
        if (!recurrenceOverrideDatesByUid.has(uid)) {
          recurrenceOverrideDatesByUid.set(uid, new Set());
        }
        recurrenceOverrideDatesByUid.get(uid)!.add(recBA.isoDate);
      }
    }
  }

  const events: CalendarEventItem[] = [];

  for (const block of rawBlocks) {
    const currentProps = block.props;
    const currentExdates = block.exdates;
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
    const uid = currentProps.UID?.value || `ics-${events.length + 1}`;
    const rawLocation =
      unescapeIcsText(currentProps.LOCATION?.value || '') || masterLocationByUid.get(uid) || '';
    const conferenceUrl = unescapeIcsText(currentProps['X-GOOGLE-CONFERENCE']?.value || '');
    const description = unescapeIcsText(currentProps.DESCRIPTION?.value || '');
    const esConferenciaVirtualSinDireccion =
      !rawLocation &&
      (Boolean(conferenceUrl) ||
        /\b(meet\.google\.com|zoom\.us|teams\.microsoft\.com)\b/i.test(description));
    const location =
      rawLocation ||
      (esConferenciaVirtualSinDireccion
        ? 'Virtual (Google Meet)'
        : enriquecerDireccionEventoCalendar({ id: uid, summary, location: '', startTime: '00:00', endTime: '00:00' }) ||
          'CABA');
    const rrule = currentProps.RRULE?.value || '';

    const exdateIsoSet = new Set<string>(recurrenceOverrideDatesByUid.get(uid) || []);
    for (const rawEx of currentExdates) {
      const parts = rawEx.split(',');
      for (const p of parts) {
        const parsedEx = parseIcsDateToMs('EXDATE', p.trim());
        if (parsedEx) {
          const exBA = obtenerPartesFechaHoraBA(parsedEx.ms);
          exdateIsoSet.add(exBA.isoDate);
        }
      }
    }

    const candidateStarts: number[] = [];
    if (!rrule) {
      if (parsedStart.ms + durationMs >= ahoraMs && parsedStart.ms <= maxWindowMs) {
        candidateStarts.push(parsedStart.ms);
      }
    } else if (parsedStart.ms <= maxWindowMs) {
      // Proyectar eventos recurrentes respetando estrictamente COUNT, UNTIL, INTERVAL, EXDATE y RECURRENCE-ID
      const untilMatch = rrule.match(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i);
      const untilParsed = untilMatch ? parseIcsDateToMs('UNTIL', untilMatch[1]) : null;
      const countMatch = rrule.match(/COUNT=(\d+)/i);
      const countLimit = countMatch ? Math.max(1, Number(countMatch[1])) : null;
      const intervalMatch = rrule.match(/INTERVAL=(\d+)/i);
      const interval = intervalMatch ? Math.max(1, Number(intervalMatch[1])) : 1;

      const maxAllowedMs = untilParsed ? Math.min(maxWindowMs, untilParsed.ms) : maxWindowMs;

      // Si un evento semanal/diario viejo no tiene UNTIL ni COUNT y empezó hace más de 180 días,
      // salvo que haya sido modificado recientemente (LAST-MODIFIED dentro de los últimos 180 días), no proyectar rutinas históricas antiguas.
      const lastModProp = currentProps['LAST-MODIFIED'];
      const parsedLastMod = lastModProp ? parseIcsDateToMs(lastModProp.key, lastModProp.value) : null;
      const modificadoRecientemente =
        parsedLastMod !== null && parsedLastMod.ms >= ahoraMs - 180 * 86400 * 1000;
      const esSerieAntiguaSinFin =
        !untilParsed &&
        !countLimit &&
        parsedStart.ms < ahoraMs - 180 * 86400 * 1000 &&
        !modificadoRecientemente;

      if (!esSerieAntiguaSinFin && maxAllowedMs >= minWindowMs) {
        if (/FREQ=WEEKLY/i.test(rrule)) {
          let cursor = parsedStart.ms;
          let occurrences = 0;
          const stepMs = interval * 7 * 86400 * 1000;
          while (cursor <= maxAllowedMs) {
            occurrences++;
            if (countLimit !== null && occurrences > countLimit) break;
            if (cursor + durationMs >= ahoraMs && cursor >= minWindowMs) {
              const cursorBA = obtenerPartesFechaHoraBA(cursor);
              if (!exdateIsoSet.has(cursorBA.isoDate)) {
                candidateStarts.push(cursor);
              }
            }
            cursor += stepMs;
          }
        } else if (/FREQ=DAILY/i.test(rrule)) {
          let cursor = parsedStart.ms;
          let occurrences = 0;
          const stepMs = interval * 86400 * 1000;
          while (cursor <= maxAllowedMs) {
            occurrences++;
            if (countLimit !== null && occurrences > countLimit) break;
            if (cursor + durationMs >= ahoraMs && cursor >= minWindowMs) {
              const cursorBA = obtenerPartesFechaHoraBA(cursor);
              if (!exdateIsoSet.has(cursorBA.isoDate)) {
                candidateStarts.push(cursor);
              }
            }
            cursor += stepMs;
          }
        }
      }
    }

    for (const startMs of candidateStarts) {
      const endMs = startMs + durationMs;
      const startBA = obtenerPartesFechaHoraBA(startMs);
      const endBA = obtenerPartesFechaHoraBA(endMs);
      const itemBase: CalendarEventItem = {
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
      };
      const geo = geocodificarEventoCalendar(itemBase);
      events.push({
        ...itemBase,
        lat: geo.lat,
        lng: geo.lng,
      });
    }
  }

  return filtrarEventosCalendarVigentes(deduplicarEventosCalendar(events), ahoraMs).sort((a, b) =>
    (a.startIso || '').localeCompare(b.startIso || '')
  );
}

export const parsearICalEventos = parsearICalEventosCalendar;

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

