import { analizarFranjaHoraria } from '../calendar/availability';
import {
  esDireccionReconocidaEnCABA,
  extraerCalleOCruce,
  geocodificarContactoLocal,
  inferirBarrioDesdeDireccionOComentario,
} from '../geo/cabaLocations';
import { OpcionesCafeMensaje } from '../geo/cafesHub';
import { FranjaHoraria, MicroCluster, RawContactRow, TipoPlantillaWA } from '../../types';
import { filtrarEventosCalendarVigentes } from '../calendar/calendarEvents';
import {
  BloqueAgendaRecomendado,
  CalendarEventItem,
  Contact,
  CorteResultado,
  ItemColaCorte,
  ModalidadEncuentroAgenda,
  ModoMensajeTerrenoRuta,
  ParadaRuta,
  TipoRespuestaPropuestaAgenda,
  VoiceProfile,
} from '../../types';
import { COORDENADAS_BARRIOS_CABA, DEFAULT_VOICE_PROFILE, INITIAL_CALENDAR_EVENTS } from '../../data/estatusPopurriData';
import {
  calcularMinutosTrasladoCABA,
  distanciaHaversineMetros,
  estimarMinutosCaminandoCABA,
  normalizarBarrioCABA,
  resolverCoordenadasPartidaPerfil,
} from '../geo/cabaLocations';
import {
  describirCafeConDistanciaDesdeContacto,
  seleccionarCafesHubPorCercaniaYFranja,
} from '../geo/cafesHub';
import {
  analizarDisponibilidadColumnaG,
  compararFechaDDMMConHoyBA,
  detectarAlertaPendienteVencido,
  extraerFechasMencionadas,
  extraerHoraPactadaExplicita,
  horaAMinutosDelDia,
  obtenerPartesFechaHoraBA,
  sumarDiasAFechaBA,
  sumarMinutosAHora,
} from '../calendar/availability';
import {
  deduplicarEventosCalendar,
  esEventoVirtualCalendar,
  filtrarEventosCalendarParaDia,
  geocodificarEventoCalendar,
} from '../calendar/calendarEvents';
import { construirMicroClusters, esRetiroFichasConfirmadoParaRuta } from './clustering';
import {
  aplicarReglaSaludoMismoDia,
  corregirPelonesDiaSemanaEnTexto,
  postProcesarMensajeAntiPelonesYSaludo,
} from '../messaging/greetingsAndTone';
import { extraerPrimerNombre } from '../contacts/nameCorrection';
import { CATALOGO_CAFES_HUB_CABA, buscarCafeHubMasCercano } from '../../data/cafesHubCatalog';
import {
  obtenerRangoHorarioEfectivoContacto,
  procesarContacto,
  resolverFechaObjetivoContacto,
  sonHorariosCompatiblesEnCircuito,
} from '../contacts/contactStatus';
import { calcularResumenKPIsPadron } from '../tasks/dailyTasks';
import { diagnosticarYGenerarMensajeSeguimiento48h, generarMensajeContextual } from '../messaging/messageTemplates';
import { actualizarDatosContactoEnApp } from '../sync/dataMerging';

function obtenerTextoHorarioAgendaContacto(c: {
  diasEncuentro?: string;
  horarioEncuentro?: string;
  horaInicio?: string;
  horaFin?: string;
  comentario?: string;
}): string {
  const horario =
    c.horarioEncuentro ||
    (c.horaInicio && c.horaFin ? `${c.horaInicio} a ${c.horaFin}` : c.horaInicio || '');
  const tieneEstructurados = Boolean(
    (c.diasEncuentro && c.diasEncuentro.trim()) || horario.trim()
  );
  return [c.diasEncuentro, horario, tieneEstructurados ? '' : c.comentario]
    .filter(Boolean)
    .join(' ');
}

export function esContactoConfirmadoEnLista1a1(contact: Contact): boolean {
  if (
    contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    contact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
  ) {
    return true;
  }
  if (
    contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' &&
    Boolean(contact.retiroConfirmado || /\[confirmado|retiro\s+confirmado/i.test(contact.comentario || ''))
  ) {
    return true;
  }
  if (
    contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    contact.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR'
  ) {
    return false;
  }
  const com = (contact.comentario || '').toLowerCase();
  if (
    /visita\s+confirmada|confirm[oó]\s+caf[eé]\s*hub|declin[oó]\s+caf[eé]\s*hub|pasa\s+a\s+puerta\s+a\s+puerta|prefiere\s+visita\s+puerta\s+a\s+puerta|prefiere\s+punto\s+de\s+encuentro\s+caf[eé]\s*hub/i.test(
      com
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Calcula una hoja de ruta secuencial optimizada sólo para NO adheridos,
 * verificando tiempos reales, eventos de Google Calendar y los TRASLADOS hacia/desde las direcciones de esos eventos.
 *
 * REGLAS CLAVE:
 * 1) Si un vecino dejó una FRANJA HORARIA AMPLIA en Columna G (ej. "entre 9 y 16:00"), el sistema NO asume
 *    que debe cancelar/reprogramar por un evento de Calendar de 50 min: define automáticamente un horario
 *    conveniente libre dentro de esa franja (o propone el Café HUB del bloque) y ordena las paradas por horario.
 * 2) Ninguna parada puede quedar superpuesta con ningún evento de Google Calendar (ni almuerzos, ni dentista,
 *    ni terapia, ni reuniones virtuales): si un evento bloquea el cursor, la ruta avanza automáticamente al
 *    finalizar la cadena de eventos de Calendar.
 * 3) Si una parada corresponde al día de HOY y su horario ya pasó sin que la persona haya adherido, se marca
 *    explícitamente con `vencidaSinAdherir: true` para alertar y reprogramar.
 */
export function calcularHojaDeRuta(
  paradas: Contact[],
  horaSalidaStr: string = '09:40',
  bufferMinutos: number = 9,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  eventosCalendar: CalendarEventItem[] = [],
  fechaRutaDDMM?: string,
  opcionesRuta?: {
    cafeHubBloque?: { nombre: string; direccion: string; lat?: number; lng?: number };
    modalidadBloque?: ModalidadEncuentroAgenda;
    idsConfirmados1a1?: Set<string>;
    contactosMismoDia?: Contact[];
    ahoraMs?: number;
    origenPersonalizado?: {
      lat: number;
      lng: number;
      nombre: string;
      direccionMaps: string;
    };
  }
): ParadaRuta[] {
  // Regla: considerar personas que aún NO han adherido (o que tienen retiro de fichas extra pendiente) y que tienen dirección o punto en Columna G ("Comentario")
  const paradasNoAdheridas = paradas.filter(
    (c) =>
      (c.adhirio !== 'Sí' ||
        c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        c.situacion === 'RETIRO_FICHAS') &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      Boolean((c.calleOCruce && c.calleOCruce.trim().length > 0) || c.tienePuntoEncuentroDeterminado)
  );
  if (paradasNoAdheridas.length === 0) return [];

  const ahoraRefMs = opcionesRuta?.ahoraMs ?? Date.now();
  const hoyBA = obtenerPartesFechaHoraBA(ahoraRefMs);
  const minutosActualesBA = hoyBA.hour * 60 + hoyBA.minute;
  const esRutaDeHoy = !fechaRutaDDMM || fechaRutaDDMM === hoyBA.ddmm;

  const eventosUnicos = deduplicarEventosCalendar(eventosCalendar).filter(
    (ev) =>
      !(
        ev.id?.startsWith('route-') ||
        /recorrido puerta a puerta|ruta casa x casa|bloque caf[eé] hub/i.test(ev.summary || '')
      )
  );
  const eventosDelDiaRuta = fechaRutaDDMM
    ? eventosUnicos.filter((ev) => !ev.fecha || ev.fecha === fechaRutaDDMM)
    : eventosUnicos.filter((ev) => !ev.fecha || ev.fecha === hoyBA.ddmm);
  const eventosParaEvaluar = [...eventosDelDiaRuta].sort(
    (a, b) => horaAMinutosDelDia(a.startTime) - horaAMinutosDelDia(b.startTime)
  );

  // Determinar el Café HUB único del bloque (para que coincida 100% entre Agenda Día por Día, recuadro amarillo y Mensaje WA)
  const barrioModa = paradasNoAdheridas[0]?.barrio || 'Palermo';
  const rankingCafesGrupo = seleccionarCafesHubPorCercaniaYFranja(
    paradasNoAdheridas,
    barrioModa,
    fechaRutaDDMM || hoyBA.ddmm,
    profile
  ).cafesRanking;
  const cafeDelBloque = opcionesRuta?.cafeHubBloque || (rankingCafesGrupo[0]
    ? {
        nombre: rankingCafesGrupo[0].nombre,
        direccion: rankingCafesGrupo[0].direccion,
        lat: rankingCafesGrupo[0].lat,
        lng: rankingCafesGrupo[0].lng,
      }
    : undefined);

  const partidaResuelta = resolverCoordenadasPartidaPerfil(profile);

  // Función auxiliar para resolver la ubicación real de encuentro de cada contacto
  // (si el vecino confirmó encuentro en un Café HUB, o el bloque es CAFE_HUB, usa las coordenadas y dirección del Café HUB en lugar de su domicilio)
  const obtenerUbicacionEncuentroContacto = (c: Contact): {
    lat: number;
    lng: number;
    destinoNombre: string;
    destinoDireccionMaps: string;
    esCafeHubConfirmado?: boolean;
  } => {
    const comLow = (c.comentario || '').toLowerCase();
    const declinoCafe =
      comLow.includes('declinó café') ||
      comLow.includes('declino cafe') ||
      comLow.includes('pasa a puerta a puerta') ||
      comLow.includes('visita puerta a puerta') ||
      comLow.includes('visita confirmada puerta a puerta') ||
      /confirmado\s+1-a-1[^\]]*puerta\s+a\s+puerta/i.test(comLow);

    const matchCafeEnComentario = (c.comentario || '').match(/Caf[eé]\s*Hub:\s*([^\])·]+)/i);
    const confirmoEnCafeHub =
      !declinoCafe &&
      (Boolean(matchCafeEnComentario?.[1]?.trim()) ||
        /encuentro\s+confirmado\s+en\s+caf[eé]|confirm[oó]\s+caf[eé]\s*hub|confirmado\s+1-a-1[^\]]*caf[eé]\s*hub/i.test(
          comLow
        ) ||
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
        (opcionesRuta?.modalidadBloque === 'CAFE_HUB' && cafeDelBloque));

    if (confirmoEnCafeHub) {
      const textoCafe = matchCafeEnComentario?.[1]?.trim() || cafeDelBloque?.nombre || '';
      const nombreLimpio = textoCafe.split('(')[0].replace(/—.*$/, '').trim().toLowerCase();
      const catMatch = nombreLimpio
        ? CATALOGO_CAFES_HUB_CABA.find(
            (cf) =>
              cf.nombre.toLowerCase().includes(nombreLimpio) ||
              nombreLimpio.includes(cf.nombre.toLowerCase())
          )
        : undefined;
      const cafeResuelto = catMatch
        ? {
            nombre: catMatch.nombre,
            direccion: catMatch.direccion,
            lat: catMatch.lat,
            lng: catMatch.lng,
          }
        : cafeDelBloque;

      if (cafeResuelto && cafeResuelto.lat !== undefined && cafeResuelto.lng !== undefined) {
        const dirCortaCafe = cafeResuelto.direccion.split(',')[0].trim();
        return {
          lat: cafeResuelto.lat,
          lng: cafeResuelto.lng,
          destinoNombre: `☕ ${cafeResuelto.nombre} · ${dirCortaCafe} (${c.barrio || barrioModa})`,
          destinoDireccionMaps: /argentina/i.test(cafeResuelto.direccion)
            ? cafeResuelto.direccion
            : `${cafeResuelto.direccion}, CABA, Argentina`,
          esCafeHubConfirmado: true,
        };
      }
    }

    if (c.situacion === 'EVENTO_CHILE_1408') {
      return {
        lat: -34.6158,
        lng: -58.3862,
        destinoNombre: 'Chile 1408 (Monserrat)',
        destinoDireccionMaps: 'Chile 1408, Monserrat, CABA, Argentina',
      };
    }

    if (c.calleOCruce && c.calleOCruce.trim().length > 0) {
      const barrioMaps = /chile\s+1408/i.test(c.calleOCruce) ? 'Monserrat' : c.barrio || 'Palermo';
      return {
        lat: c.lat,
        lng: c.lng,
        destinoNombre: `${c.calleOCruce} (${barrioMaps})`,
        destinoDireccionMaps: `${c.calleOCruce}, ${barrioMaps}, CABA, Argentina`,
      };
    }

    if (cafeDelBloque && cafeDelBloque.lat !== undefined && cafeDelBloque.lng !== undefined) {
      const dirCortaCafe = cafeDelBloque.direccion.split(',')[0].trim();
      return {
        lat: cafeDelBloque.lat,
        lng: cafeDelBloque.lng,
        destinoNombre: `☕ ${cafeDelBloque.nombre} · ${dirCortaCafe} (${c.barrio || barrioModa})`,
        destinoDireccionMaps: /argentina/i.test(cafeDelBloque.direccion)
          ? cafeDelBloque.direccion
          : `${cafeDelBloque.direccion}, Argentina`,
      };
    }
    return {
      lat: c.lat,
      lng: c.lng,
      destinoNombre: `${c.barrio}, CABA`,
      destinoDireccionMaps: c.direccionMaps,
    };
  };

  // Ordenar inicialmente priorizando:
  // 1) Vecinos con hora puntual pactada más temprana (para cumplir horarios fijos como Laura 10:00 hs o Felipe 15:00 hs)
  // 2) Vecinos con ventana horaria más acotada/temprana y cercanía geográfica desde la ubicación previa
  const origenInicial = opcionesRuta?.origenPersonalizado || {
    lat: partidaResuelta.lat,
    lng: partidaResuelta.lng,
    nombre: profile.direccionPartida,
    direccionMaps: partidaResuelta.direccionMaps,
  };

  const pendientes = [...paradasNoAdheridas];
  const ordenadas: Contact[] = [];
  let actualLat = origenInicial.lat;
  let actualLng = origenInicial.lng;

  while (pendientes.length > 0) {
    let mejorIdx = 0;
    let menorScore = Infinity;
    for (let i = 0; i < pendientes.length; i++) {
      const cand = pendientes[i];
      const ubiCand = obtenerUbicacionEncuentroContacto(cand);
      const d = distanciaHaversineMetros(actualLat, actualLng, ubiCand.lat, ubiCand.lng);
      const disp = analizarDisponibilidadColumnaG(obtenerTextoHorarioAgendaContacto(cand));
      const esConfirmado1a1 = esContactoConfirmadoEnLista1a1(cand);
      let refMinutos = 15 * 60;
      let bonusPuntual = esConfirmado1a1 ? -400 : 0;
      if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
        refMinutos = horaAMinutosDelDia(disp.horaPuntualPactada);
        bonusPuntual = esConfirmado1a1 ? -2500 : -500; // Prioridad estricta a quien pactó o confirmó una hora puntual exacta
      } else if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
        refMinutos = Math.round(disp.minInicioVentana * 0.45 + disp.minFinVentana * 0.55);
        // Priorizar ventanas numéricas explícitas (ej. "entre las 15:30 y las 19:00" o "de 15 a 19") sobre "a la tarde" genérico
        if (/\b(?:entre\s+(?:las\s+)?\d|de\s+(?:las\s+)?\d{1,2}\s+a\s+\d|\d{1,2}:\d{2}\s*(?:a|-)\s*\d)/i.test(obtenerTextoHorarioAgendaContacto(cand))) {
          bonusPuntual -= 320;
        }
      } else if (cand.franjaHoraria === 'Mañana') {
        refMinutos = 10 * 60 + 30;
      } else if (cand.franjaHoraria === 'Mediodía') {
        refMinutos = 13 * 60;
      } else if (cand.franjaHoraria === 'Vespertino') {
        refMinutos = 18 * 60 + 15;
      }
      const score = refMinutos * 2.5 + bonusPuntual + d * 0.04;
      if (score < menorScore) {
        menorScore = score;
        mejorIdx = i;
      }
    }
    const [elegido] = pendientes.splice(mejorIdx, 1);
    ordenadas.push(elegido);
    const ubiElegido = obtenerUbicacionEncuentroContacto(elegido);
    actualLat = ubiElegido.lat;
    actualLng = ubiElegido.lng;
  }

  const bufferEfectivo = bufferMinutos;

  const ejecutarPasadaSecuencial = (secuenciaContactos: Contact[]): ParadaRuta[] => {
    const paradasCrudas: ParadaRuta[] = [];
    let cursorHora = horaSalidaStr;
    let origenNombre = origenInicial.nombre;
    let origenDireccionMaps = origenInicial.direccionMaps;
    let origenLat = origenInicial.lat;
    let origenLng = origenInicial.lng;
    let finVisitaParadaAnteriorMin: number | null = null;

    for (let i = 0; i < secuenciaContactos.length; i++) {
      const c = secuenciaContactos[i];
      const ubiDestino = obtenerUbicacionEncuentroContacto(c);
      const destinoNombre = ubiDestino.destinoNombre;
      const destinoDireccionMaps = ubiDestino.destinoDireccionMaps;
      const destLat = ubiDestino.lat;
      const destLng = ubiDestino.lng;

      const dispColG = analizarDisponibilidadColumnaG(obtenerTextoHorarioAgendaContacto(c));
      const horaPactadaExplicita = dispColG.esVentanaAmplia ? undefined : dispColG.horaPuntualPactada;

      let trasladoActual = calcularMinutosTrasladoCABA(origenLat, origenLng, destLat, destLng);
      let minutosViaje = trasladoActual.minutos;
      let modoTraslado = trasladoActual.modo;

      let horaSalida = cursorHora;
      let notaHorarioConveniente: string | undefined;

      const pactadaExactaMin = horaPactadaExplicita ? horaAMinutosDelDia(horaPactadaExplicita) : null;
      const esConfirmadoConHoraExacta =
        esContactoConfirmadoEnLista1a1(c) && pactadaExactaMin !== null;

      // Verificar si un tramo [iniSalidaMin, finVisitaMin] se superpone con algún evento de Google Calendar.
      // IMPORTANTE: No duplicar tiempos de traslado después del evento; cuando el evento termina en `evFin`,
      // el promotor parte de la ubicación del evento en `evFin` y suma `minutosViaje` hacia la parada `c`.
      const chequearChoqueTramoConCalendar = (
        iniSalidaMin: number,
        finVisitaMin: number,
        stopLat: number,
        stopLng: number
      ) => {
        for (const ev of eventosParaEvaluar) {
          const coincideDia =
            !ev.fecha ||
            !fechaRutaDDMM ||
            ev.fecha === fechaRutaDDMM ||
            c.fechasMencionadas.includes(ev.fecha);
          if (!coincideDia) continue;
          const evIni = horaAMinutosDelDia(ev.startTime);
          const evFin = horaAMinutosDelDia(ev.endTime);
          const esVirtual = esEventoVirtualCalendar(ev);
          const geoEv = geocodificarEventoCalendar(ev, profile);
          const tieneDirFisica = Boolean(
            ev.location && ev.location.trim() && ev.location.trim().toUpperCase() !== 'CABA'
          );
          const trasladoHaciaEv = esVirtual
            ? { minutos: 0, modo: 'WALKING' as const, distanciaMetros: 0, cuadras: 0 }
            : tieneDirFisica
            ? calcularMinutosTrasladoCABA(stopLat, stopLng, geoEv.lat, geoEv.lng)
            : { minutos: 20, modo: 'TRANSIT' as const, distanciaMetros: 1500, cuadras: 15 };
          const margenHaciaEv = esVirtual
            ? 5
            : pactadaExactaMin !== null
            ? 20
            : Math.max(20, Math.min(25, trasladoHaciaEv.minutos + 2));
          const margenPostEv = esVirtual ? 2 : 0;

          if (iniSalidaMin < evFin + margenPostEv && finVisitaMin + margenHaciaEv > evIni) {
            return { ev, geoEv, trasladoEv: trasladoHaciaEv, evIni, evFin, esVirtual, margenHaciaEv, margenPostEv };
          }
        }
        return null;
      };
      const ventanaColGYaVencidaHoy =
        esRutaDeHoy &&
        dispColG.minFinVentana !== undefined &&
        minutosActualesBA >= dispColG.minFinVentana + 5;
      const citaPuntualYaVencidaHoy =
        esRutaDeHoy &&
        ((pactadaExactaMin !== null && minutosActualesBA >= pactadaExactaMin + 5) ||
          ventanaColGYaVencidaHoy);

      // Punto 8 Calibración ("Reservas fantasma"):
      // Guardar la hora de salida objetivo original antes de empujar propuestas no confirmadas para detectar
      // si faltan <= 60 minutos para salir y el vecino aún no confirmó.
      const salidaObjetivoOriginalMin =
        pactadaExactaMin !== null
          ? Math.max(8 * 60, pactadaExactaMin - minutosViaje)
          : dispColG.minInicioVentana !== undefined
          ? Math.max(horaAMinutosDelDia(horaSalida), dispColG.minInicioVentana - minutosViaje)
          : horaAMinutosDelDia(horaSalida);

      // Si es la ruta de HOY y esta parada NO es una cita ya confirmada con hora fija ni ya vencida,
      // dejar brecha prudente de 90 min para confirmación + preparación antes del encuentro (~75 min antes de salir)
      // para darle tiempo a la persona de confirmar y al responsable de alistarse y salir (Puntos 3 y 6).
      const brechaMinimaHoy = esContactoConfirmadoEnLista1a1(c) ? 20 : 75;
      const minHoraSalidaHoy = Math.max(
        9 * 60 + 30,
        Math.ceil((minutosActualesBA + brechaMinimaHoy) / 15) * 15
      );
      if (
        esRutaDeHoy &&
        !citaPuntualYaVencidaHoy &&
        !esConfirmadoConHoraExacta &&
        horaAMinutosDelDia(horaSalida) < minHoraSalidaHoy
      ) {
        horaSalida = sumarMinutosAHora('00:00', minHoraSalidaHoy);
      }

      const salidaActualMin = horaAMinutosDelDia(horaSalida);
      const llegadaActualMin = salidaActualMin + minutosViaje;

      // 1. Posicionar inicialmente según hora puntual pactada o inicio de ventana (incluyendo "por la tarde" >= 14:00)
      if (horaPactadaExplicita && pactadaExactaMin !== null) {
        const salidaParaLlegarPuntualMin = Math.max(8 * 60, pactadaExactaMin - minutosViaje);
        if (esConfirmadoConHoraExacta || citaPuntualYaVencidaHoy || i === 0) {
          horaSalida = sumarMinutosAHora('00:00', salidaParaLlegarPuntualMin);
        } else if (i > 0 && llegadaActualMin < pactadaExactaMin) {
          horaSalida = sumarMinutosAHora('00:00', salidaParaLlegarPuntualMin);
        }
      } else if (ventanaColGYaVencidaHoy && dispColG.minFinVentana !== undefined) {
        const llegadaObjetivoVencida = Math.max(
          dispColG.minInicioVentana ?? 9 * 60,
          dispColG.minFinVentana - 20
        );
        const salidaVencidaMin = Math.max(8 * 60, llegadaObjetivoVencida - minutosViaje);
        horaSalida = sumarMinutosAHora('00:00', salidaVencidaMin);
      } else if (
        dispColG.minInicioVentana !== undefined &&
        llegadaActualMin < dispColG.minInicioVentana
      ) {
        const salidaAlInicioVentana = Math.max(
          salidaActualMin,
          dispColG.minInicioVentana - minutosViaje
        );
        horaSalida = sumarMinutosAHora('00:00', salidaAlInicioVentana);
      }

      // 2. Revisar si justo antes del cursor actual terminó un evento físico de Google Calendar
      //    (y sólo si dicho evento terminó DESPUÉS de la parada anterior visitada, para no pisar el origen secuencial)
      const cursorPreLoopMin = horaAMinutosDelDia(horaSalida);
      const eventoPrevioInmediato = [...eventosParaEvaluar]
        .reverse()
        .find((ev) => {
          if (esEventoVirtualCalendar(ev)) return false;
          const evFin = horaAMinutosDelDia(ev.endTime);
          const ocurrioDespuesDeParadaPrevia =
            finVisitaParadaAnteriorMin === null || evFin >= finVisitaParadaAnteriorMin;
          return (
            ocurrioDespuesDeParadaPrevia &&
            evFin <= cursorPreLoopMin &&
            cursorPreLoopMin - evFin <= 35 &&
            Boolean(ev.location)
          );
        });
      if (eventoPrevioInmediato) {
        const geoEv = geocodificarEventoCalendar(eventoPrevioInmediato, profile);
        const dirCortaEv = geoEv.label.split(',')[0].trim();
        origenNombre = `Evento Calendar: ${eventoPrevioInmediato.summary} (${dirCortaEv})`;
        origenDireccionMaps = /argentina/i.test(geoEv.label)
          ? geoEv.label
          : `${geoEv.label}, Argentina`;
        origenLat = geoEv.lat;
        origenLng = geoEv.lng;
        trasladoActual = calcularMinutosTrasladoCABA(origenLat, origenLng, destLat, destLng);
        minutosViaje = trasladoActual.minutos;
        modoTraslado = trasladoActual.modo;
        if (
          pactadaExactaMin !== null &&
          (esConfirmadoConHoraExacta || citaPuntualYaVencidaHoy || i === 0)
        ) {
          horaSalida = sumarMinutosAHora('00:00', Math.max(8 * 60, pactadaExactaMin - minutosViaje));
        }
      }

      // 3. BUCLE ESTRICTO ANTI-CHOQUE CALENDAR:
      // Si el tramo [horaSalida, horaFinVisita] choca con CUALQUIER evento de Google Calendar (ej. Dentista 11:30-13:00,
      // Almuerzo con Frima 13:15-14:15, Terapia 14:30-15:20 o Reunión virtual 16:00-17:00), avanzar iterativamente
      // hasta el hueco libre más cercano (antes o después si pidió hora fija).
      // IMPORTANTE: Si la cita ya fue CONFIRMADA con hora exacta (`esConfirmadoConHoraExacta`), respetar estrictamente la hora confirmada.
      const eventosSaltados: CalendarEventItem[] = [];
      let guardIter = 0;
      const duracionVisitaParaChoque = pactadaExactaMin !== null ? 10 : bufferEfectivo;
      while (guardIter < 12 && !citaPuntualYaVencidaHoy && !esConfirmadoConHoraExacta) {
        guardIter++;
        const salMin = horaAMinutosDelDia(horaSalida);
        const llegMin = salMin + minutosViaje;
        const finMin = llegMin + duracionVisitaParaChoque;
        const choque = chequearChoqueTramoConCalendar(salMin, finMin, destLat, destLng);
        if (!choque) break;

        if (!eventosSaltados.some((e) => e.id === choque.ev.id)) {
          eventosSaltados.push(choque.ev);
        }

        // Si el vecino fijó una hora puntual (no un rango), evaluar también el hueco inmediatamente ANTERIOR al evento
        // para sugerirle el horario más cercano posible (antes o después) a su hora pedida.
        const nuevaSalidaDespuesMin = choque.evFin + (choque.esVirtual ? 2 : 0);
        const llegadaDespuesMin = nuevaSalidaDespuesMin + minutosViaje;

        if (pactadaExactaMin !== null && guardIter === 1) {
          const finAntesMin = Math.floor((choque.evIni - choque.margenHaciaEv) / 5) * 5;
          const llegadaAntesMin = finAntesMin - duracionVisitaParaChoque;
          const salidaAntesMin = llegadaAntesMin - minutosViaje;
          const respetaParadaPrevia =
            finVisitaParadaAnteriorMin === null || salidaAntesMin >= finVisitaParadaAnteriorMin;
          const respetaHoraActual =
            !esRutaDeHoy || salidaAntesMin >= minutosActualesBA || minutosActualesBA < 8 * 60 + 30;
          if (
            salidaAntesMin >= 8 * 60 + 30 &&
            respetaParadaPrevia &&
            respetaHoraActual &&
            !chequearChoqueTramoConCalendar(salidaAntesMin, finAntesMin, destLat, destLng) &&
            Math.abs(pactadaExactaMin - llegadaAntesMin) < Math.abs(llegadaDespuesMin - pactadaExactaMin)
          ) {
            horaSalida = sumarMinutosAHora('00:00', salidaAntesMin);
            break;
          }
        }

        const nuevaSalidaMin = nuevaSalidaDespuesMin;
        if (nuevaSalidaMin + minutosViaje + bufferEfectivo > 20 * 60 + 15) {
          break;
        }

        if (!choque.esVirtual) {
          const dirCortaEv = choque.geoEv.label.split(',')[0].trim();
          origenNombre = `Evento Calendar: ${choque.ev.summary} (${dirCortaEv})`;
          origenDireccionMaps = /argentina/i.test(choque.geoEv.label)
            ? choque.geoEv.label
            : `${choque.geoEv.label}, Argentina`;
          origenLat = choque.geoEv.lat;
          origenLng = choque.geoEv.lng;
          trasladoActual = calcularMinutosTrasladoCABA(origenLat, origenLng, destLat, destLng);
          minutosViaje = trasladoActual.minutos;
          modoTraslado = trasladoActual.modo;
        }

        horaSalida = sumarMinutosAHora('00:00', nuevaSalidaMin);
      }

      const horaLlegada = sumarMinutosAHora(horaSalida, minutosViaje);
      const horaFinVisita = sumarMinutosAHora(horaLlegada, bufferEfectivo);

      const llegadaVisitaMin = horaAMinutosDelDia(horaLlegada);
      const finVisitaMin = horaAMinutosDelDia(horaFinVisita);
      const pactadaMin = horaPactadaExplicita ? horaAMinutosDelDia(horaPactadaExplicita) : null;

      if (dispColG.esVentanaAmplia && dispColG.etiquetaVentana) {
        if (eventosSaltados.length > 0) {
          const resumenEvs = eventosSaltados
            .map((e) => {
              const dirEv = e.location && e.location.trim().toUpperCase() !== 'CABA' ? ` en ${e.location.split(',')[0]}` : '';
              return `"${e.summary}" (${e.startTime}-${e.endTime}${dirEv})`;
            })
            .join(', ');
          notaHorarioConveniente = `Franja amplia en Col. G (${dispColG.etiquetaVentana}): se reubicó automáticamente a las ${horaLlegada} hs para no superponerse con ${resumenEvs}.`;
        } else {
          notaHorarioConveniente = `Dentro de su franja de Col. G (${dispColG.etiquetaVentana}) · Horario conveniente asignado: ${horaLlegada} hs (sin choques con Calendar).`;
        }
      }

      // Punto 7 Calibración: Traslado a pie (promotor hasta 30 min si es más rápido o hay tiempo disponible)
      // o en Transporte Público directo (1 línea de colectivo / Subte sin combinar múltiples líneas).
      const detalleTransporte =
        trasladoActual.distanciaMetros <= 30
          ? `En el mismo punto de encuentro (${destinoNombre.split(',')[0]})`
          : modoTraslado === 'WALKING'
          ? `A pie (${minutosViaje} min / ${trasladoActual.cuadras} cuadras desde ${origenNombre.split(',')[0]})`
          : trasladoActual.puedeCaminarPromotor30Min
          ? `Transporte Público directo — 1 línea / Subte (~${minutosViaje} min desde ${origenNombre.split(',')[0]} hacia ${c.barrio}) · o ${trasladoActual.minutosCaminando} min a pie (≤30 min)`
          : `Transporte Público directo — 1 línea / Subte (~${minutosViaje} min desde ${origenNombre.split(',')[0]} hacia ${c.barrio})`;

      let conflictoCalendar: string | undefined;
      let alternativaOptimaSugerida: string | undefined;
      let mensajeReprogramacionCalendar: string | undefined;

      const tieneCafeGrupal =
        Boolean(cafeDelBloque) || paradasNoAdheridas.length >= 2;

      const cafeCercano = cafeDelBloque
        ? {
            nombre: cafeDelBloque.nombre,
            direccion: cafeDelBloque.direccion,
            lat: cafeDelBloque.lat ?? destLat,
            lng: cafeDelBloque.lng ?? destLng,
          }
        : tieneCafeGrupal
        ? buscarCafeHubMasCercano(destLat, destLng) || CATALOGO_CAFES_HUB_CABA[0]
        : undefined;

      const distAlCafe = cafeCercano
        ? estimarMinutosCaminandoCABA(destLat, destLng, cafeCercano.lat, cafeCercano.lng)
        : { minutosCaminando: 8, cuadrasAprox: 6, distanciaMetros: 600 };

      const nombreSaludo = c.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${c.primerNombre}, ¿cómo estás?`;
      const fraseCafeParada = cafeCercano
        ? `el café *${cafeCercano.nombre}* (${cafeCercano.direccion.split(',')[0]}, que está a unos ${Math.max(2, Math.round(distAlCafe.minutosCaminando))} minutos de ${destinoNombre})`
        : '';

      // 1. VERIFICAR SI EL HORARIO PACTADO O LA VENTANA DEL CONTACTO FUE DESPLAZADA POR UN EVENTO DE GOOGLE CALENDAR
      if (eventosSaltados.length > 0) {
        const evPrincipal = eventosSaltados[eventosSaltados.length - 1];
        const resumenTodosEvs = eventosSaltados
          .map((e) => {
            const dirEv =
              e.location && e.location.trim().toUpperCase() !== 'CABA'
                ? ` en ${e.location.split(',')[0]}`
                : '';
            return `"${e.summary}" (${e.startTime}-${e.endTime}${dirEv})`;
          })
          .join(' + ');
        const desfasajePactada =
          pactadaMin !== null && Math.abs(llegadaVisitaMin - pactadaMin) >= 15;
        const excedeVentanaColG =
          dispColG.minFinVentana !== undefined && llegadaVisitaMin > dispColG.minFinVentana + 15;

        if (desfasajePactada || excedeVentanaColG) {
          const horaOriginalTxt =
            horaPactadaExplicita || dispColG.etiquetaVentana || evPrincipal.startTime;
          const horarioConvenientePropuesto = `alrededor de las ${horaLlegada} hs`;

          alternativaOptimaSugerida = cafeCercano
            ? `Pasar por ${destinoNombre} hoy ${horarioConvenientePropuesto} (al finalizar ${resumenTodosEvs}), o encontrarnos en ${fraseCafeParada}.`
            : `Pasar por ${destinoNombre} hoy ${horarioConvenientePropuesto} (al finalizar ${resumenTodosEvs}).`;

          conflictoCalendar = `Horario en Col. G (${horaOriginalTxt}) coincide con tu agenda de Calendar (${resumenTodosEvs}). Se reubicó automáticamente a las ${horaLlegada} hs${cafeCercano ? ` o en ${cafeCercano.nombre}` : ''}.`;

          mensajeReprogramacionCalendar = cafeCercano
            ? `${nombreSaludo}\n\nTe pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${destinoNombre}* en el horario de las ${horaOriginalTxt}.\n\nPara adaptarme a lo que te quede más cómodo, te propongo dos opciones:\n1. Pasar 2 minutos por *${destinoNombre}* *${horarioConvenientePropuesto}*.\n2. O si preferís, encontrarnos unos minutos en ${fraseCafeParada}.\n\n¿Cuál de las dos opciones o qué otro horario te viene mejor? Gracias.`
            : `${nombreSaludo}\n\nTe pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${destinoNombre}* en el horario de las ${horaOriginalTxt}. ¿Te quedaría bien que pase 2 minutos por *${destinoNombre}* *${horarioConvenientePropuesto}*, o qué otro horario te resulta más cómodo? Gracias.`;
        }
      }

      // 2. VERIFICAR CHOQUE / SUPERPOSICIÓN CON EL HORARIO/DÍA FIJADO O CONFIRMADO POR OTRA PERSONA
      if (!conflictoCalendar && !dispColG.esVentanaAmplia) {
        const tieneRestriccionFija =
          pactadaMin !== null ||
          (dispColG.minInicioVentana !== undefined && dispColG.minFinVentana !== undefined) ||
          esContactoConfirmadoEnLista1a1(c);
        const cIniDeseado = pactadaMin ?? dispColG.minInicioVentana ?? llegadaVisitaMin;
        const cFinDeseado =
          pactadaMin !== null
            ? pactadaMin + bufferEfectivo
            : dispColG.minFinVentana ?? finVisitaMin;

        if (tieneRestriccionFija) {
          for (const prevP of paradasCrudas) {
            const ambosEnMismoCafeHub =
              c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' &&
              prevP.contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE';
            if (ambosEnMismoCafeHub) continue;

            const prevDisp = analizarDisponibilidadColumnaG(
              obtenerTextoHorarioAgendaContacto(prevP.contact)
            );
            const prevPactadaMin = prevDisp.esVentanaAmplia
              ? null
              : prevDisp.horaPuntualPactada
              ? horaAMinutosDelDia(prevDisp.horaPuntualPactada)
              : null;
            const prevFinMin = horaAMinutosDelDia(prevP.horaFinVisita);
            const trEntreAmbos = calcularMinutosTrasladoCABA(
              prevP.destinoLat,
              prevP.destinoLng,
              destLat,
              destLng
            );

            const chocaDirectoConPactadaPrevia =
              pactadaMin !== null &&
              prevPactadaMin !== null &&
              Math.abs(pactadaMin - prevPactadaMin) < bufferEfectivo + trEntreAmbos.minutos;

            const atrasoPorParadaPrevia =
              (pactadaMin !== null &&
                llegadaVisitaMin > pactadaMin + 10 &&
                prevFinMin + trEntreAmbos.minutos > pactadaMin) ||
              (dispColG.minFinVentana !== undefined &&
                llegadaVisitaMin + bufferEfectivo > dispColG.minFinVentana + 10);

            if (chocaDirectoConPactadaPrevia || atrasoPorParadaPrevia) {
              const horaLibrePostVecino = sumarMinutosAHora(
                prevP.horaFinVisita,
                trEntreAmbos.minutos
              );
              const horaConflictoTxt =
                horaPactadaExplicita || dispColG.etiquetaVentana || prevP.horaLlegada;
              const lugarPrevio = prevP.contact.calleOCruce || prevP.contact.barrio;

              alternativaOptimaSugerida = cafeCercano
                ? `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostVecino} hs (al finalizar el encuentro previo con #${prevP.contact.id} ${prevP.contact.nombreCompletoCorregido} en ${lugarPrevio}, contemplando ~${trEntreAmbos.minutos} min de traslado), o encontrarnos en ${fraseCafeParada}.`
                : `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostVecino} hs (al finalizar el encuentro previo con #${prevP.contact.id} ${prevP.contact.nombreCompletoCorregido} en ${lugarPrevio}, contemplando ~${trEntreAmbos.minutos} min de traslado).`;

              conflictoCalendar = `Horario fijado en Col. G (${horaConflictoTxt} hs) se superpone con el horario/día fijado o confirmado con #${prevP.contact.id} ${prevP.contact.nombreCompletoCorregido} (${prevP.horaLlegada}-${prevP.horaFinVisita} hs en ${lugarPrevio}, ~${trEntreAmbos.minutos} min de traslado). Se sugiere proponer pasar a las ${horaLibrePostVecino} hs${cafeCercano ? ` o en ${cafeCercano.nombre}` : ''}.`;

              mensajeReprogramacionCalendar = cafeCercano
                ? `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto.\n\nQuería proponerte dos opciones para reprogramarlo:\n1. Pasar 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostVecino} hs*.\n2. O bien encontrarnos unos minutos en ${fraseCafeParada}.\n\n¿Cuál te queda más cómoda? Gracias.`
                : `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto. ¿Te queda bien que pase 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostVecino} hs*, o en qué otro horario preferís? Gracias.`;
              break;
            }
          }

          if (!conflictoCalendar && opcionesRuta?.contactosMismoDia) {
            const idsEnParadasCrudas = new Set(paradasCrudas.map((p) => p.contact.id));
            for (const otro of opcionesRuta.contactosMismoDia) {
              if (otro.id === c.id || idsEnParadasCrudas.has(otro.id)) continue;
              if (otro.adhirio === 'Sí' || otro.situacion === 'DESCARTADO_NO_CABA') continue;

              const ambosEnMismoCafeHub =
                c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' &&
                otro.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' &&
                c.barrio === otro.barrio;
              if (ambosEnMismoCafeHub) continue;

              const dispOtro = analizarDisponibilidadColumnaG(
                obtenerTextoHorarioAgendaContacto(otro)
              );
              if (dispOtro.esVentanaAmplia) continue;
              const otroPactadaMin = dispOtro.horaPuntualPactada
                ? horaAMinutosDelDia(dispOtro.horaPuntualPactada)
                : null;
              const otroIniMin = otroPactadaMin ?? dispOtro.minInicioVentana ?? null;
              if (otroIniMin === null) continue;
              const otroFinMin =
                otroPactadaMin !== null
                  ? otroPactadaMin + bufferEfectivo
                  : dispOtro.minFinVentana ?? otroIniMin + bufferEfectivo;

              let compartenDia = false;
              if (fechaRutaDDMM) {
                const cEsDeFechaRuta =
                  c.fechasMencionadas.length === 0 || c.fechasMencionadas.includes(fechaRutaDDMM);
                const otroEsDeFechaRuta =
                  otro.fechasMencionadas.includes(fechaRutaDDMM) ||
                  (otro.fechasMencionadas.length === 0 && esContactoConfirmadoEnLista1a1(otro));
                compartenDia = cEsDeFechaRuta && otroEsDeFechaRuta;
              } else {
                compartenDia =
                  c.fechasMencionadas.length > 0 &&
                  c.fechasMencionadas.some((f) => otro.fechasMencionadas.includes(f));
              }
              if (!compartenDia) continue;

              const ubiOtro = obtenerUbicacionEncuentroContacto(otro);
              const trVecinos = calcularMinutosTrasladoCABA(ubiOtro.lat, ubiOtro.lng, destLat, destLng);

              if (
                cIniDeseado < otroFinMin + trVecinos.minutos &&
                cFinDeseado + trVecinos.minutos > otroIniMin
              ) {
                const horaLibrePostOtro = sumarMinutosAHora(
                  sumarMinutosAHora('00:00', otroFinMin),
                  trVecinos.minutos + 5
                );
                const horaConflictoTxt =
                  horaPactadaExplicita || dispColG.etiquetaVentana || sumarMinutosAHora('00:00', cIniDeseado);
                const horaOtroTxt =
                  dispOtro.horaPuntualPactada ||
                  dispOtro.etiquetaVentana ||
                  sumarMinutosAHora('00:00', otroIniMin);
                const lugarOtro = otro.calleOCruce || otro.barrio;

                alternativaOptimaSugerida = cafeCercano
                  ? `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostOtro} hs (contemplando el encuentro de las ${horaOtroTxt} hs con #${otro.id} ${otro.nombreCompletoCorregido} en ${lugarOtro} y ~${trVecinos.minutos} min de traslado), o encontrarnos en ${fraseCafeParada}.`
                  : `Pasar por ${destinoNombre} alrededor de las ${horaLibrePostOtro} hs (contemplando el encuentro de las ${horaOtroTxt} hs con #${otro.id} ${otro.nombreCompletoCorregido} en ${lugarOtro} y ~${trVecinos.minutos} min de traslado).`;

                conflictoCalendar = `Horario fijado en Col. G (${horaConflictoTxt} hs) se superpone con el horario/día fijado o confirmado con #${otro.id} ${otro.nombreCompletoCorregido} (${horaOtroTxt} hs en ${lugarOtro}, ~${trVecinos.minutos} min de traslado). Se sugiere coordinar a las ${horaLibrePostOtro} hs${cafeCercano ? ` o en ${cafeCercano.nombre}` : ''}.`;

                mensajeReprogramacionCalendar = cafeCercano
                  ? `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto.\n\nQuería proponerte dos opciones:\n1. Pasar 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostOtro} hs*.\n2. O bien encontrarnos unos minutos en ${fraseCafeParada}.\n\n¿Cuál de las dos te queda mejor? Gracias.`
                  : `${nombreSaludo}\n\nTe pido disculpas porque no voy a llegar a cumplir con nuestro compromiso en *${destinoNombre}* a las ${horaConflictoTxt} hs como teníamos previsto. ¿Te queda bien que pase 2 minutos por *${destinoNombre}* *alrededor de las ${horaLibrePostOtro} hs*, o en qué otro horario te resulta más cómodo? Gracias.`;
                break;
              }
            }
          }
        }
      }

      if (!mensajeReprogramacionCalendar) {
        const altCafeTxt = cafeCercano
          ? `o encontrarnos 2 minutos en ${fraseCafeParada}`
          : `o coordinar en otro horario que te quede cómodo`;
        alternativaOptimaSugerida = cafeCercano
          ? `Pasar en el horario conveniente de las ${horaLlegada} hs por ${destinoNombre} o en ${fraseCafeParada}.`
          : `Pasar en el horario conveniente de las ${horaLlegada} hs por ${destinoNombre}.`;
        mensajeReprogramacionCalendar = `${nombreSaludo}\n\nTe pido disculpas porque hoy no voy a poder cumplir con nuestro compromiso de pasar por *${destinoNombre}* en el horario que teníamos previsto.\n\nPara adaptarme a lo que te quede más cómodo esta semana en ${c.barrio}, ¿preferís que reprogramemos la pasada de 2 minutos por *${destinoNombre}* para mañana, ${altCafeTxt}? Avisame qué día y franja te viene mejor.`;
      }

      // Exclusivo para el botón "🚪 No estaba / Reprogramar" de la pestaña 3 ("3. Hoja de Ruta en Terreno")
      const mensajeNoEstabaReprogramar = cafeCercano
        ? `${nombreSaludo}\n\nRecién pasé un ratito por *${destinoNombre}* dentro del recorrido por ${c.barrio} para los 2 minutos de la firma de adhesión, pero imagino que nos desencuentramos por unos minutos.\n\nNo hay problema. Para reprogramarlo fácil en estos días: ¿preferís que vuelva a pasar 2 minutos por *${destinoNombre}* en otro día y horario puntual, o te queda más cómodo pasar por ${fraseCafeParada}? Avisame cuando puedas y lo agendamos.`
        : `${nombreSaludo}\n\nRecién pasé un ratito por *${destinoNombre}* dentro del recorrido por ${c.barrio} para los 2 minutos de la firma de adhesión, pero imagino que nos desencuentramos por unos minutos.\n\nNo hay problema. ¿Qué otro día y horario te queda cómodo para reprogramar y volver a pasar 2 minutos por *${destinoNombre}*? Avisame cuando puedas y lo agendamos.`;

      // Mensaje de disculpas asumiendo la responsabilidad por no haber podido cumplir el compromiso
      const mensajeDisculpasPorCompromisoIncumplido = cafeCercano
        ? `${nombreSaludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${destinoNombre}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para mañana o el día de esta semana que te quede más cómodo, pasando un ratito por *${destinoNombre}* o bien encontrándonos unos minutos en ${fraseCafeParada}. ¿Qué día y franja horaria te viene mejor?`
        : `${nombreSaludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${destinoNombre}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para mañana o el día de esta semana que te quede más cómodo para pasar 2 minutos por *${destinoNombre}*. ¿Qué día y franja horaria te viene mejor?`;

      const urlGoogleMapsTramo = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        origenDireccionMaps
      )}&destination=${encodeURIComponent(
        destinoDireccionMaps
      )}&travelmode=${modoTraslado.toLowerCase()}`;

      const confirmado1a1 =
        esContactoConfirmadoEnLista1a1(c) ||
        Boolean(opcionesRuta?.idsConfirmados1a1?.has(c.id));

      // Detectar si esta parada en la ruta de HOY ya venció respecto de la hora actual (`ahoraRefMs`) sin haber adherido
      const vencioVentanaHoyPorCalendar =
        esRutaDeHoy &&
        dispColG.minFinVentana !== undefined &&
        minutosActualesBA >= dispColG.minFinVentana - 30 &&
        llegadaVisitaMin > dispColG.minFinVentana + 15;

      const yaPasoHoraParadaHoy =
        esRutaDeHoy &&
        c.adhirio !== 'Sí' &&
        (Boolean(c.alertaVencido?.activa) ||
          citaPuntualYaVencidaHoy ||
          vencioVentanaHoyPorCalendar ||
          minutosActualesBA >= finVisitaMin);

      const motivoVencimiento = yaPasoHoraParadaHoy
        ? c.alertaVencido?.motivo ||
          `El horario previsto hoy (${horaPactadaExplicita || dispColG.etiquetaVentana || horaLlegada} hs) ya pasó siendo las ${hoyBA.hhmm} hs y aún figura sin adherir — reprogramar encuentro o marcar "Ya Adhirió".`
        : undefined;

      const mensajeDisculpasVencido = yaPasoHoraParadaHoy
        ? c.alertaVencido?.mensajeDisculpasReprogramacion || mensajeDisculpasPorCompromisoIncumplido
        : undefined;

      // Punto 8 Calibración ("Reservas fantasma"):
      // Si es para HOY, la persona aún no confirmó (`!confirmado1a1`) y faltan <= 60 min para la hora de salida prevista,
      // separarla de la ruta firme y ofrecerle el mensaje corto de reconfirmación o pase a mañana.
      const minutosRestantesParaSalirHoy = salidaObjetivoOriginalMin - minutosActualesBA;
      const esReservaFantasmaHoy =
        esRutaDeHoy &&
        !confirmado1a1 &&
        !yaPasoHoraParadaHoy &&
        minutosRestantesParaSalirHoy <= 60 &&
        minutosRestantesParaSalirHoy >= -15;
      const mensajeReconfirmacionRapidaHoy = esReservaFantasmaHoy
        ? `${nombreSaludo} Estoy por salir al recorrido por ${c.barrio} de hoy. ¿Llegás a estar hoy alrededor de las *${horaPactadaExplicita || horaLlegada} hs* o lo pasamos para mañana?`
        : undefined;

      // Punto 14 Calibración: Citas con hora exacta ("Sólo puedo 17:00 hs") se mantienen como ancla,
      // pero si mover esa cita <= 30 min hace más eficiente el encadenamiento a pie con la parada previa o un evento, ofrecer la sugerencia.
      let sugerenciaMover30Min: ParadaRuta['sugerenciaMover30Min'];
      if (horaPactadaExplicita && pactadaMin !== null) {
        if (finVisitaParadaAnteriorMin !== null) {
          const llegadaNaturalDesdePreviaMin = finVisitaParadaAnteriorMin + minutosViaje;
          const diffMin = llegadaNaturalDesdePreviaMin - pactadaMin;
          if (Math.abs(diffMin) >= 5 && Math.abs(diffMin) <= 30) {
            const minSugeridoRedondeado = Math.ceil(llegadaNaturalDesdePreviaMin / 5) * 5;
            const diffEfectivo = minSugeridoRedondeado - pactadaMin;
            if (diffEfectivo !== 0 && Math.abs(diffEfectivo) <= 30) {
              const horaSugerida = sumarMinutosAHora('00:00', minSugeridoRedondeado);
              const sentidoTxt = diffEfectivo > 0 ? `+${diffEfectivo} min` : `${diffEfectivo} min`;
              sugerenciaMover30Min = {
                horaOriginal: horaPactadaExplicita,
                horaSugerida,
                diferenciaMinutos: diffEfectivo,
                motivo:
                  diffEfectivo > 0
                    ? `Correr ${sentidoTxt} (${horaPactadaExplicita} → ${horaSugerida} hs) encadena directo a pie tras la parada anterior sin superposición.`
                    : `Adelantar ${Math.abs(diffEfectivo)} min (${horaPactadaExplicita} → ${horaSugerida} hs) evita ${Math.abs(diffEfectivo)} min de espera muerta en la calle tras la parada previa.`,
                mensajePropuestaCambio: `${nombreSaludo} Para encadenar el recorrido a pie por ${c.barrio} con otros vecinos de tu cuadra, ¿te quedaría igual de bien si paso 2 minutos por *${destinoNombre}* a las *${horaSugerida} hs* (en vez de las ${horaPactadaExplicita} hs)? Si necesitás que sea puntual a las ${horaPactadaExplicita} hs decime y lo mantengo fijo.`,
              };
            }
          }
        } else if (llegadaVisitaMin !== pactadaMin && Math.abs(llegadaVisitaMin - pactadaMin) <= 30) {
          const diffEfectivo = llegadaVisitaMin - pactadaMin;
          const sentidoTxt = diffEfectivo > 0 ? `+${diffEfectivo} min` : `${diffEfectivo} min`;
          sugerenciaMover30Min = {
            horaOriginal: horaPactadaExplicita,
            horaSugerida: horaLlegada,
            diferenciaMinutos: diffEfectivo,
            motivo: `Correr ${sentidoTxt} (${horaPactadaExplicita} → ${horaLlegada} hs) optimiza el empalme de la ruta del bloque.`,
            mensajePropuestaCambio: `${nombreSaludo} Para organizar mejor el recorrido por ${c.barrio}, ¿te quedaría bien si paso 2 minutos por *${destinoNombre}* a las *${horaLlegada} hs* (en vez de las ${horaPactadaExplicita} hs)? Avisame si te sirve.`,
          };
        }
      }

      const paradaObj: ParadaRuta = {
        orden: i + 1,
        contact: c,
        origenNombre,
        origenLat,
        origenLng,
        destinoNombre,
        destinoLat: destLat,
        destinoLng: destLng,
        modoTraslado,
        distanciaMetros: trasladoActual.distanciaMetros,
        cuadrasAprox: trasladoActual.cuadras,
        minutosViaje,
        minutosEncuentro: bufferEfectivo,
        horaSalida,
        horaLlegada,
        horaFinVisita,
        detalleTransporte,
        conflictoCalendar,
        alternativaOptimaSugerida,
        mensajeReprogramacionCalendar,
        mensajeNoEstabaReprogramar,
        horaPactadaExplicita,
        ventanaColumnaG: dispColG.etiquetaVentana,
        notaHorarioConveniente,
        cafeHubAsignado: cafeCercano
          ? { nombre: cafeCercano.nombre, direccion: cafeCercano.direccion }
          : undefined,
        confirmadoEnLista1a1: confirmado1a1,
        vencidaSinAdherir: yaPasoHoraParadaHoy,
        motivoVencimiento,
        mensajeDisculpasVencido,
        reservaFantasmaSinConfirmarHoy: esReservaFantasmaHoy,
        minutosParaSalidaHoy: esReservaFantasmaHoy ? Math.max(0, minutosRestantesParaSalirHoy) : undefined,
        mensajeReconfirmacionRapidaHoy,
        sugerenciaMover30Min,
        urlGoogleMapsTramo,
      };

      const cafeTextoBloque = cafeCercano
        ? `${cafeCercano.nombre} (${cafeCercano.direccion.split(',')[0]})`
        : undefined;

      paradaObj.mensajeTerrenoSugerido = generarMensajeTerrenoParadaRuta(
        paradaObj,
        yaPasoHoraParadaHoy ? 'DISCULPAS_CANCELACION_REPROGRAMAR' : 'EN_CAMINO_HORA_CALC',
        profile,
        cafeTextoBloque
      );

      paradasCrudas.push(paradaObj);

      // Si esta parada de hoy era una cita puntual que ya venció en el pasado (ej. Laura 10:00 hs siendo las 10:18 hs),
      // la siguiente parada activa parte desde la hora actual (`ahoraSalMin`) y desde la base / ubicación actual.
      if (esRutaDeHoy && citaPuntualYaVencidaHoy && finVisitaMin < minutosActualesBA) {
        const salidaAhoraMin = Math.ceil(minutosActualesBA / 5) * 5;
        cursorHora = sumarMinutosAHora('00:00', salidaAhoraMin);
        origenNombre = profile.direccionPartida;
        origenDireccionMaps = partidaResuelta.direccionMaps;
        origenLat = partidaResuelta.lat;
        origenLng = partidaResuelta.lng;
        finVisitaParadaAnteriorMin = null;
      } else {
        cursorHora = horaFinVisita;
        origenNombre = destinoNombre;
        origenDireccionMaps = destinoDireccionMaps;
        origenLat = destLat;
        origenLng = destLng;
        finVisitaParadaAnteriorMin = finVisitaMin;
      }
    }

    return paradasCrudas;
  };

  let paradasCalculadas = ejecutarPasadaSecuencial(ordenadas);

  // Ordenar estrictamente por horario de llegada ascendente; si el orden cronológico cambió respecto del orden inicial,
  // recalcular la pasada secuencial en ese orden cronológico para que los orígenes y tiempos de traslado entre paradas
  // coincidan 100% con la secuencia real de la tabla.
  let paradasOrdenadasPorHora = [...paradasCalculadas].sort(
    (a, b) => horaAMinutosDelDia(a.horaLlegada) - horaAMinutosDelDia(b.horaLlegada)
  );
  const cambioOrdenSecuencia = paradasOrdenadasPorHora.some(
    (p, idx) => p.contact.id !== paradasCalculadas[idx]?.contact.id
  );
  if (cambioOrdenSecuencia) {
    paradasCalculadas = ejecutarPasadaSecuencial(
      paradasOrdenadasPorHora.map((p) => p.contact)
    );
    paradasOrdenadasPorHora = [...paradasCalculadas].sort(
      (a, b) => horaAMinutosDelDia(a.horaLlegada) - horaAMinutosDelDia(b.horaLlegada)
    );
  }

  return paradasOrdenadasPorHora.map((p, idx) => {
    const ubiDest = obtenerUbicacionEncuentroContacto(p.contact);
    // Regla operativa en terreno:
    // Parada #1 (idx === 0) parte del punto de partida configurado (ej. Godoy Cruz 3268).
    // Paradas #2+ (idx > 0) abren Google Maps sin origin fijo para navegar desde la ubicación GPS actual del teléfono.
    const urlMapsOptimizada =
      idx === 0
        ? p.urlGoogleMapsTramo
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
            ubiDest.destinoDireccionMaps
          )}&travelmode=${p.modoTraslado.toLowerCase()}`;
    return {
      ...p,
      orden: idx + 1,
      urlGoogleMapsTramo: urlMapsOptimizada,
    };
  });
}

/**
 * Genera el mensaje en vivo según la situación en terreno para cada parada de la Hoja de Ruta Casa x Casa y Café.
 * Garantiza que el café mencionado coincida siempre con el café asignado al bloque (`p.cafeHubAsignado` o `cafeHubActivoEnRuta`),
 * sin repetir quién es el remitente ni usar lenguaje artificial ("Café HUB" / exceso de signos de exclamación).
 */
export function generarMensajeTerrenoParadaRuta(
  p: ParadaRuta,
  modo: ModoMensajeTerrenoRuta = 'EN_CAMINO_HORA_CALC',
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  cafeHubActivoEnRuta?: string
): string {
  const c = p.contact;
  const nombreSaludo = c.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${c.primerNombre}, ¿cómo estás?`;
  const dir = p.destinoNombre;
  const posdataNombre = c.sinNombre
    ? '\n\n_(De paso, cuando nos veamos o por acá recordame tu nombre y apellido así te agendo bien en la planilla)_.'
    : '';

  const tieneCafe = Boolean(cafeHubActivoEnRuta || p.cafeHubAsignado);
  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: c.barrio,
      calleOCruce: c.calleOCruce || dir,
      lat: c.lat,
      lng: c.lng,
    },
    profile,
    {
      incluirCafe: tieneCafe,
      cafeNombre: p.cafeHubAsignado?.nombre,
      cafeDireccion: p.cafeHubAsignado?.direccion,
      cafeTexto: cafeHubActivoEnRuta,
    }
  );

  const prefiereCafeConfirmado =
    c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    /confirm[oó]\s+caf[eé]|prefiere\s+punto\s+de\s+encuentro/i.test(
      c.comentario || ''
    );

  const construirTextoTerreno = (): string => {
    switch (modo) {
      case 'RECORDATORIO_MANIANA_ANTES_SALIR':
        if (prefiereCafeConfirmado && infoCafe.incluirCafe) {
          return `${nombreSaludo} Te escribo antes de salir para recordarte que hoy nos vemos en ${infoCafe.fraseCafe} alrededor de las *${p.horaLlegada} hs* para los 2 minutos de la firma de adhesión (acordate de llevar tu DNI físico con domicilio en CABA). Te voy avisando por acá cuando ya esté instalado ahí.${posdataNombre}`;
        }
        return infoCafe.incluirCafe
          ? `${nombreSaludo} Te escribo antes de arrancar el recorrido de hoy por ${c.barrio} para recordarte que hoy paso 2 minutos por *${dir}* alrededor de las *${p.horaLlegada} hs* (o si preferís, también voy a estar en ${infoCafe.fraseCafe}). Te voy avisando cuando ya esté en camino; acordate de tener a mano el DNI físico con domicilio en CABA.${posdataNombre}`
          : `${nombreSaludo} Te escribo antes de arrancar el recorrido de hoy por ${c.barrio} para recordarte que hoy paso 2 minutos por *${dir}* alrededor de las *${p.horaLlegada} hs* para la firma de adhesión. Te voy avisando cuando ya esté en camino; acordate de tener a mano el DNI físico con domicilio en CABA.${posdataNombre}`;

      case 'DISCULPAS_CANCELACION_REPROGRAMAR':
        return (
          p.mensajeDisculpasVencido ||
          p.mensajeReprogramacionCalendar ||
          (infoCafe.incluirCafe
            ? `${nombreSaludo} Te pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${dir}* en el horario previsto. ¿Preferís que reprogramemos la pasada de 2 minutos por *${dir}* para mañana o que nos encontremos en ${infoCafe.fraseCafe}?${posdataNombre}`
            : `${nombreSaludo} Te pido disculpas porque no voy a poder cumplir con nuestro compromiso de pasar por *${dir}* en el horario previsto. ¿Qué día y horario te queda bien para reprogramar los 2 minutos por *${dir}*?${posdataNombre}`)
        );

      case 'NO_ESTABA_REPROGRAMAR':
        return (
          p.mensajeNoEstabaReprogramar ||
          (infoCafe.incluirCafe
            ? `${nombreSaludo} Recién pasé por *${dir}* para los 2 minutos de la firma de adhesión y no llegamos a cruzarnos. No hay problema, ¿preferís que reprogramemos para pasar por *${dir}* en otro día y horario, o encontrarnos en ${infoCafe.fraseCafe}?${posdataNombre}`
            : `${nombreSaludo} Recién pasé por *${dir}* para los 2 minutos de la firma de adhesión y no llegamos a cruzarnos. No hay problema, ¿qué otro día y horario te queda bien para reprogramar?${posdataNombre}`)
        );

      case 'DEMORADO_10_MIN':
        return infoCafe.incluirCafe
          ? `${nombreSaludo} Te aviso que vengo con unos 15 minutos de demora del encuentro anterior; calculo estar llegando por *${dir}* cerca de las *${p.horaLlegada} hs*. Si se te complica ese horario avisame con confianza y lo reprogramamos o nos vemos en ${infoCafe.fraseCafe}. Disculpá la demora y gracias por esperarme.${posdataNombre}`
          : `${nombreSaludo} Te aviso que vengo con unos 15 minutos de demora del encuentro anterior; calculo estar llegando por *${dir}* cerca de las *${p.horaLlegada} hs*. Si se te complica ese horario avisame con confianza y lo reprogramamos. Disculpá la demora y gracias por esperarme.${posdataNombre}`;

      case 'LLEGANDO_2_MIN':
        return `${nombreSaludo} Ya estoy a 2 minutos de *${dir}*. Acordate de tener a mano el DNI físico con domicilio en CABA así lo hacemos en un minuto.${posdataNombre}`;

      case 'YA_EN_CAFE_HUB':
        return `${nombreSaludo} Ya estoy con las fichas de adhesión en ${infoCafe.fraseCafe}. Cuando andes por acá acercate tranquilo/a (toma apenas 2 minutos con el DNI físico de CABA) y avisame por acá así nos ubicamos enseguida.${posdataNombre}`;

      case 'CONFIRMACION_HOY':
        if (p.conflictoCalendar && p.mensajeReprogramacionCalendar) {
          return p.mensajeReprogramacionCalendar;
        }
        if (prefiereCafeConfirmado && infoCafe.incluirCafe) {
          return `${nombreSaludo} Te escribo para confirmar nuestro encuentro de hoy en ${infoCafe.fraseCafe} alrededor de las *${p.horaLlegada} hs* (son 2 minutos con tu DNI físico de CABA). Nos vemos ahí.${posdataNombre}`;
        }
        return infoCafe.incluirCafe
          ? `${nombreSaludo} Estoy organizando el recorrido de hoy por ${c.barrio}: calculo estar pasando por *${dir}* alrededor de las *${p.horaLlegada} hs* (o si te queda más cómodo, podemos encontrarnos en ${infoCafe.fraseCafe}). ¿Te viene bien ese horario?${posdataNombre}`
          : `${nombreSaludo} Estoy organizando el recorrido de hoy por ${c.barrio}: calculo estar pasando por *${dir}* alrededor de las *${p.horaLlegada} hs*. ¿Te viene bien ese horario?${posdataNombre}`;

      case 'EN_CAMINO_HORA_CALC':
      default:
        if (p.conflictoCalendar && p.mensajeReprogramacionCalendar) {
          return p.mensajeReprogramacionCalendar;
        }
        if (prefiereCafeConfirmado && infoCafe.incluirCafe) {
          return `${nombreSaludo} Ya estoy yendo para ${infoCafe.fraseCafe}: calculo estar ahí desde las *${p.horaLlegada} hs* con las fichas de adhesión (acordate de traer tu DNI físico con domicilio en CABA). Nos vemos en un ratito.${posdataNombre}`;
        }
        return `${nombreSaludo} Ya estoy en camino por la zona: calculo estar pasando por *${dir}* alrededor de las *${p.horaLlegada} hs* (acordate de tener a mano el DNI físico con domicilio en CABA, nos toma 2 minutos). Nos vemos en un ratito.${posdataNombre}`;
    }
  };

  return aplicarReglaSaludoMismoDia(
    corregirPelonesDiaSemanaEnTexto(construirTextoTerreno()),
    c,
    'AUTO_MISMO_DIA'
  );
}


export function generarCorteEstrategicoLocal(
  contactsInput: Contact[],
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  filtroBarrio: string = 'Todos',
  eventosCalendarInput: CalendarEventItem[] = INITIAL_CALENDAR_EVENTS,
  ahoraMs: number = Date.now()
): CorteResultado {
  const eventosCalendar = filtrarEventosCalendarVigentes(eventosCalendarInput, ahoraMs).filter(
    (ev) =>
      !(
        ev.id?.startsWith('route-') ||
        /recorrido puerta a puerta|ruta casa x casa|bloque caf[eé] hub/i.test(ev.summary || '')
      )
  );
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);
  const dia2BA = sumarDiasAFechaBA(ahoraMs, 2);
  const dia3BA = sumarDiasAFechaBA(ahoraMs, 3);
  const dia4BA = sumarDiasAFechaBA(ahoraMs, 4);
  const dia5BA = sumarDiasAFechaBA(ahoraMs, 5);
  const dia6BA = sumarDiasAFechaBA(ahoraMs, 6);
  const dia7BA = sumarDiasAFechaBA(ahoraMs, 7);

  // Recalcular alertas vencidas y diagnóstico +48h tomando exactamente `ahoraMs`
  const contacts: Contact[] = contactsInput.map((c): Contact => {
    const reprocesado = procesarContacto(c, profile, ahoraMs);
    return {
      ...reprocesado,
      enviadoEnSesion: c.enviadoEnSesion,
    };
  });

  const filtrados =
    filtroBarrio === 'Todos'
      ? contacts
      : contacts.filter((c) => c.barrio.toLowerCase() === filtroBarrio.toLowerCase());

  const kpisCorte = calcularResumenKPIsPadron(filtrados);
  const nuevosPrimerContacto = kpisCorte.nuevosSinMensaje;
  const cambioChipSinConcretar = kpisCorte.cambioChip;
  const sinRespuestaSeguimiento = kpisCorte.sinRespuesta;
  const visitasAgendadas = kpisCorte.visitasConcretadasCount;
  const retirosPendientes = kpisCorte.retirosFichasCount;
  const adheridosTotales = kpisCorte.adheridos;

  // REGLA ESTRICTA:
  // 1) Descartar siempre a quienes YA están adheridos (c.adhirio === 'Sí' / YA_ADHIRIO_FIRMA_OK) o dados de baja.
  // 2) Para la Agenda Recomendada Día por Día, tomar en cuenta ÚNICAMENTE a quienes YA tienen
  //    algún punto de encuentro, dirección, esquina o lugar determinado en Google Sheets o en la Sección 1.
  const noAdheridosTotales = filtrados.filter(
    (c) =>
      (c.adhirio !== 'Sí' ||
        c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
        c.situacion === 'RETIRO_FICHAS') &&
      c.estadoFlujo !== 'YA_ADHIRIO_FIRMA_OK' &&
      c.estadoFlujo !== 'DESCARTADO_O_BAJA' &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      c.situacion !== 'YA_ADHIRIO'
  );

  const elegiblesAgendaConLugar = noAdheridosTotales.filter((c) => {
    if (!c.tienePuntoEncuentroDeterminado) return false;
    // Punto 12 Calibración: Retiro de fichas extra (7. Retiro Fichas / PENDIENTE_RETIRO_FICHAS)
    // sólo se agenda como parada activa cuando el vecino ya confirmó que las tiene listas;
    // el resto se sugiere "de paso" en la tarjeta del bloque de ese barrio.
    if (!esRetiroFichasConfirmadoParaRuta(c)) return false;
    // REGLA FEEDBACK-14: Quienes prefieren pasar por un Punto / Sede (3c. PREFIERE_CAFE_HUB_O_SEDE / PREFIERE_PUNTO)
    // no quieren un encuentro particular y NUNCA deben incluirse en el Planificador & Hoy (salvo reunión sede Chile 1408 de test).
    if (
      c.situacion === 'PREFIERE_PUNTO' ||
      (c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' && c.situacion !== 'EVENTO_CHILE_1408')
    ) {
      return false;
    }
    // Si el contacto fue puesto explícitamente en "3. Respondió · Falta calle/esquina o día" (o etapas previas sin datos completos),
    // no incluirlo en el Planificador de Ruta hasta que pase a "4. Pasó dirección/horario" o superior.
    if (
      (c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
        c.estadoFlujo === 'PIDIO_MAS_INFO_ENVIADA' ||
        c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ||
        c.estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP' ||
        c.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
        c.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
        c.estadoFlujo === 'POSTERGO_SALUD_O_VIAJE') &&
      !esContactoConfirmadoEnLista1a1(c)
    ) {
      return false;
    }
    return true;
  });

  // Detectar todas las personas con visitas/encuentros pendientes vencidos o sin confirmar
  const alertasPendientesVencidos = elegiblesAgendaConLugar.filter((c) =>
    Boolean(c.alertaVencido?.activa)
  );

  // Agrupar diagnóstico por barrio (priorizando personas con punto/dirección determinada sin adherir)
  const mapaBarrios: Record<
    string,
    { pendientes: number; conPuntoDeterminado: number; conRespuestaSi: number; sinRespuesta: number }
  > = {};
  for (const c of noAdheridosTotales) {
    const b = (c.barrio || 'Palermo').trim();
    if (!mapaBarrios[b]) {
      mapaBarrios[b] = { pendientes: 0, conPuntoDeterminado: 0, conRespuestaSi: 0, sinRespuesta: 0 };
    }
    mapaBarrios[b].pendientes++;
    if (c.tienePuntoEncuentroDeterminado) mapaBarrios[b].conPuntoDeterminado++;
    if (c.rsp === 'Sí') mapaBarrios[b].conRespuestaSi++;
    else mapaBarrios[b].sinRespuesta++;
  }

  const recomendacionesBarrio = Object.entries(mapaBarrios)
    .sort((a, b) => b[1].conPuntoDeterminado - a[1].conPuntoDeterminado || b[1].pendientes - a[1].pendientes)
    .map(([barrio, stats]) => {
      const cafe = profile.cafesPorBarrio[barrio];
      const convieneHub = stats.conPuntoDeterminado >= 3 || stats.pendientes >= 4;
      return {
        barrio,
        pendientes: stats.pendientes,
        conRespuestaSi: stats.conRespuestaSi,
        sinRespuesta: stats.sinRespuesta,
        estrategia: convieneHub
          ? `Hacer CAFÉ HUB en ${cafe?.nombre || `centro de ${barrio}`} (${stats.conPuntoDeterminado} con punto/dirección en ${barrio}) + Puerta a Puerta para quienes declinen el café.`
          : `Hacer RECORRIDO PUERTA A PUERTA puntual (${stats.conPuntoDeterminado} con dirección en ${barrio}).`,
        cafeHubSugerido: cafe ? `${cafe.nombre} (${cafe.esquina})` : `Café céntrico de ${barrio}`,
      };
    });

  // Barrios con más personas elegibles (con dirección/punto de encuentro determinado y no adheridas)
  const conteoPorBarrioElegibles: Record<string, number> = {};
  for (const c of elegiblesAgendaConLugar) {
    const b = (c.barrio || 'Palermo').trim();
    conteoPorBarrioElegibles[b] = (conteoPorBarrioElegibles[b] || 0) + 1;
  }
  const barriosElegiblesOrdenados = Object.entries(conteoPorBarrioElegibles)
    .sort((a, b) => b[1] - a[1])
    .map(([b]) => b);

  const topBarrio = barriosElegiblesOrdenados[0] || recomendacionesBarrio[0]?.barrio || 'Saavedra';
  const segundoBarrio =
    barriosElegiblesOrdenados[1] ||
    recomendacionesBarrio.find((r) => r.barrio !== topBarrio)?.barrio ||
    'Palermo';

  // Eventos de Google Calendar para los próximos días
  const diasOperativos = [
    {
      diaBA: hoyBA,
      prefijo: 'HOY',
      esHoy: true,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, hoyBA),
    },
    {
      diaBA: manianaBA,
      prefijo: 'MAÑANA',
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, manianaBA),
    },
    {
      diaBA: dia2BA,
      prefijo: dia2BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia2BA),
    },
    {
      diaBA: dia3BA,
      prefijo: dia3BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia3BA),
    },
    {
      diaBA: dia4BA,
      prefijo: dia4BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia4BA),
    },
    {
      diaBA: dia5BA,
      prefijo: dia5BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia5BA),
    },
    {
      diaBA: dia6BA,
      prefijo: dia6BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia6BA),
    },
    {
      diaBA: dia7BA,
      prefijo: dia7BA.nombreDia.toUpperCase(),
      esHoy: false,
      eventos: filtrarEventosCalendarParaDia(eventosCalendar, dia7BA),
    },
  ];

  // Buscador inteligente de ventana horaria DIURNA REALISTA (09:30 a 20:00 hs, jamás de madrugada ni cruzando medianoche)
  // que evita choques con los eventos de Google Calendar de ese día dejando margen de traslado hacia/desde el evento
  // y encadena el traslado desde el KM 0 (1er plan del día) o desde el último punto del plan anterior.
  const intervalosOcupadosPorDia: Record<
    string,
    {
      ini: number;
      fin: number;
      finLat?: number;
      finLng?: number;
      finNombre?: string;
      finDireccionMaps?: string;
    }[]
  > = {};
  for (const d of diasOperativos) {
    intervalosOcupadosPorDia[d.diaBA.ddmm] = [];
  }

  const partidaKm0 = resolverCoordenadasPartidaPerfil(profile);

  const encontrarVentanaDiurnaSinChoqueCalendar = (params: {
    diaInfo: (typeof diasOperativos)[number];
    duracionMin: number;
    franjaPreferida: FranjaHoraria;
    latBarrio: number;
    lngBarrio: number;
    ventanaColumnaG?: { minIni: number; minFin: number };
    horaPuntualPreferida?: string;
    tieneConfirmados?: boolean;
  }): { horaInicio: string; notaCalendar: string; chocaForzado: boolean } => {
    const {
      diaInfo,
      duracionMin,
      franjaPreferida,
      latBarrio,
      lngBarrio,
      ventanaColumnaG,
      horaPuntualPreferida,
      tieneConfirmados,
    } = params;
    const { diaBA, esHoy, eventos } = diaInfo;

    const ocupadosAgenda = intervalosOcupadosPorDia[diaBA.ddmm] || [];
    const ultimoOcupado =
      ocupadosAgenda.length > 0 ? ocupadosAgenda[ocupadosAgenda.length - 1] : undefined;

    const origenLat = ultimoOcupado?.finLat ?? partidaKm0.lat;
    const origenLng = ultimoOcupado?.finLng ?? partidaKm0.lng;

    const trasladoDesdeBase = calcularMinutosTrasladoCABA(
      origenLat,
      origenLng,
      latBarrio,
      lngBarrio
    ).minutos;

    const tieneRestriccionMatutinaOPuntual =
      Boolean(horaPuntualPreferida) ||
      Boolean(ventanaColumnaG && ventanaColumnaG.minIni < 14 * 60) ||
      franjaPreferida === 'Mañana' ||
      franjaPreferida === 'Mediodía';

    // Margen prudente para propuestas no confirmadas:
    // - Nunca proponer al inicio mismo de la jornada sin margen de preparación/confirmación (mínimo 09:45 / 10:00 hs salvo cita ya confirmada).
    // - Si es HOY y el bloque NO está confirmado, garantizar 90 minutos entre el envío de la propuesta y la hora del encuentro.
    const minSalidaHoyConMargen = Math.min(
      19 * 60,
      Math.ceil(
        (hoyBA.hour * 60 +
          hoyBA.minute +
          (tieneConfirmados ? 15 : Math.max(75, 90 - Math.min(20, trasladoDesdeBase)))) /
          15
      ) * 15
    );

    const minInicioOperativo = esHoy
      ? Math.max(tieneConfirmados ? 8 * 60 + 30 : 10 * 60, minSalidaHoyConMargen)
      : tieneConfirmados && tieneRestriccionMatutinaOPuntual
      ? 8 * 60 + 30
      : tieneRestriccionMatutinaOPuntual
      ? 9 * 60 + 45
      : 10 * 60;
    const maxFinOperativo = 20 * 60; // Tope estricto 20:00 hs (nunca de noche ni madrugada)

    // Determinar hora ideal de salida desde el origen (KM 0 o fin del plan anterior) descontando el traslado real
    const horaBasePreferidaMin = horaPuntualPreferida
      ? Math.max(minInicioOperativo, horaAMinutosDelDia(horaPuntualPreferida) - trasladoDesdeBase)
      : ventanaColumnaG
      ? Math.max(minInicioOperativo, ventanaColumnaG.minIni - trasladoDesdeBase)
      : franjaPreferida === 'Mañana'
      ? Math.max(minInicioOperativo, 10 * 60 + 15 - trasladoDesdeBase)
      : franjaPreferida === 'Mediodía'
      ? Math.max(minInicioOperativo, 12 * 60 + 30 - trasladoDesdeBase)
      : franjaPreferida === 'Vespertino'
      ? Math.max(minInicioOperativo, 17 * 60 + 30 - trasladoDesdeBase)
      : Math.max(minInicioOperativo, 15 * 60 - trasladoDesdeBase);

    // Construir grilla completa de candidatos cada 15 min ordenada por cercanía a horaBasePreferidaMin
    // e incluir horaBasePreferidaMin explícitamente para respetar citas puntuales (ej. 10:00 hs -> salida ~09:41 hs)
    const setCandidatos = new Set<number>();
    if (
      horaBasePreferidaMin >= minInicioOperativo &&
      horaBasePreferidaMin <= maxFinOperativo - 25
    ) {
      setCandidatos.add(horaBasePreferidaMin);
    }
    const pasoGrilla = horaPuntualPreferida ? 5 : 15;
    for (let m = minInicioOperativo; m <= maxFinOperativo - 25; m += pasoGrilla) {
      setCandidatos.add(m);
    }
    const todosLosCandidatosMin = Array.from(setCandidatos);
    todosLosCandidatosMin.sort((a, b) => {
      // Si el circuito tiene preferencia vespertina/tarde (horaBasePreferidaMin >= 14:30), jamás mandarlo a la mañana (08:30-12:30)
      const penalTardeAMananaA = horaBasePreferidaMin >= 14 * 60 + 30 && a < 12 * 60 + 30 ? 720 : 0;
      const penalTardeAMananaB = horaBasePreferidaMin >= 14 * 60 + 30 && b < 12 * 60 + 30 ? 720 : 0;
      if (penalTardeAMananaA !== penalTardeAMananaB) {
        return penalTardeAMananaA - penalTardeAMananaB;
      }
      if (!horaPuntualPreferida && ventanaColumnaG) {
        const aEnVentana =
          a + trasladoDesdeBase >= ventanaColumnaG.minIni &&
          a + duracionMin <= ventanaColumnaG.minFin
            ? 0
            : a + trasladoDesdeBase >= ventanaColumnaG.minIni &&
              a + duracionMin <= ventanaColumnaG.minFin + 20
            ? 1
            : 2;
        const bEnVentana =
          b + trasladoDesdeBase >= ventanaColumnaG.minIni &&
          b + duracionMin <= ventanaColumnaG.minFin
            ? 0
            : b + trasladoDesdeBase >= ventanaColumnaG.minIni &&
              b + duracionMin <= ventanaColumnaG.minFin + 20
            ? 1
            : 2;
        if (aEnVentana !== bEnVentana) return aEnVentana - bEnVentana;
      }
      return Math.abs(a - horaBasePreferidaMin) - Math.abs(b - horaBasePreferidaMin);
    });

    const evaluarCandidato = (iniMin: number, durMinEfectiva: number) => {
      const finMin = iniMin + durMinEfectiva;
      if (finMin > maxFinOperativo + 45) return null;

      // Verificar que NO se solape con ningún otro bloque ya agendado ese mismo día,
      // dejando el tiempo de traslado real desde el último punto del bloque anterior hasta este bloque
      const chocaConOtroBloque = ocupadosAgenda.some((b) => {
        const trasladoEntreBloques =
          b.finLat !== undefined && b.finLng !== undefined
            ? Math.max(15, calcularMinutosTrasladoCABA(b.finLat, b.finLng, latBarrio, lngBarrio).minutos)
            : 18;
        return iniMin < b.fin + 5 && finMin + trasladoEntreBloques > b.ini;
      });
      if (chocaConOtroBloque) return null;

      // Verificar que NO choque con ningún evento de Google Calendar de ese día (incluyendo tiempo de traslado)
      for (const ev of eventos) {
        const evIni = horaAMinutosDelDia(ev.startTime);
        const evFin = horaAMinutosDelDia(ev.endTime);
        const esVirt = esEventoVirtualCalendar(ev);
        const geoEv = geocodificarEventoCalendar(ev, profile);
        const tieneDirFisica = Boolean(
          ev.location && ev.location.trim() && ev.location.trim().toUpperCase() !== 'CABA'
        );
        const trasladoEv = esVirt
          ? { minutos: 0, modo: 'WALKING' as const }
          : tieneDirFisica
          ? calcularMinutosTrasladoCABA(latBarrio, lngBarrio, geoEv.lat, geoEv.lng)
          : { minutos: 20, modo: 'TRANSIT' as const };
        const margenAntes = esVirt
          ? 5
          : horaPuntualPreferida
          ? 20
          : Math.max(20, Math.min(25, trasladoEv.minutos + 4));
        const margenDespues = esVirt ? 2 : Math.min(20, trasladoEv.minutos);
        if (iniMin < evFin + margenDespues && finMin + margenAntes > evIni) {
          return null;
        }
      }
      return { iniMin, finMin };
    };

    // Si el circuito tiene una cita puntual pactada (ej. Laura 10:00 hs o Mariano 17:00 hs), evaluar primero si al menos la 1ra parada
    // entra en su horario puntual; el resto de las paradas se adaptarán dinámicamente en calcularHojaDeRuta.
    const durMinParaPuntual = Math.min(duracionMin, Math.max(15, trasladoDesdeBase + 10));
    if (horaPuntualPreferida) {
      const okPuntual = evaluarCandidato(horaBasePreferidaMin, durMinParaPuntual);
      if (okPuntual) {
        const horaElegida = sumarMinutosAHora('00:00', okPuntual.iniMin);
        const evRef = eventos[0];
        return {
          horaInicio: horaElegida,
          notaCalendar: evRef
            ? `✓ Horario coordinado contemplando tus eventos de Google Calendar del ${diaBA.ddmm}.`
            : `✓ Ventana diurna libre de compromisos en tu Google Calendar para el ${diaBA.ddmm}.`,
          chocaForzado: false,
        };
      }
    }

    for (const candMin of todosLosCandidatosMin) {
      const ok = evaluarCandidato(candMin, horaPuntualPreferida ? durMinParaPuntual : duracionMin);
      if (ok) {
        const horaElegida = sumarMinutosAHora('00:00', ok.iniMin);
        const evRef = eventos[0];
        if (evRef) {
          const geoEv = geocodificarEventoCalendar(evRef, profile);
          const trasladoEv = calcularMinutosTrasladoCABA(
            latBarrio,
            lngBarrio,
            geoEv.lat,
            geoEv.lng
          );
          return {
            horaInicio: horaElegida,
            notaCalendar: `✓ Horario coordinado sin choques con tu evento Calendar "${evRef.summary}" (${evRef.startTime}-${evRef.endTime} en ${geoEv.label.split(',')[0]}), contemplando ~${trasladoEv.minutos} min de traslado (${trasladoEv.modo === 'WALKING' ? 'a pie' : 'en transporte'}).`,
            chocaForzado: false,
          };
        }
        return {
          horaInicio: horaElegida,
          notaCalendar: `✓ Ventana diurna libre de compromisos en tu Google Calendar para el ${diaBA.ddmm}.`,
          chocaForzado: false,
        };
      }
    }

    // Si con la duración completa no entró pero con duración compacta (30 min) sí entra sin superponerse:
    for (const candMin of todosLosCandidatosMin) {
      const okCompacto = evaluarCandidato(candMin, Math.min(duracionMin, 30));
      if (okCompacto) {
        const horaElegida = sumarMinutosAHora('00:00', okCompacto.iniMin);
        const evRef = eventos[0];
        return {
          horaInicio: horaElegida,
          notaCalendar: evRef
            ? `✓ Horario coordinado tras tu evento Calendar "${evRef.summary}" (${evRef.startTime}-${evRef.endTime}) sin superponerse con otros bloques.`
            : `✓ Bloque ubicado en hueco disponible del ${diaBA.ddmm} sin superponerse con otros bloques ni eventos.`,
          chocaForzado: false,
        };
      }
    }

    // Si todos los huecos chocaban con Calendar, al menos garantizar que NO se superponga con otro bloque del mismo día
    let iniSinSolaparBloque = horaBasePreferidaMin;
    for (const candMin of todosLosCandidatosMin) {
      const chocaBloque = ocupadosAgenda.some(
        (b) => candMin < b.fin + 15 && candMin + Math.min(duracionMin, 35) + 15 > b.ini
      );
      if (!chocaBloque) {
        iniSinSolaparBloque = candMin;
        break;
      }
    }
    const fallbackHora = sumarMinutosAHora('00:00', iniSinSolaparBloque);
    const evRef = eventos[0];
    return {
      horaInicio: fallbackHora,
      notaCalendar: evRef
        ? `Contempla tu evento Calendar "${evRef.summary}" (${evRef.startTime}-${evRef.endTime} en ${(evRef.location || 'CABA').split(',')[0]}).`
        : `Verificado contra tu Google Calendar para el ${diaBA.ddmm}.`,
      chocaForzado: Boolean(evRef),
    };
  };

  // Función constructora que calcula la Hoja de Ruta REAL y la selección inteligente de Café HUB
  // (por cercanía geográfica + mismo barrio + día + franja horaria compartida) para cada bloque de la Agenda Día por Día
  const construirBloqueAgendaSincronizado = (params: {
    id: string;
    clusterIdVinculado?: string;
    numeroCircuito: number;
    diaEtiqueta: string;
    fechaClave: string;
    fechaISO: string;
    horaSalidaBase: string;
    barrioDefault: string;
    modalidadPreferida: ModalidadEncuentroAgenda;
    contactosGrupo: Contact[];
    eventosDelDia: CalendarEventItem[];
    notaCalendarBase: string;
    esSeguimientoVencidos?: boolean;
  }): BloqueAgendaRecomendado => {
    const {
      id,
      clusterIdVinculado,
      numeroCircuito,
      diaEtiqueta,
      fechaClave,
      fechaISO,
      horaSalidaBase,
      barrioDefault,
      modalidadPreferida,
      contactosGrupo,
      eventosDelDia,
      notaCalendarBase,
      esSeguimientoVencidos,
    } = params;

    // Determinar barrio principal real de los vecinos del circuito (sin mezclar barrios distantes)
    const conteoB: Record<string, number> = {};
    for (const c of contactosGrupo) {
      conteoB[c.barrio] = (conteoB[c.barrio] || 0) + 1;
    }
    const barrioPrincipal =
      Object.entries(conteoB).sort((a, b) => b[1] - a[1])[0]?.[0] || barrioDefault;
    const etiquetaBarrios = barrioPrincipal;

    // 1. Seleccionar café de la zona y respetar cualquier café que un vecino ya haya confirmado en el bloque
    const esSede =
      modalidadPreferida === 'EVENTO_SEDE' || modalidadPreferida === 'ENCUENTRO_SEDE';

    const seleccionCafes = seleccionarCafesHubPorCercaniaYFranja(
      contactosGrupo,
      barrioPrincipal,
      fechaClave,
      profile
    );
    const cafeConfirmadoEnComentario = (() => {
      for (const c of contactosGrupo) {
        const m = (c.comentario || '').match(/Caf[eé]\s*Hub:\s*([^\])·]+)/i);
        if (m?.[1]?.trim()) return m[1].trim();
      }
      return undefined;
    })();
    const permiteSugerirCafeEnEsteGrupo =
      !esSede &&
      (contactosGrupo.length >= 2 ||
        Boolean(cafeConfirmadoEnComentario) ||
        modalidadPreferida === 'CAFE_HUB');
    const cafesRankingBase = permiteSugerirCafeEnEsteGrupo ? [...seleccionCafes.cafesRanking] : [];
    if (cafeConfirmadoEnComentario && cafesRankingBase.length > 0) {
      const nombreLimpio = cafeConfirmadoEnComentario.split('(')[0].trim().toLowerCase();
      const idxCafe = cafesRankingBase.findIndex((cf) =>
        cf.nombre.toLowerCase().includes(nombreLimpio) ||
        nombreLimpio.includes(cf.nombre.toLowerCase())
      );
      if (idxCafe > 0) {
        const [elegido] = cafesRankingBase.splice(idxCafe, 1);
        cafesRankingBase.unshift(elegido);
      }
    }
    const cafesRanking = cafesRankingBase;
    const franjaCompartidaResumen = seleccionCafes.franjaCompartidaResumen;
    const mediaMinutosMejorCafe = seleccionCafes.mediaMinutosMejorCafe;
    const mejorCafe = cafesRanking[0];
    const nombreMejorCafe =
      cafeConfirmadoEnComentario ||
      (mejorCafe
        ? `${mejorCafe.nombre} (${mejorCafe.direccion.split(',')[0]})`
        : profile.cafesPorBarrio[barrioPrincipal]?.nombre || `Café de ${barrioPrincipal}`);

    // Si es el encuentro de los miércoles en Chile 1408, no tratar el propio evento "Hagamos Popurrí (Chile 1408)" como choque
    const eventosParaCalculoRuta = esSede
      ? eventosDelDia.filter(
          (ev) => !/chile\s*1408|hagamos\s*popurr[ií]/i.test(`${ev.summary || ''} ${ev.location || ''}`)
        )
      : eventosDelDia;

    // 2. Resolver punto de partida encadenado:
    //    - Si es el primer plan del día, parte desde el KM 0 (profile.direccionPartida).
    //    - Si ya hubo un plan previo ese mismo día, parte desde el último punto del plan anterior.
    const ocupadosPreviosHoy = intervalosOcupadosPorDia[fechaClave] || [];
    const salidaBaseMin = horaAMinutosDelDia(horaSalidaBase);
    const bloquePrevio = [...ocupadosPreviosHoy]
      .filter((b) => b.finLat !== undefined && b.finLng !== undefined && b.fin <= salidaBaseMin + 45)
      .sort((a, b) => b.fin - a.fin)[0];

    const origenPersonalizadoBloque = bloquePrevio && bloquePrevio.finLat !== undefined && bloquePrevio.finLng !== undefined
      ? {
          lat: bloquePrevio.finLat,
          lng: bloquePrevio.finLng,
          nombre: bloquePrevio.finNombre || 'Último punto del plan anterior',
          direccionMaps: bloquePrevio.finDireccionMaps || 'CABA, Argentina',
        }
      : undefined;

    // Regla Calibrada: 8 a 10 minutos por parada en Puerta a Puerta (9 min promedio) para contemplar ascensor/bajada del edificio
    const bufferPorParada = 9;
    const contactosMismoDiaRef = elegiblesAgendaConLugar.filter(
      (c) =>
        resolverFechaObjetivoContacto(c, ahoraMs) === fechaClave ||
        c.fechasMencionadas.includes(fechaClave)
    );
    const opcionesCalculoRuta = {
      cafeHubBloque: mejorCafe
        ? {
            nombre: mejorCafe.nombre,
            direccion: mejorCafe.direccion,
            lat: mejorCafe.lat,
            lng: mejorCafe.lng,
          }
        : undefined,
      modalidadBloque: modalidadPreferida,
      contactosMismoDia: contactosMismoDiaRef,
      ahoraMs,
      origenPersonalizado: origenPersonalizadoBloque,
    };

    let paradasRutaSugerida = calcularHojaDeRuta(
      contactosGrupo,
      horaSalidaBase,
      bufferPorParada,
      profile,
      eventosParaCalculoRuta,
      fechaClave,
      opcionesCalculoRuta
    );

    // El inicio del encuentro en territorio o Café HUB contempla el tiempo de traslado desde el KM 0 (1er plan) o desde el plan anterior
    let horaSalidaDesdeOrigen = esSede
      ? '18:05'
      : paradasRutaSugerida[0]?.horaSalida || horaSalidaBase;

    let horaInicioReal = esSede
      ? '18:30'
      : paradasRutaSugerida[0]?.horaLlegada || paradasRutaSugerida[0]?.horaSalida || horaSalidaBase;

    const calcularDuracionActivaRuta = (paradas: ParadaRuta[]) =>
      paradas.length > 0
        ? Math.max(
            25,
            paradas.reduce((acc, p) => acc + p.minutosViaje + p.minutosEncuentro, 0)
          )
        : Math.max(30, contactosGrupo.length * 20);

    // Regla Calibrada: Tiempo de permanencia en Café HUB dinámico según cantidad de vecinos (confirmados y totales) y amplitud de sus franjas
    const confirmadosEnCafe = contactosGrupo.filter(esContactoConfirmadoEnLista1a1).length;
    const rangosMiembros = contactosGrupo.map((c) => obtenerRangoHorarioEfectivoContacto(c));
    const maxIniGrupo = Math.max(...rangosMiembros.map((r) => r.minIni));
    const minFinGrupo = Math.min(...rangosMiembros.map((r) => r.minFin));
    const amplitudVentanaComun = minFinGrupo > maxIniGrupo ? minFinGrupo - maxIniGrupo : 60;
    const baseMinPorCantidad =
      contactosGrupo.length <= 2
        ? 30 + confirmadosEnCafe * 5
        : contactosGrupo.length === 3
        ? 40 + confirmadosEnCafe * 5
        : contactosGrupo.length === 4
        ? 45 + confirmadosEnCafe * 5
        : 60;
    const duracionCafeHubMin = Math.max(
      30,
      Math.min(60, Math.min(baseMinPorCantidad, Math.max(30, amplitudVentanaComun)))
    );

    let duracionTotalMinutos = esSede
      ? 90
      : modalidadPreferida === 'PUERTA_A_PUERTA'
      ? calcularDuracionActivaRuta(paradasRutaSugerida)
      : duracionCafeHubMin;

    const calcularFinReal = (iniStr: string, paradas: ParadaRuta[], durMin: number): string => {
      if (esSede) return '20:00';
      const fin = modalidadPreferida === 'PUERTA_A_PUERTA' && paradas.length > 0
        ? paradas[paradas.length - 1].horaFinVisita
        : sumarMinutosAHora(iniStr, durMin);
      const finMin = horaAMinutosDelDia(fin);
      if (finMin > 21 * 60 || finMin < 6 * 60) {
        return '21:00';
      }
      return fin;
    };

    let horaFinReal = calcularFinReal(horaInicioReal, paradasRutaSugerida, duracionTotalMinutos);

    // Garantizar que el intervalo completo [horaSalidaDesdeOrigen, horaFinReal] jamás se superponga con otro bloque del mismo día
    const ocupadosHoy = intervalosOcupadosPorDia[fechaClave] || [];
    const chocaConOcupados = (iniM: number, finM: number) =>
      ocupadosHoy.some((oc) => iniM < oc.fin + 5 && finM + 5 > oc.ini);

    let iniMinReal = horaAMinutosDelDia(horaSalidaDesdeOrigen);
    let finMinReal = Math.max(iniMinReal + 25, horaAMinutosDelDia(horaFinReal));
    const tieneContactoConfirmadoConHoraExacta = contactosGrupo.some((c) => {
      const disp = analizarDisponibilidadColumnaG(obtenerTextoHorarioAgendaContacto(c));
      return esContactoConfirmadoEnLista1a1(c) && Boolean(disp.horaPuntualPactada && !disp.esVentanaAmplia);
    });

    if (!esSede && !tieneContactoConfirmadoConHoraExacta && chocaConOcupados(iniMinReal, finMinReal)) {
      const basePrefMin = horaAMinutosDelDia(horaSalidaBase);
      const spanNecesario = Math.max(duracionTotalMinutos, finMinReal - iniMinReal);
      const minCandHoy =
        fechaClave === hoyBA.ddmm
          ? Math.max(10 * 60, Math.ceil((hoyBA.hour * 60 + hoyBA.minute + 80) / 15) * 15)
          : 9 * 60 + 30;
      const candsOrdenados: number[] = [];
      for (let cand = minCandHoy; cand <= 20 * 60 + 30; cand += 15) {
        candsOrdenados.push(cand);
      }
      candsOrdenados.sort((a, b) => {
        const penalA = basePrefMin >= 14 * 60 + 30 && a < 12 * 60 + 30 ? 480 : 0;
        const penalB = basePrefMin >= 14 * 60 + 30 && b < 12 * 60 + 30 ? 480 : 0;
        return Math.abs(a - basePrefMin) + penalA - (Math.abs(b - basePrefMin) + penalB);
      });

      let encontrado = false;
      for (const cand of candsOrdenados) {
        if (chocaConOcupados(cand, cand + duracionTotalMinutos)) continue;
        const candStr = sumarMinutosAHora('00:00', cand);
        const prevEnCand = [...ocupadosHoy]
          .filter((b) => b.finLat !== undefined && b.finLng !== undefined && b.fin <= cand + 5)
          .sort((a, b) => b.fin - a.fin)[0];
        const paradasCand = calcularHojaDeRuta(
          contactosGrupo,
          candStr,
          bufferPorParada,
          profile,
          eventosParaCalculoRuta,
          fechaClave,
          {
            ...opcionesCalculoRuta,
            origenPersonalizado:
              prevEnCand && prevEnCand.finLat !== undefined && prevEnCand.finLng !== undefined
                ? {
                    lat: prevEnCand.finLat,
                    lng: prevEnCand.finLng,
                    nombre: prevEnCand.finNombre || 'Último punto del plan anterior',
                    direccionMaps: prevEnCand.finDireccionMaps || 'CABA, Argentina',
                  }
                : opcionesCalculoRuta.origenPersonalizado,
          }
        );
        const durCand =
          modalidadPreferida === 'PUERTA_A_PUERTA'
            ? calcularDuracionActivaRuta(paradasCand)
            : duracionCafeHubMin;
        const salidaCandStr = paradasCand[0]?.horaSalida || candStr;
        const iniCandStr = paradasCand[0]?.horaLlegada || salidaCandStr;
        const finCandStr = calcularFinReal(iniCandStr, paradasCand, durCand);
        const iniCandM = horaAMinutosDelDia(salidaCandStr);
        const finCandM = Math.max(iniCandM + 25, horaAMinutosDelDia(finCandStr));
        if (!chocaConOcupados(iniCandM, finCandM) && finCandM <= 21 * 60 + 30) {
          horaSalidaDesdeOrigen = salidaCandStr;
          horaInicioReal = iniCandStr;
          horaFinReal = finCandStr;
          paradasRutaSugerida = paradasCand;
          duracionTotalMinutos = durCand;
          iniMinReal = iniCandM;
          finMinReal = finCandM;
          encontrado = true;
          break;
        }
      }

      // Si una parada interna con horario fijo estiró el bloque sobre otro bloque ocupado, acotar el bloque al hueco libre
      if (!encontrado) {
        for (const cand of candsOrdenados) {
          const finCompacto = cand + Math.max(30, Math.min(spanNecesario, 60));
          if (!chocaConOcupados(cand, finCompacto)) {
            iniMinReal = cand;
            finMinReal = finCompacto;
            horaSalidaDesdeOrigen = sumarMinutosAHora('00:00', iniMinReal);
            horaInicioReal = sumarMinutosAHora(horaSalidaDesdeOrigen, 15);
            horaFinReal = sumarMinutosAHora('00:00', finMinReal);
            duracionTotalMinutos = finMinReal - iniMinReal;
            break;
          }
        }
      }
    }

    // Registrar el intervalo completo del bloque y su último punto físico en este día para encadenar el próximo plan
    if (!intervalosOcupadosPorDia[fechaClave]) {
      intervalosOcupadosPorDia[fechaClave] = [];
    }
    const ultimaParadaBloque =
      paradasRutaSugerida.length > 0
        ? paradasRutaSugerida[paradasRutaSugerida.length - 1]
        : undefined;
    const finLatBloque =
      modalidadPreferida === 'CAFE_HUB' && mejorCafe
        ? mejorCafe.lat
        : ultimaParadaBloque?.contact.lat ?? mejorCafe?.lat;
    const finLngBloque =
      modalidadPreferida === 'CAFE_HUB' && mejorCafe
        ? mejorCafe.lng
        : ultimaParadaBloque?.contact.lng ?? mejorCafe?.lng;
    const finNombreBloque =
      modalidadPreferida === 'CAFE_HUB' && mejorCafe
        ? `${mejorCafe.nombre} (${mejorCafe.direccion.split(',')[0]})`
        : ultimaParadaBloque?.destinoNombre || nombreMejorCafe;
    const finDirMapsBloque =
      modalidadPreferida === 'CAFE_HUB' && mejorCafe
        ? `${mejorCafe.direccion}, CABA, Argentina`
        : ultimaParadaBloque?.contact.calleOCruce
        ? `${ultimaParadaBloque.contact.calleOCruce}, ${barrioPrincipal}, CABA, Argentina`
        : `${barrioPrincipal}, CABA, Argentina`;

    intervalosOcupadosPorDia[fechaClave].push({
      ini: horaAMinutosDelDia(horaSalidaDesdeOrigen),
      fin: horaAMinutosDelDia(horaFinReal),
      finLat: finLatBloque,
      finLng: finLngBloque,
      finNombre: finNombreBloque,
      finDireccionMaps: finDirMapsBloque,
    });

    // Franja horaria limpia para que sea 100% legible y apta para mensajes sin textos internos
    const franjaHorariaLimpia = esSede
      ? '18:30 a 20:00 hs'
      : `${horaInicioReal} a ${horaFinReal} hs`;

    const resumenOperativoRuta =
      modalidadPreferida === 'PUERTA_A_PUERTA'
        ? `${paradasRutaSugerida.length} parada${paradasRutaSugerida.length === 1 ? '' : 's'} · ~${duracionTotalMinutos} min efectivos de recorrido`
        : esSede
        ? `Sede ${profile.sedeCentral.split(',')[0]} (miércoles)`
        : `Encuentro en café · ${duracionTotalMinutos} min (~${mediaMinutosMejorCafe} min a pie)`;

    // Distinguir entre horas puntuales fijas que chocan (con Calendar o con otra persona) y franjas amplias donde se asignó un horario conveniente
    const choquesEnRuta = paradasRutaSugerida.filter((p) => Boolean(p.conflictoCalendar));
    const paradasConHorarioConveniente = paradasRutaSugerida.filter((p) => Boolean(p.notaHorarioConveniente));
    const resumenEventosDelDia =
      eventosDelDia.length > 0
        ? `Eventos Calendar del ${fechaClave} contemplados: ${eventosDelDia
            .map((e) => `"${e.summary}" (${e.startTime}-${e.endTime})`)
            .join(', ')}`
        : notaCalendarBase;
    const notaCalendarConChoques =
      choquesEnRuta.length > 0
        ? `⚠️ ${choquesEnRuta.length} visita(s) con superposición horaria detectada (${choquesEnRuta[0].conflictoCalendar}). ${resumenEventosDelDia}.`
        : paradasConHorarioConveniente.length > 0
        ? `✓ ${resumenEventosDelDia} · Cronograma adaptado automáticamente (${paradasRutaSugerida
            .map((p) => `${p.contact.primerNombre}: ${p.horaLlegada} hs${p.vencidaSinAdherir ? ' [vencida]' : ''}`)
            .join(' → ')}).`
        : `✓ ${resumenEventosDelDia}`;

    // Ordenar contactosIncluidos exactamente en el orden cronológico de paradasRutaSugerida
    const contactosOrdenadosCronologicamente =
      paradasRutaSugerida.length > 0
        ? paradasRutaSugerida.map((p) => p.contact)
        : contactosGrupo;

    const alertasCount = contactosOrdenadosCronologicamente.filter((c) => Boolean(c.alertaVencido?.activa)).length;
    const confirmadosCount = contactosOrdenadosCronologicamente.filter((c) => esContactoConfirmadoEnLista1a1(c)).length;

    const puntoEncuentroODireccion = esSede
      ? profile.sedeCentral
      : modalidadPreferida === 'PUERTA_A_PUERTA'
      ? `Ruta Casa x Casa en ${barrioPrincipal} (${
          paradasRutaSugerida
            .map(
              (p) =>
                `${p.horaLlegada} ${p.contact.primerNombre} (${p.contact.calleOCruce || p.contact.barrio})`
            )
            .join(' → ') || nombreMejorCafe
        })`
      : `${nombreMejorCafe} — ${mejorCafe?.barrio || barrioPrincipal}`;

    const puntoCentricoResumen = esSede
      ? `Reunión de los miércoles en ${profile.sedeCentral} · 18:30 a 20:00 hs`
      : mejorCafe
      ? `Circuito ${numeroCircuito} (${barrioPrincipal}) · Punto céntrico: ${mejorCafe.nombre} (${mejorCafe.direccion.split(',')[0]}) · ~${mediaMinutosMejorCafe} min a pie`
      : `Circuito ${numeroCircuito} (${barrioPrincipal}) · ${franjaCompartidaResumen}`;

    const sufijoConfirmados =
      confirmadosCount > 0
        ? ` · ✓ ${confirmadosCount}/${contactosOrdenadosCronologicamente.length} confirmado(s) en Lista 1-a-1 (mensajes activos en Pestaña 3 Hoja de Ruta).`
        : '';

    const motivoClaro = esSede
      ? `Reunión semanal de los miércoles en ${profile.sedeCentral} (${franjaHorariaLimpia}), sincronizada con el evento "Hagamos Popurrí" de tu Google Calendar.${sufijoConfirmados}`
      : alertasCount > 0 && esSeguimientoVencidos
      ? `⚠️ Incluye ${alertasCount} vecino(s) de ${barrioPrincipal} con encuentro pendiente de fecha anterior sin cambio a "Ya adhirió". Ruta calculada de ${horaInicioReal} a ${horaFinReal} hs (${resumenOperativoRuta})${mejorCafe ? ` y café grupal sugerido en ${nombreMejorCafe} (~${mediaMinutosMejorCafe} min a pie)` : ''}.${sufijoConfirmados}`
      : modalidadPreferida === 'PUERTA_A_PUERTA'
      ? `Opción óptima Casa x Casa en ${barrioPrincipal} sincronizada por orden de horarios de ${horaInicioReal} a ${horaFinReal} hs (${resumenOperativoRuta})${mejorCafe ? `. Café grupal alternativo del bloque: ${nombreMejorCafe} (~${mediaMinutosMejorCafe} min a pie)` : ''}.${sufijoConfirmados}`
      : `Encuentro grupal en café de ${barrioPrincipal}: se propone encontrarnos en ${nombreMejorCafe} de ${franjaHorariaLimpia} (~${mediaMinutosMejorCafe} min a pie). Si una persona prefiere que pasemos por su dirección, al consolidarlo en la Lista 1-a-1 se adapta automáticamente su horario en la Hoja de Ruta.${sufijoConfirmados}`;

    const cafesCandidatosCurados = cafesRanking.map((cf) => ({
      nombre: cf.nombre,
      direccion: cf.direccion,
      barrio: cf.barrio,
      distanciaPromedioMetros: cf.distanciaMetros,
      coincidenciaFranjaYDia: `${diaEtiqueta} · ${franjaHorariaLimpia} (${cf.minutosCaminando} min / ${cf.cuadrasAprox} cuadras a pie)`,
      urlGoogleMaps: cf.urlGoogleMaps,
    }));

    // Evaluar y recomendar cuál modalidad (Puerta a Puerta vs Convocar al Café) es más eficiente para este grupo
    const minutosTrasladoInternoPap = paradasRutaSugerida
      .slice(1)
      .reduce((acc, p) => acc + p.minutosViaje, 0);
    const pidenPuntoCount = contactosOrdenadosCronologicamente.filter(
      (c) =>
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
        c.situacion === 'PREFIERE_PUNTO' ||
        /punto|caf[eé]|plaza/i.test(c.comentario || '')
    ).length;
    const horasFijasDistintasCount = paradasRutaSugerida.filter((p) =>
      Boolean(p.horaPactadaExplicita)
    ).length;

    const recomiendaCafe =
      !esSede &&
      contactosOrdenadosCronologicamente.length >= 2 &&
      Boolean(mejorCafe) &&
      horasFijasDistintasCount <= 1 &&
      mediaMinutosMejorCafe <= 15 &&
      (contactosOrdenadosCronologicamente.length >= 3 ||
        pidenPuntoCount >= 1 ||
        Boolean(profile?.modoLluvia));

    const modalidadRecomendada: ModalidadEncuentroAgenda = esSede
      ? 'EVENTO_SEDE'
      : recomiendaCafe
      ? 'CAFE_HUB'
      : 'PUERTA_A_PUERTA';

    const motivoRecomendacionModalidad = esSede
      ? `Reunión grupal en sede central (${profile.sedeCentral}).`
      : contactosOrdenadosCronologicamente.length === 1
      ? `Se aconseja Puerta a Puerta: al ser 1 vecino con punto definido (${contactosOrdenadosCronologicamente[0]?.calleOCruce || barrioPrincipal}) en la franja ${franjaHorariaLimpia}, pasar directo por su ubicación es más rápido y efectivo.`
      : recomiendaCafe
      ? `Se aconseja Convocar al Café Óptimo (${nombreMejorCafe}, a ~${mediaMinutosMejorCafe} min a pie promedio)${profile?.modoLluvia ? ' [🌧️ Modo Lluvia activo: prioriza bajo techo desde 2 vecinos]' : ''}: los ${contactosOrdenadosCronologicamente.length} vecinos comparten ventana horaria compatible (${franjaHorariaLimpia}) y reunirlos en un único punto ahorra ~${Math.max(12, minutosTrasladoInternoPap)} min de traslados entre calles.`
      : `Se aconseja Puerta a Puerta (${paradasRutaSugerida.length} paradas encadenadas, ~${minutosTrasladoInternoPap} min de caminata interna entre direcciones): ${
          horasFijasDistintasCount >= 2
            ? 'los vecinos indicaron horarios puntuales escalonados'
            : 'las ubicaciones están próximas en secuencia lineal'
        }, por lo que pasar por cada punto de ${horaInicioReal} a ${horaFinReal} hs maximiza la firma sin hacerlos trasladarse.`;

    // Punto 10 y Punto 12 Calibración:
    // - Pestaña "Aprovechar viaje: vecinos del mismo barrio sin dirección" (3. Falta Dir/Día)
    // - Pestaña "Aprovechar viaje: retiros de fichas extra en este barrio" (7. Retiro Fichas sin confirmar aún)
    const idsIncluidosSet = new Set(contactosOrdenadosCronologicamente.map((c) => c.id));
    const barrioNormBloque = normalizarBarrioCABA(barrioPrincipal);
    const refDiaAprovechar =
      fechaClave === hoyBA.ddmm
        ? 'Hoy'
        : fechaClave === manianaBA.ddmm
        ? 'Mañana'
        : `El ${diaEtiqueta.toLowerCase()}`;

    const vecinosMismoBarrioSinDireccion = noAdheridosTotales
      .filter((c) => {
        if (idsIncluidosSet.has(c.id)) return false;
        if (c.esCerradoOArchivadoSinDniCaba) return false;
        if (normalizarBarrioCABA(c.barrio || '') !== barrioNormBloque) return false;
        const faltaDir =
          c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
          (c.rsp === 'Sí' &&
            c.estadoFlujo !== 'PENDIENTE_RETIRO_FICHAS' &&
            c.estadoFlujo !== 'PREFIERE_CAFE_HUB_O_SEDE' &&
            c.estadoFlujo !== 'POSTERGO_SALUD_O_VIAJE' &&
            (!c.tieneDireccionRealEnComentario || !c.calleOCruce?.trim()));
        return faltaDir;
      })
      .map((c) => {
        const saludo = c.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${c.primerNombre}, ¿cómo estás?`;
        return {
          contact: c,
          tipo: 'SIN_DIRECCION_BARRIO' as const,
          mensajeWhatsAppSugerido: `${saludo} ${refDiaAprovechar} entre las *${horaInicioReal} y las ${horaFinReal} hs* voy a estar pasando por *${barrioPrincipal}* para las firmas de adhesión. ¿Por qué calle/altura o esquina estás así aprovecho el viaje y paso 2 minutos?`,
        };
      });

    const retirosFichasMismoBarrioSugeridos = noAdheridosTotales
      .filter((c) => {
        if (idsIncluidosSet.has(c.id)) return false;
        if (normalizarBarrioCABA(c.barrio || '') !== barrioNormBloque) return false;
        return (
          (c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' || c.situacion === 'RETIRO_FICHAS') &&
          !esRetiroFichasConfirmadoParaRuta(c)
        );
      })
      .map((c) => {
        const saludo = c.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${c.primerNombre}, ¿cómo estás?`;
        const refLugar = c.calleOCruce?.trim() || barrioPrincipal;
        return {
          contact: c,
          tipo: 'RETIRO_FICHAS_BARRIO' as const,
          mensajeWhatsAppSugerido: `${saludo} ${refDiaAprovechar} entre las *${horaInicioReal} y las ${horaFinReal} hs* voy a estar pasando por *${barrioPrincipal}*. ¿Ya tenés listas las fichas extra firmadas así aprovecho que estoy en el barrio y paso 2 minutos por *${refLugar}* a retirarlas?`,
        };
      });

    // Punto 8 Calibración ("Reservas fantasma"):
    // Contactos en HOY sin confirmar a <= 60 min de la hora de salida del bloque
    const contactosSinConfirmarATiempoHoy =
      fechaClave === hoyBA.ddmm
        ? paradasRutaSugerida
            .filter((p) => Boolean(p.reservaFantasmaSinConfirmarHoy))
            .map((p) => p.contact)
        : [];

    return {
      id,
      clusterIdVinculado,
      diaEtiqueta,
      fechaClave,
      fechaISO,
      franjaHoraria: franjaHorariaLimpia,
      resumenOperativoRuta,
      horaInicioCalculada: horaInicioReal,
      horaFinCalculada: horaFinReal,
      duracionTotalMinutos,
      duracionEstimadaMin: duracionTotalMinutos,
      modalidad: modalidadPreferida,
      modalidadRecomendada,
      motivoRecomendacionModalidad,
      barrio: etiquetaBarrios,
      puntoEncuentroODireccion,
      puntoCentricoResumen,
      franjaCompartidaResumen,
      mediaMinutosAlCafe: mediaMinutosMejorCafe,
      motivoClaro,
      trasladoCalendarNota: notaCalendarConChoques,
      esSeguimientoVencidos,
      alertasIncluidasCount: alertasCount,
      cafesHubOpciones: cafesRanking,
      cafesCandidatosCurados,
      paradasRutaSugerida,
      contactosIncluidos: contactosOrdenadosCronologicamente,
      vecinosMismoBarrioSinDireccion,
      retirosFichasMismoBarrioSugeridos,
      contactosSinConfirmarATiempoHoy,
      modoLluviaActivo: Boolean(profile?.modoLluvia),
    };
  };

  // UNIFICACIÓN INTELIGENTE ENTRE "CIRCUITOS Y PUNTOS CÉNTRICOS" Y "AGENDA RECOMENDADA DÍA POR DÍA":
  // Construimos bloques horarios NO SUPERPUESTOS para cada día, ofreciendo la opción más óptima por bloque
  // y adaptándola dinámicamente a las confirmaciones de los vecinos (si prefieren ir al café o que pasemos Puerta a Puerta).
  const contactosSedeChile = elegiblesAgendaConLugar.filter(
    (c) => c.situacion === 'EVENTO_CHILE_1408'
  );
  const contactosTerritorio = elegiblesAgendaConLugar.filter(
    (c) => c.situacion !== 'EVENTO_CHILE_1408'
  );

  const microClustersUnificados = construirMicroClusters(
    contactosTerritorio,
    15,
    'Todos',
    profile,
    ahoraMs
  );

  const idsEnMicroClusters = new Set(
    microClustersUnificados.flatMap((cl) => cl.miembros.map((m) => m.contact.id))
  );
  const remanentesConPunto = contactosTerritorio.filter(
    (c) => !idsEnMicroClusters.has(c.id)
  );
  const gruposPorBarrioRemanentes: Record<string, Contact[]> = {};
  for (const c of remanentesConPunto) {
    const b = (c.barrio || 'Palermo').trim();
    if (!gruposPorBarrioRemanentes[b]) {
      gruposPorBarrioRemanentes[b] = [];
    }
    gruposPorBarrioRemanentes[b].push(c);
  }

  interface CircuitoParaAgendar {
    clusterId: string;
    barrio: string;
    miembros: Contact[];
    centroLat: number;
    centroLng: number;
    convieneCafeHub: boolean;
    modalidadAdaptadaPorConfirmacion?: ModalidadEncuentroAgenda;
    encadenarConCafeClusterId?: string;
    fechaExplicita?: string;
    tieneAlertaVencido: boolean;
    franjaDominante: FranjaHoraria;
    ventanaColumnaGComun?: { minIni: number; minFin: number };
    horaPuntualMasTemprana?: string;
  }

  // Helper que calcula metadatos horarios precisos de un grupo de contactos (incluyendo hora puntual más temprana y ventana común)
  const calcularMetadatosCircuito = (
    subId: string,
    barrio: string,
    miembrosSub: Contact[],
    convieneCafeDefault: boolean,
    modalidadForzada?: ModalidadEncuentroAgenda,
    fechaExp?: string,
    encadenarConCafeClusterId?: string
  ): CircuitoParaAgendar => {
    const conteoF: Record<string, number> = {};
    let minIniComun: number | undefined;
    let minFinComun: number | undefined;
    let horaPuntual: string | undefined;

    for (const c of miembrosSub) {
      conteoF[c.franjaHoraria] = (conteoF[c.franjaHoraria] || 0) + 1;
      const disp = analizarDisponibilidadColumnaG(obtenerTextoHorarioAgendaContacto(c));
      if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
        if (
          !horaPuntual ||
          horaAMinutosDelDia(disp.horaPuntualPactada) < horaAMinutosDelDia(horaPuntual)
        ) {
          horaPuntual = disp.horaPuntualPactada;
        }
      } else if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
        if (minIniComun === undefined || minFinComun === undefined) {
          minIniComun = disp.minInicioVentana;
          minFinComun = disp.minFinVentana;
        } else {
          const nextIni = Math.max(minIniComun, disp.minInicioVentana);
          const nextFin = Math.min(minFinComun, disp.minFinVentana);
          if (nextIni < nextFin) {
            minIniComun = nextIni;
            minFinComun = nextFin;
          } else {
            // Si un integrante tiene ventana posterior disjunta, preservar la ventana más temprana del grupo
            // para no postergar a quienes cierran su ventana antes (ej. 15:30 a 19:00 hs).
            if (disp.minFinVentana < minFinComun) {
              minIniComun = disp.minInicioVentana;
              minFinComun = disp.minFinVentana;
            }
          }
        }
      }
    }

    let franjaDom: FranjaHoraria =
      (Object.entries(conteoF).sort((a, b) => b[1] - a[1])[0]?.[0] as FranjaHoraria) || 'Tarde';

    if (horaPuntual) {
      const minP = horaAMinutosDelDia(horaPuntual);
      franjaDom =
        minP < 12 * 60
          ? 'Mañana'
          : minP < 14 * 60 + 30
          ? 'Mediodía'
          : minP < 18 * 60
          ? 'Tarde'
          : 'Vespertino';
    } else if (minIniComun !== undefined && minFinComun !== undefined) {
      const mid = Math.round((minIniComun + minFinComun) / 2);
      if (minFinComun <= 12 * 60 + 30 || mid < 11 * 60 + 45) {
        franjaDom = 'Mañana';
      } else if (minFinComun <= 14 * 60 + 30 || mid < 14 * 60) {
        franjaDom = 'Mediodía';
      } else if (minIniComun >= 17 * 60 + 30) {
        franjaDom = 'Vespertino';
      } else {
        franjaDom = 'Tarde';
      }
    }

    // Regla Calibrada:
    // - Si algún vecino pidió explícitamente Café HUB / Punto, o si hay >= 3 vecinos con convieneCafeDefault, usar CAFE_HUB.
    // - Si son 2 vecinos y ninguno pidió Café HUB explícitamente, priorizar PUERTA_A_PUERTA.
    const algunoPidioCafeSub = miembrosSub.some(
      (c) =>
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
        c.situacion === 'PREFIERE_PUNTO' ||
        /punto\s+de\s+encuentro|prefiere\s+(?:punto|caf[eé])|acercarme\s+a\s+un\s+caf[eé]/i.test(
          c.comentario || ''
        )
    );
    const convieneCafe =
      modalidadForzada === 'CAFE_HUB'
        ? true
        : modalidadForzada === 'PUERTA_A_PUERTA'
        ? false
        : miembrosSub.length < 2
        ? false
        : convieneCafeDefault &&
          (miembrosSub.length >= 3 || algunoPidioCafeSub || Boolean(profile?.modoLluvia));

    // Resolver fecha objetivo priorizando HOY si algún miembro está pautado para HOY
    const fechasMiembros = miembrosSub
      .map((c) => resolverFechaObjetivoContacto(c, ahoraMs))
      .filter((f): f is string => Boolean(f));
    const fechaEfectivaSub =
      fechasMiembros.includes(hoyBA.ddmm)
        ? hoyBA.ddmm
        : fechaExp || fechasMiembros[0] || miembrosSub.flatMap((c) => c.fechasMencionadas)[0];

    const n = Math.max(1, miembrosSub.length);
    const cLat = miembrosSub.reduce((acc, x) => acc + x.lat, 0) / n;
    const cLng = miembrosSub.reduce((acc, x) => acc + x.lng, 0) / n;

    return {
      clusterId: subId,
      barrio,
      miembros: miembrosSub,
      centroLat: cLat,
      centroLng: cLng,
      convieneCafeHub: convieneCafe,
      modalidadAdaptadaPorConfirmacion: modalidadForzada,
      encadenarConCafeClusterId,
      fechaExplicita: fechaEfectivaSub,
      tieneAlertaVencido: miembrosSub.some((c) => Boolean(c.alertaVencido?.activa)),
      franjaDominante: franjaDom,
      ventanaColumnaGComun:
        minIniComun !== undefined && minFinComun !== undefined
          ? { minIni: minIniComun, minFin: minFinComun }
          : undefined,
      horaPuntualMasTemprana: horaPuntual,
    };
  };

  // Helper que analiza las respuestas ya cargadas en la Lista 1-a-1 para adaptar o dividir un grupo en sub-bloques óptimos (Café vs Puerta a Puerta)
  const construirCircuitosAdaptadosSegunConfirmacion = (
    clusterIdBase: string,
    barrio: string,
    contactosOrig: Contact[],
    _centroLat: number,
    _centroLng: number,
    convieneCafeDefault: boolean,
    fechaExp?: string
  ): CircuitoParaAgendar[] => {
    const pidieronPuertaAPuerta: Contact[] = [];
    const pidieronCafeHub: Contact[] = [];
    const sinPreferenciaForzada: Contact[] = [];

    for (const c of contactosOrig) {
      const comLow = (c.comentario || '').toLowerCase();
      const declinoCafe =
        comLow.includes('declinó café') ||
        comLow.includes('declino cafe') ||
        comLow.includes('pasa a puerta a puerta') ||
        comLow.includes('visita puerta a puerta') ||
        comLow.includes('visita confirmada puerta a puerta') ||
        /confirmado\s+1-a-1[^\]]*puerta\s+a\s+puerta/i.test(comLow);
      const pidioCafe =
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
        comLow.includes('prefiere punto de encuentro') ||
        comLow.includes('prefiere café hub') ||
        (c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' &&
          /encuentro\s+confirmado\s+en\s+caf[eé]\s*hub|confirm[oó]\s+caf[eé]\s*hub|confirmado\s+1-a-1[^\]]*caf[eé]\s*hub/i.test(
            comLow
          ));
      const confirmoDomicilio =
        c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' && !pidioCafe && (declinoCafe || Boolean(c.calleOCruce));

      if (declinoCafe || confirmoDomicilio) {
        pidieronPuertaAPuerta.push(c);
      } else if (pidioCafe) {
        pidieronCafeHub.push(c);
      } else {
        sinPreferenciaForzada.push(c);
      }
    }

    const armarSubCircuito = (
      subId: string,
      miembrosSub: Contact[],
      modalidadForzada?: ModalidadEncuentroAgenda,
      encadenarConCafeClusterId?: string
    ): CircuitoParaAgendar =>
      calcularMetadatosCircuito(
        subId,
        barrio,
        miembrosSub,
        convieneCafeDefault,
        modalidadForzada,
        fechaExp,
        encadenarConCafeClusterId
      );

    const grupoCafeCandidato = [...pidieronCafeHub, ...sinPreferenciaForzada];
    // Regla Calibrada:
    // Si hay un grupo que va al Café HUB (ya sea porque pidieron Café HUB o porque quedan >= 3 vecinos para el café)
    // y otro(s) vecino(s) declinó ir al café y pidió que pasemos por su domicilio (pidieronPuertaAPuerta):
    // -> Agendamos primero el Café HUB y encadenamos la visita a domicilio inmediatamente antes o después del horario del Café HUB
    //    (o en el próximo hueco/día libre si no entra en ese día).
    if (
      pidieronPuertaAPuerta.length > 0 &&
      (pidieronCafeHub.length > 0 || grupoCafeCandidato.length >= 3)
    ) {
      const idCafe = `${clusterIdBase}-cafe`;
      const grupoCafeEfectivo =
        grupoCafeCandidato.length >= 2 ? grupoCafeCandidato : pidieronCafeHub;
      const grupoPapEfectivo =
        grupoCafeCandidato.length >= 2
          ? pidieronPuertaAPuerta
          : [...pidieronPuertaAPuerta, ...sinPreferenciaForzada];
      return [
        armarSubCircuito(idCafe, grupoCafeEfectivo, 'CAFE_HUB'),
        armarSubCircuito(`${clusterIdBase}-pap`, grupoPapEfectivo, 'PUERTA_A_PUERTA', idCafe),
      ];
    }

    if (pidieronPuertaAPuerta.length > 0) {
      return [armarSubCircuito(clusterIdBase, contactosOrig, 'PUERTA_A_PUERTA')];
    }

    if (pidieronCafeHub.length > 0) {
      return [armarSubCircuito(clusterIdBase, contactosOrig, 'CAFE_HUB')];
    }

    return [armarSubCircuito(clusterIdBase, contactosOrig, undefined)];
  };

  const circuitosCrudos: CircuitoParaAgendar[] = [];

  for (const cl of microClustersUnificados) {
    const contactosCl = cl.miembros.map((m) => m.contact);
    circuitosCrudos.push(
      ...construirCircuitosAdaptadosSegunConfirmacion(
        cl.id,
        cl.barrioPrincipal,
        contactosCl,
        cl.centroLat,
        cl.centroLng,
        cl.convieneCafeHub,
        cl.fechasAgrupadas?.[0]
      )
    );
  }

  for (const [barrioRem, listaRem] of Object.entries(gruposPorBarrioRemanentes)) {
    // Separar además en sub-lotes compatibles en horario para nunca mezclar mañana con tarde
    const subLotesCompatibles: Contact[][] = [];
    for (const c of listaRem) {
      const subExistente = subLotesCompatibles.find((sub) =>
        sonHorariosCompatiblesEnCircuito(sub, c)
      );
      if (subExistente) {
        subExistente.push(c);
      } else {
        subLotesCompatibles.push([c]);
      }
    }
    subLotesCompatibles.forEach((lote, i) => {
      const coordsB = COORDENADAS_BARRIOS_CABA[barrioRem] || COORDENADAS_BARRIOS_CABA.Palermo;
      const geoExactosLote = lote.filter((c) => c.tieneCoordenadasExactas !== false);
      const selCafesLote =
        lote.length >= 2 && geoExactosLote.length >= 2
          ? seleccionarCafesHubPorCercaniaYFranja(
              lote,
              barrioRem,
              hoyBA.ddmm,
              profile
            )
          : undefined;
      const convieneCafeLote = Boolean(
        selCafesLote &&
          selCafesLote.cafesRanking.length > 0 &&
          ((selCafesLote.cafesRanking[0] as any).maxMinutosMiembro ??
            selCafesLote.cafesRanking[0].minutosCaminando) <= 15
      );
      circuitosCrudos.push(
        ...construirCircuitosAdaptadosSegunConfirmacion(
          `cluster-extra-${barrioRem.toLowerCase()}-${i}`,
          barrioRem,
          lote,
          coordsB.lat,
          coordsB.lng,
          convieneCafeLote,
          undefined
        )
      );
    });
  }

  // CONSOLIDACIÓN ANTI-SUPERPOSICIÓN POR DÍA, BARRIO Y COMPATIBILIDAD HORARIA REAL:
  // Punto 13 Calibración: Sin tope artificial de 6 paradas cuando comparten barrio, día y compatibilidad horaria.
  const circuitosParaAgendar: CircuitoParaAgendar[] = [];

  for (const circ of circuitosCrudos) {
    const modCirc = circ.modalidadAdaptadaPorConfirmacion || (circ.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
    const compatibleExistente = circuitosParaAgendar.find((ex) => {
      if (ex.barrio.toLowerCase() !== circ.barrio.toLowerCase()) return false;

      if (circ.fechaExplicita && ex.fechaExplicita && ex.fechaExplicita !== circ.fechaExplicita) {
        return false;
      }
      if (
        (circ.fechaExplicita === hoyBA.ddmm && ex.fechaExplicita !== hoyBA.ddmm) ||
        (ex.fechaExplicita === hoyBA.ddmm && circ.fechaExplicita !== hoyBA.ddmm)
      ) {
        return false;
      }
      // Si un miembro tiene fechas explícitas cargadas que NO incluyen la fecha del otro grupo, jamás fusionarlos
      const fObjetivoUnion = ex.fechaExplicita || circ.fechaExplicita;
      if (fObjetivoUnion) {
        const todosAceptanFecha = [...ex.miembros, ...circ.miembros].every(
          (m) => m.fechasMencionadas.length === 0 || m.fechasMencionadas.includes(fObjetivoUnion)
        );
        if (!todosAceptanFecha) return false;
      }

      const modEx = ex.modalidadAdaptadaPorConfirmacion || (ex.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
      const tienePreferenciaExplicitaDistinta =
        Boolean(circ.modalidadAdaptadaPorConfirmacion || ex.modalidadAdaptadaPorConfirmacion) &&
        modEx !== modCirc;
      if (tienePreferenciaExplicitaDistinta) return false;
      const esRemanenteIndividual = circ.miembros.length === 1 || ex.miembros.length === 1;
      if (modEx !== modCirc && !esRemanenteIndividual) return false;

      if (fObjetivoUnion === hoyBA.ddmm) {
        return true;
      }
      return circ.miembros.every((m) => sonHorariosCompatiblesEnCircuito(ex.miembros, m));
    });

    if (compatibleExistente) {
      const idsExistentes = new Set(compatibleExistente.miembros.map((m) => m.id));
      const miembrosUnificados = [...compatibleExistente.miembros];
      for (const m of circ.miembros) {
        if (!idsExistentes.has(m.id)) miembrosUnificados.push(m);
      }
      const recalculado = calcularMetadatosCircuito(
        compatibleExistente.clusterId,
        compatibleExistente.barrio,
        miembrosUnificados,
        compatibleExistente.convieneCafeHub || circ.convieneCafeHub || miembrosUnificados.length >= 2,
        compatibleExistente.modalidadAdaptadaPorConfirmacion || circ.modalidadAdaptadaPorConfirmacion,
        compatibleExistente.fechaExplicita || circ.fechaExplicita
      );
      Object.assign(compatibleExistente, recalculado);
      continue;
    }

    circuitosParaAgendar.push(circ);
  }

  // Punto 11 y Punto 13 Calibración:
  // Prioridad al competir circuitos para el mismo día/hueco:
  // 1º Volumen de firmas (donde haya más vecinos juntos)
  // 2º Fechas que vencen ese día / alertas vencidas
  // 3º Cercanía al punto anterior / evento físico de Calendar / KM 0
  const fechasOperativasSet = new Set(diasOperativos.map((d) => d.diaBA.ddmm));
  const prioridadFechaCircuito = (c: CircuitoParaAgendar): number => {
    if (c.fechaExplicita === hoyBA.ddmm) return 0;
    if (c.fechaExplicita === manianaBA.ddmm) return 1;
    if (c.fechaExplicita && fechasOperativasSet.has(c.fechaExplicita)) return 2;
    if (c.tieneAlertaVencido) return 3;
    return 4;
  };

  const minReferenciaOrdenCircuito = (c: CircuitoParaAgendar): number => {
    if (c.horaPuntualMasTemprana) {
      return horaAMinutosDelDia(c.horaPuntualMasTemprana);
    }
    if (c.ventanaColumnaGComun) {
      return Math.round(c.ventanaColumnaGComun.minIni * 0.55 + c.ventanaColumnaGComun.minFin * 0.45);
    }
    if (c.franjaDominante === 'Mañana') return 10 * 60 + 30;
    if (c.franjaDominante === 'Mediodía') return 13 * 60;
    if (c.franjaDominante === 'Vespertino') return 18 * 60;
    return 15 * 60 + 30;
  };

  const calcularDistanciaAlOrigenOEventoCircuito = (c: CircuitoParaAgendar, minRef: number): number => {
    const diaEvs = c.fechaExplicita
      ? diasOperativos.find((d) => d.diaBA.ddmm === c.fechaExplicita)?.eventos || []
      : diasOperativos[0]?.eventos || [];
    const evFisicoPrevio = diaEvs.find((ev) => {
      if (esEventoVirtualCalendar(ev)) return false;
      const tieneDir = Boolean(
        ev.location && ev.location.trim() && ev.location.trim().toUpperCase() !== 'CABA'
      );
      if (!tieneDir) return false;
      const evFin = horaAMinutosDelDia(ev.endTime);
      return minRef >= evFin - 30 && minRef <= evFin + 180;
    });
    if (evFisicoPrevio) {
      const geoEv = geocodificarEventoCalendar(evFisicoPrevio, profile);
      return distanciaHaversineMetros(geoEv.lat, geoEv.lng, c.centroLat, c.centroLng);
    }
    return distanciaHaversineMetros(partidaKm0.lat, partidaKm0.lng, c.centroLat, c.centroLng);
  };

  circuitosParaAgendar.sort((a, b) => {
    const pa = prioridadFechaCircuito(a);
    const pb = prioridadFechaCircuito(b);
    // Para circuitos sin fecha fija o alertas que compiten por días disponibles (pa >= 3 && pb >= 3),
    // aplicar 1º Volumen de firmas (más vecinos juntos), 2º Vencimientos, 3º Cercanía.
    if (pa >= 3 && pb >= 3) {
      if (b.miembros.length !== a.miembros.length) {
        return b.miembros.length - a.miembros.length;
      }
      if (pa !== pb) return pa - pb;
    } else if (pa !== pb) {
      return pa - pb;
    }

    const aConfirmado = a.miembros.some(esContactoConfirmadoEnLista1a1);
    const bConfirmado = b.miembros.some(esContactoConfirmadoEnLista1a1);
    if (aConfirmado !== bConfirmado) return aConfirmado ? -1 : 1;

    const minA = minReferenciaOrdenCircuito(a);
    const minB = minReferenciaOrdenCircuito(b);
    const aPuntual = Boolean(a.horaPuntualMasTemprana);
    const bPuntual = Boolean(b.horaPuntualMasTemprana);

    // Si pertenecen al mismo día explícito y uno tiene hora fija temprana vs otro mucho más tarde (>90 min), mantener orden cronológico del día
    if (pa <= 2 && Math.abs(minA - minB) > 90 && (aPuntual || bPuntual)) {
      return minA - minB;
    }

    // Compitiendo por el mismo día / hueco:
    // 1º Volumen de firmas (donde haya más vecinos juntos)
    if (b.miembros.length !== a.miembros.length) {
      return b.miembros.length - a.miembros.length;
    }
    // 2º Fechas que vencen ese día / alertas vencidas
    if (a.tieneAlertaVencido !== b.tieneAlertaVencido) {
      return a.tieneAlertaVencido ? -1 : 1;
    }
    // 3º Cercanía al punto anterior / evento físico de Calendar / KM 0
    const distA = calcularDistanciaAlOrigenOEventoCircuito(a, minA);
    const distB = calcularDistanciaAlOrigenOEventoCircuito(b, minB);
    if (Math.abs(distA - distB) > 150) {
      return distA - distB;
    }
    return minA - minB;
  });

  const agendaSugeridaDias: BloqueAgendaRecomendado[] = [];
  const conteoCircuitosPorDia: Record<string, number> = {};

  // Las reuniones en Chile 1408 son los miércoles (18:30 a 20:00 hs, según Google Calendar "Hagamos Popurrí")
  const diaMiercolesSede =
    diasOperativos.find(
      (d) =>
        d.diaBA.dayOfWeek === 3 ||
        ['miércoles', 'miercoles'].includes(d.diaBA.nombreDia.toLowerCase())
    ) || diasOperativos[0];

  if (contactosSedeChile.length > 0) {
    if (!intervalosOcupadosPorDia[diaMiercolesSede.diaBA.ddmm]) {
      intervalosOcupadosPorDia[diaMiercolesSede.diaBA.ddmm] = [];
    }
    intervalosOcupadosPorDia[diaMiercolesSede.diaBA.ddmm].push({
      ini: 18 * 60 + 30,
      fin: 20 * 60,
    });
  }

  circuitosParaAgendar.slice(0, 30).forEach((circ, idx) => {
    const tieneConfirmadosCirc = circ.miembros.some(esContactoConfirmadoEnLista1a1);
    const matchDiaExplicito = circ.fechaExplicita
      ? diasOperativos.find((d) => d.diaBA.ddmm === circ.fechaExplicita)
      : undefined;

    const diasFuturosPreferidos = diasOperativos.slice(1).length > 0 ? diasOperativos.slice(1) : diasOperativos;

    let diaElegido =
      matchDiaExplicito
        ? matchDiaExplicito
        : diasFuturosPreferidos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 1) ||
          diasFuturosPreferidos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 2) ||
          diasOperativos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 2) ||
          diasFuturosPreferidos.find((d) => (conteoCircuitosPorDia[d.diaBA.ddmm] || 0) < 3) ||
          diasFuturosPreferidos[idx % diasFuturosPreferidos.length];

    const modalidadCirc: ModalidadEncuentroAgenda =
      circ.modalidadAdaptadaPorConfirmacion ||
      (circ.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
    const duracionEst =
      modalidadCirc === 'PUERTA_A_PUERTA'
        ? Math.max(25, circ.miembros.length * 20)
        : Math.max(30, Math.min(60, 30 + circ.miembros.length * 8));

    // Regla Calibrada Protocolo Café HUB -> Pasa a Domicilio:
    // Si este bloque Puerta a Puerta proviene de alguien que rechazó el Café HUB del mismo barrio,
    // intentar primero ubicarlo inmediatamente ANTES o DESPUÉS del horario del Café HUB en ese mismo día;
    // si no hay espacio en el día, separarlo automáticamente en el siguiente hueco libre del día o del próximo día disponible de esa persona.
    let horaSalidaEncadenada: string | undefined;
    let notaEncadenada: string | undefined;

    if (circ.encadenarConCafeClusterId) {
      const bloqueCafeHermano = agendaSugeridaDias.find(
        (b) => b.clusterIdVinculado === circ.encadenarConCafeClusterId
      );
      const diaCafe = bloqueCafeHermano
        ? diasOperativos.find((d) => d.diaBA.ddmm === bloqueCafeHermano.fechaClave)
        : undefined;
      if (bloqueCafeHermano && diaCafe) {
        const cafeRef = bloqueCafeHermano.cafesHubOpciones?.[0];
        const minTrasladoAlCafe = cafeRef
          ? estimarMinutosCaminandoCABA(circ.centroLat, circ.centroLng, cafeRef.lat, cafeRef.lng).minutosCaminando
          : 10;
        const iniCafeMin = horaAMinutosDelDia(bloqueCafeHermano.horaInicioCalculada || '15:00');
        const finCafeMin = horaAMinutosDelDia(bloqueCafeHermano.horaFinCalculada || '16:00');
        const ocupadosDiaCafe = intervalosOcupadosPorDia[diaCafe.diaBA.ddmm] || [];
        const ventanaVecino = circ.ventanaColumnaGComun;

        const cabeEnHueco = (iniCand: number, finCand: number) => {
          if (iniCand < 9 * 60 || finCand > 20 * 60 + 15) return false;
          if (ventanaVecino && (iniCand < ventanaVecino.minIni - 15 || finCand > ventanaVecino.minFin + 15)) {
            return false;
          }
          const chocaOcupado = ocupadosDiaCafe.some((oc) => iniCand < oc.fin + 2 && finCand + 2 > oc.ini);
          if (chocaOcupado) return false;
          const chocaCal = diaCafe.eventos.some((ev) => {
            const evI = horaAMinutosDelDia(ev.startTime);
            const evF = horaAMinutosDelDia(ev.endTime);
            return iniCand < evF + 10 && finCand + 15 > evI;
          });
          return !chocaCal;
        };

        // Opción A: Inmediatamente DESPUÉS del Café HUB (saliendo del café hacia el domicilio)
        const iniDespues = finCafeMin;
        const finDespues = iniDespues + minTrasladoAlCafe + circ.miembros.length * 10;
        // Opción B: Inmediatamente ANTES del Café HUB (pasando por el domicilio y caminando al café)
        const finAntes = iniCafeMin - minTrasladoAlCafe;
        const iniAntes = finAntes - (circ.miembros.length * 10 + 10);

        if (cabeEnHueco(iniDespues, finDespues)) {
          diaElegido = diaCafe;
          horaSalidaEncadenada = sumarMinutosAHora('00:00', iniDespues);
          notaEncadenada = `✓ Visita a domicilio encadenada inmediatamente después del Café HUB (${bloqueCafeHermano.horaInicioCalculada}-${bloqueCafeHermano.horaFinCalculada} hs), contemplando ~${minTrasladoAlCafe} min a pie desde el café.`;
        } else if (cabeEnHueco(iniAntes, finAntes)) {
          diaElegido = diaCafe;
          horaSalidaEncadenada = sumarMinutosAHora('00:00', Math.max(9 * 60, iniAntes));
          notaEncadenada = `✓ Visita a domicilio encadenada inmediatamente antes del Café HUB (${bloqueCafeHermano.horaInicioCalculada}-${bloqueCafeHermano.horaFinCalculada} hs), contemplando ~${minTrasladoAlCafe} min a pie hacia el café.`;
        } else {
          // Si no entra pegado al Café HUB, buscar otro hueco en el mismo día o pasar al próximo día disponible de esa persona
          const slotMismoDia = encontrarVentanaDiurnaSinChoqueCalendar({
            diaInfo: diaCafe,
            duracionMin: duracionEst,
            franjaPreferida: circ.franjaDominante,
            latBarrio: circ.centroLat,
            lngBarrio: circ.centroLng,
            ventanaColumnaG: circ.ventanaColumnaGComun,
            horaPuntualPreferida: circ.horaPuntualMasTemprana,
            tieneConfirmados: tieneConfirmadosCirc,
          });
          if (!slotMismoDia.chocaForzado) {
            diaElegido = diaCafe;
            horaSalidaEncadenada = slotMismoDia.horaInicio;
            notaEncadenada = slotMismoDia.notaCalendar;
          } else {
            const proximoDiaVecino =
              diasOperativos
                .slice(1)
                .find(
                  (d) =>
                    d.diaBA.ddmm !== diaCafe.diaBA.ddmm &&
                    (circ.miembros.every((m) => m.fechasMencionadas.length === 0) ||
                      circ.miembros.some((m) => m.fechasMencionadas.includes(d.diaBA.ddmm)))
                ) ||
              diasOperativos.find((d) => d.diaBA.ddmm !== diaCafe.diaBA.ddmm) ||
              diaElegido;
            diaElegido = proximoDiaVecino;
          }
        }
      }
    }

    conteoCircuitosPorDia[diaElegido.diaBA.ddmm] =
      (conteoCircuitosPorDia[diaElegido.diaBA.ddmm] || 0) + 1;

    const slot = horaSalidaEncadenada
      ? {
          horaInicio: horaSalidaEncadenada,
          notaCalendar: notaEncadenada || `✓ Horario coordinado para el ${diaElegido.diaBA.ddmm}.`,
          chocaForzado: false,
        }
      : encontrarVentanaDiurnaSinChoqueCalendar({
          diaInfo: diaElegido,
          duracionMin: duracionEst,
          franjaPreferida: circ.franjaDominante,
          latBarrio: circ.centroLat,
          lngBarrio: circ.centroLng,
          ventanaColumnaG: circ.ventanaColumnaGComun,
          horaPuntualPreferida: circ.horaPuntualMasTemprana,
          tieneConfirmados: tieneConfirmadosCirc,
        });

    const etiquetaDiaLimpia =
      diaElegido.prefijo === 'HOY' || diaElegido.prefijo === 'MAÑANA'
        ? `${diaElegido.prefijo} (${diaElegido.diaBA.nombreDia} ${diaElegido.diaBA.ddmm})`
        : `${diaElegido.diaBA.nombreDia.toUpperCase()} ${diaElegido.diaBA.ddmm}`;

    agendaSugeridaDias.push(
      construirBloqueAgendaSincronizado({
        id: `agenda-circuito-${idx + 1}-${circ.barrio.toLowerCase().replace(/\s+/g, '-')}`,
        clusterIdVinculado: circ.clusterId,
        numeroCircuito: idx + 1,
        diaEtiqueta: etiquetaDiaLimpia,
        fechaClave: diaElegido.diaBA.ddmm,
        fechaISO: diaElegido.diaBA.isoDate,
        horaSalidaBase: slot.horaInicio,
        barrioDefault: circ.barrio,
        modalidadPreferida: modalidadCirc,
        contactosGrupo: circ.miembros,
        eventosDelDia: diaElegido.eventos,
        notaCalendarBase: slot.notaCalendar,
        esSeguimientoVencidos: circ.tieneAlertaVencido && !matchDiaExplicito,
      })
    );
  });

  if (contactosSedeChile.length > 0) {
    const etiqMiercoles = diaMiercolesSede.esHoy
      ? `HOY (${diaMiercolesSede.diaBA.nombreDia} ${diaMiercolesSede.diaBA.ddmm}) · Reunión en Chile 1408`
      : `ENCUENTRO SEMANAL SEDE (${diaMiercolesSede.diaBA.nombreDia} ${diaMiercolesSede.diaBA.ddmm})`;
    agendaSugeridaDias.push(
      construirBloqueAgendaSincronizado({
        id: 'agenda-sede-chile-1408',
        numeroCircuito: agendaSugeridaDias.length + 1,
        diaEtiqueta: etiqMiercoles,
        fechaClave: diaMiercolesSede.diaBA.ddmm,
        fechaISO: diaMiercolesSede.diaBA.isoDate,
        horaSalidaBase: '18:30',
        barrioDefault: 'Monserrat',
        modalidadPreferida: 'EVENTO_SEDE',
        contactosGrupo: contactosSedeChile,
        eventosDelDia: diaMiercolesSede.eventos,
        notaCalendarBase: `Coincide con la reunión de los miércoles en la Sede de Chile 1408 (18:30 a 20:00 hs, evento "Hagamos Popurrí" en Calendar).`,
      })
    );
  }

  // Ordenar los bloques de la Agenda Recomendada Día por Día por fecha ascendente y por hora de inicio ascendente
  // para que los bloques horarios de cada día se vean en secuencia cronológica limpia y sin superposiciones
  agendaSugeridaDias.sort((a, b) => {
    const fA = a.fechaISO || '';
    const fB = b.fechaISO || '';
    if (fA !== fB) return fA.localeCompare(fB);
    return (
      horaAMinutosDelDia(a.horaInicioCalculada || '09:00') -
      horaAMinutosDelDia(b.horaInicioCalculada || '09:00')
    );
  });
  agendaSugeridaDias.forEach((b, i) => {
    b.puntoCentricoResumen = (b.puntoCentricoResumen || '').replace(
      /^Circuito\s+\d+/,
      `Bloque ${i + 1}`
    );
    // Si alguna parada del bloque de HOY tenía compromiso explícito para hoy y quedó vencida sin adherir respecto de la hora actual,
    // asegurar que el contacto tenga `alertaVencido` activa y figure en `alertasPendientesVencidos`
    if (b.fechaClave === hoyBA.ddmm && b.paradasRutaSugerida) {
      for (const p of b.paradasRutaSugerida) {
        const teniaCompromisoHoy =
          p.contact.fechasMencionadas.includes(hoyBA.ddmm) ||
          Boolean(p.contact.alertaVencido?.activa);
        if (p.vencidaSinAdherir && p.contact.adhirio !== 'Sí' && teniaCompromisoHoy) {
          if (!p.contact.alertaVencido?.activa) {
            const horaVenc = p.horaPactadaExplicita || p.ventanaColumnaG || `${p.horaLlegada} hs`;
            p.contact.alertaVencido = {
              activa: true,
              tipo: 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION',
              titulo: `Encuentro / Visita de hoy vencida (${hoyBA.ddmm} · ${horaVenc}) sin cambio a "Ya adhirió"`,
              motivo:
                p.motivoVencimiento ||
                `Tenía visita prevista hoy (${hoyBA.ddmm} · ${horaVenc}) en ${p.destinoNombre}, y siendo las ${hoyBA.hhmm} hs ya pasó el horario sin cambiar a "Adhirió: Sí".`,
              fechaVencida: `${hoyBA.ddmm} (${horaVenc})`,
              propuestaReprogramacion: `Reprogramar pasada Puerta a Puerta por ${p.destinoNombre} (${p.contact.barrio}) para mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}${
                p.cafeHubAsignado ? ` o en ${p.cafeHubAsignado.nombre} (${p.cafeHubAsignado.direccion})` : ''
              }`,
              mensajeDisculpasReprogramacion: p.mensajeDisculpasVencido || '',
            };
          }
          if (!alertasPendientesVencidos.some((a) => a.id === p.contact.id)) {
            alertasPendientesVencidos.push(p.contact);
          }
        }
      }
      b.alertasIncluidasCount = b.contactosIncluidos.filter((c) =>
        Boolean(c.alertaVencido?.activa)
      ).length;
    }
  });

  // SINCRONIZACIÓN DE CAFÉS GRUPALES ENTRE AGENDA / CIRCUITOS Y TODOS LOS MENSAJES WA:
  // Si un contacto pertenece a un bloque o barrio que agrupa a >= 2 personas ya contactadas,
  // el café propuesto en sus mensajes coincide exactamente con el café gestionado por la app para ese grupo.
  // Si en ese grupo/barrio hay 1 sola persona contactada, no se propone café (se propone pasar 2 minutos por su dirección).
  const cafeGrupalPorContactoId = new Map<string, OpcionesCafeMensaje>();
  const cafeGrupalPorBarrio = new Map<string, OpcionesCafeMensaje>();

  for (const b of agendaSugeridaDias) {
    if (b.modalidad === 'EVENTO_SEDE' || b.modalidad === 'ENCUENTRO_SEDE') continue;
    const cf = b.cafesHubOpciones?.[0];
    if (b.contactosIncluidos.length >= 2 && cf) {
      const opt: OpcionesCafeMensaje = {
        incluirCafe: true,
        cafeNombre: cf.nombre,
        cafeDireccion: cf.direccion,
        cafeLat: cf.lat,
        cafeLng: cf.lng,
        horarioTexto: `${b.diaEtiqueta.toLowerCase()} de ${b.franjaHoraria}`,
      };
      if (!cafeGrupalPorBarrio.has(b.barrio.toLowerCase())) {
        cafeGrupalPorBarrio.set(b.barrio.toLowerCase(), opt);
      }
      for (const c of b.contactosIncluidos) {
        cafeGrupalPorContactoId.set(c.id, opt);
      }
    }
  }

  for (const cl of microClustersUnificados) {
    const cf = cl.cafesHubCercanos?.[0];
    if (cl.miembros.length >= 2 && cf) {
      const opt: OpcionesCafeMensaje = {
        incluirCafe: true,
        cafeNombre: cf.nombre,
        cafeDireccion: cf.direccion,
        cafeLat: cf.lat,
        cafeLng: cf.lng,
      };
      if (!cafeGrupalPorBarrio.has(cl.barrioPrincipal.toLowerCase())) {
        cafeGrupalPorBarrio.set(cl.barrioPrincipal.toLowerCase(), opt);
      }
      for (const m of cl.miembros) {
        if (!cafeGrupalPorContactoId.has(m.contact.id)) {
          cafeGrupalPorContactoId.set(m.contact.id, opt);
        }
      }
    }
  }

  // Para barrios con >= 2 personas ya contactadas pendientes que aún no tenían bloque asignado,
  // calcular su café céntrico grupal para mantener correspondencia total en toda la app
  const contactadosPendientesPorBarrio: Record<string, Contact[]> = {};
  for (const c of noAdheridosTotales) {
    if (!c.primerContactoEnviado) continue;
    const bKey = (c.barrio || 'Palermo').trim();
    if (!contactadosPendientesPorBarrio[bKey]) contactadosPendientesPorBarrio[bKey] = [];
    contactadosPendientesPorBarrio[bKey].push(c);
  }
  for (const [barrioNombre, grupoBarrio] of Object.entries(contactadosPendientesPorBarrio)) {
    const bLow = barrioNombre.toLowerCase();
    if (grupoBarrio.length >= 2 && !cafeGrupalPorBarrio.has(bLow)) {
      const sel = seleccionarCafesHubPorCercaniaYFranja(
        grupoBarrio,
        barrioNombre,
        hoyBA.ddmm,
        profile
      );
      const cf = sel.cafesRanking[0];
      if (cf) {
        cafeGrupalPorBarrio.set(bLow, {
          incluirCafe: true,
          cafeNombre: cf.nombre,
          cafeDireccion: cf.direccion,
          cafeLat: cf.lat,
          cafeLng: cf.lng,
        });
      }
    }
  }

  const resolverOpcionesCafeContacto = (c: Contact): OpcionesCafeMensaje => {
    const porId = cafeGrupalPorContactoId.get(c.id);
    if (porId) return porId;
    const porBarrio = cafeGrupalPorBarrio.get((c.barrio || '').trim().toLowerCase());
    if (porBarrio) return porBarrio;
    return { incluirCafe: false };
  };

  for (const c of filtrados) {
    if (c.procesoCompletadoSinMensajes || c.esCerradoOArchivadoSinDniCaba) continue;
    const optCafe = resolverOpcionesCafeContacto(c);
    if (c.alertaVencido?.activa && c.alertaVencido.tipo !== 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION') {
      const recalcAlerta = detectarAlertaPendienteVencido(
        {
          sinNombre: c.sinNombre,
          primerNombre: c.primerNombre,
          barrio: c.barrio,
          calleOCruce: c.calleOCruce,
          comentario: c.comentario,
          franjaHoraria: c.franjaHoraria,
          fechasMencionadas: c.fechasMencionadas,
          situacion: c.situacion,
          estadoFlujo: c.estadoFlujo,
          adhirio: c.adhirio,
          horasDesdeUltimoContacto: c.horasDesdeUltimoContacto,
          lat: c.lat,
          lng: c.lng,
        },
        profile,
        ahoraMs,
        optCafe
      );
      if (recalcAlerta?.activa) {
        c.alertaVencido = recalcAlerta;
      }
    } else if (c.alertaVencido?.activa) {
      const recalcAlerta = detectarAlertaPendienteVencido(
        {
          sinNombre: c.sinNombre,
          primerNombre: c.primerNombre,
          barrio: c.barrio,
          calleOCruce: c.calleOCruce,
          comentario: c.comentario,
          franjaHoraria: c.franjaHoraria,
          fechasMencionadas: c.fechasMencionadas,
          situacion: c.situacion,
          estadoFlujo: c.estadoFlujo,
          adhirio: c.adhirio,
          horasDesdeUltimoContacto: c.horasDesdeUltimoContacto,
          lat: c.lat,
          lng: c.lng,
        },
        profile,
        ahoraMs,
        optCafe
      );
      if (recalcAlerta?.activa) {
        c.alertaVencido = recalcAlerta;
      }
    }

    if (c.diagnostico48h?.aplica) {
      const recalcDiag = diagnosticarYGenerarMensajeSeguimiento48h(
        {
          sinNombre: c.sinNombre,
          primerNombre: c.primerNombre,
          barrio: c.barrio,
          rsp: c.rsp,
          adhirio: c.adhirio,
          comentario: c.comentario,
          calleOCruce: c.calleOCruce,
          franjaHoraria: c.franjaHoraria,
          fechasMencionadas: c.fechasMencionadas,
          primerContactoEnviado: c.primerContactoEnviado,
          horasDesdeUltimoContacto: c.horasDesdeUltimoContacto,
          intentos: c.intentos,
          situacion: c.situacion,
          estadoFlujo: c.estadoFlujo,
          esVisitaConcretadaORetiro: c.esVisitaConcretadaORetiro,
          tieneNuevaInfoEnColumnaG: c.tieneNuevaInfoEnColumnaG,
          lat: c.lat,
          lng: c.lng,
        },
        profile,
        ahoraMs,
        optCafe
      );
      if (recalcDiag?.aplica) {
        c.diagnostico48h = recalcDiag;
      }
    }

    const msgSync = generarMensajeContextual(
      c,
      profile,
      c.alertaVencido?.activa ? 'disculpas_y_reprogramacion' : 'auto',
      optCafe
    );
    c.mensajeSugerido = c.alertaVencido?.activa
      ? c.alertaVencido.mensajeDisculpasReprogramacion
      : c.diagnostico48h?.aplica
      ? c.diagnostico48h.mensajePersonalizado48h
      : msgSync.texto;
  }

  // Construir la cola de envío en 1 clic priorizando alertas vencidas/reprogramación
  // Reglas estrictas:
  // 1. Excluir casos "6. Sin DNI en CABA" que ya fueron respondidos/archivados (< #167 o mensaje ya enviado).
  // 2. Verificar que nadie que ya haya adherido antes aparezca en ninguna lista para enviarles un mensaje
  //    (especialmente antes de agregar a "3. Prefiere Punto (Convocar a Café Hub)").
  const candidatosCola = filtrados
    .filter((c) => {
      if (
        c.esCerradoOArchivadoSinDniCaba ||
        c.estadoFlujo === 'DESCARTADO_O_BAJA' ||
        c.referidosCabaYaEnviado === true
      ) {
        return false;
      }
      if (
        c.procesoCompletadoSinMensajes ||
        c.situacion === 'YA_ADHIRIO' ||
        c.adhirio === 'Sí' ||
        c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK'
      ) {
        return false;
      }
      if (c.situacion === 'DESCARTADO_NO_CABA') {
        return c.rsp === 'Sí' && c.telWA.length > 0 && !c.esCerradoOArchivadoSinDniCaba;
      }
      return c.telWA.length > 0;
    })
    .sort((a, b) => {
      const aAlerta = a.alertaVencido?.activa ? 0 : 1;
      const bAlerta = b.alertaVencido?.activa ? 0 : 1;
      if (aAlerta !== bAlerta) return aAlerta - bAlerta;
      return a.prioridadCorte - b.prioridadCorte;
    });

  const colaMensajes: ItemColaCorte[] = candidatosCola.map((contact) => {
    let categoriaCorte = 'Seguimiento General';
    let tipoPlantilla: TipoPlantillaWA = 'auto';

    if (contact.alertaVencido?.activa) {
      categoriaCorte = '0. ⚠️ Pendiente Vencido / Sin Confirmar (Disculpas + Reprogramar)';
      tipoPlantilla = 'disculpas_y_reprogramacion';
    } else if (
      (contact.situacion === 'PREFIERE_PUNTO' ||
        contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') &&
      contact.adhirio !== 'Sí' &&
      !contact.procesoCompletadoSinMensajes
    ) {
      categoriaCorte = '3. Prefiere Punto (Convocar a Café Hub)';
      tipoPlantilla = 'convocatoria_cafe_hub';
    } else if (contact.esRspSiSinInfoColG) {
      categoriaCorte = '3. RSP: Sí (Sin info en Col. G y sin confirmación enviada)';
      tipoPlantilla = 'seguimiento_cambio_chip';
    } else if (contact.esSinRsp48h && contact.diagnostico48h) {
      categoriaCorte = `5. Sin Rsp +48h · ${contact.diagnostico48h.etiquetaCorta}`;
      tipoPlantilla = 'seguimiento_sin_respuesta';
    } else {
      switch (contact.situacion) {
        case 'NUEVO_SIN_PRIMER_MENSAJE':
          categoriaCorte = '1. Nuevo Contacto (Enviar 1er Mensaje)';
          tipoPlantilla = 'primer_contacto';
          break;
        case 'VISITA_AGENDADA':
        case 'EVENTO_CHILE_1408':
          categoriaCorte = '2. Visita Concretada (Confirmar / En camino)';
          tipoPlantilla = 'confirmacion_visita';
          break;
        case 'PREFIERE_PUNTO':
          categoriaCorte = '3. Prefiere Punto (Convocar a Café Hub)';
          tipoPlantilla = 'convocatoria_cafe_hub';
          break;
        case 'RETIRO_FICHAS':
          categoriaCorte = '4. Retiro de Fichas Extra (X1/X2/X3 ya firmadas)';
          tipoPlantilla = 'retiro_fichas';
          break;
        case 'DESCARTADO_NO_CABA':
          categoriaCorte = '6. Sin DNI en CABA (Consultar referidos CABA)';
          tipoPlantilla = 'no_caba_referidos';
          break;
        default:
          categoriaCorte = '3. Seguimiento Activo';
          tipoPlantilla = 'seguimiento_cambio_chip';
      }
    }

    const optCafeCola = resolverOpcionesCafeContacto(contact);
    const gen = generarMensajeContextual(contact, profile, tipoPlantilla, optCafeCola);
    const mensajePersonalizado = contact.alertaVencido?.activa
      ? contact.alertaVencido.mensajeDisculpasReprogramacion
      : contact.situacion === 'PREFIERE_PUNTO' ||
        contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
      ? gen.texto
      : contact.diagnostico48h?.aplica
      ? contact.diagnostico48h.mensajePersonalizado48h
      : gen.texto;

    return {
      contact,
      categoriaCorte,
      razonRecomendacion: contact.motivoEstrategico,
      tipoPlantilla: gen.tipoUsado,
      mensajePersonalizado,
      enviado: Boolean(contact.enviadoEnSesion),
    };
  });

  // REGLA FIN DEL DÍA:
  // Una vez terminado el día operativo de HOY (>= 20:15 hs, o cuando el bloque de HOY ya terminó y todas sus paradas
  // quedaron con `vencidaSinAdherir`), la planificación de HOY desaparece de `agendaSugeridaDias`.
  // Quedan pendientes en `alertasPendientesVencidos` (y en la cola de reprogramación), en caso de no haberles escrito,
  // todas las personas de HOY que quedaron con "⚠️ Horario vencido sin adherir — Reprogramar".
  const minutosActualesCierre = hoyBA.hour * 60 + hoyBA.minute;
  const agendaSugeridaDiasVigente = agendaSugeridaDias.filter((b) => {
    const esBloqueHoy = b.fechaClave === hoyBA.ddmm || /^HOY\b/i.test(b.diaEtiqueta || '');
    if (!esBloqueHoy) return true;

    const paradasHoy = b.paradasRutaSugerida || [];
    const minFinBloque = horaAMinutosDelDia(b.horaFinCalculada || '20:00');
    const todasParadasVencidas =
      paradasHoy.length > 0 && paradasHoy.every((p) => Boolean(p.vencidaSinAdherir));
    const finDelDiaHoy =
      minutosActualesCierre >= 20 * 60 + 15 ||
      (minutosActualesCierre >= minFinBloque && todasParadasVencidas);

    for (const p of paradasHoy) {
      if (p.vencidaSinAdherir && p.contact.adhirio !== 'Sí' && !p.contact.enviadoEnSesion) {
        if (!p.contact.alertaVencido?.activa) {
          const horaVenc = p.horaPactadaExplicita || p.ventanaColumnaG || `${p.horaLlegada} hs`;
          p.contact.alertaVencido = {
            activa: true,
            tipo: 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION',
            titulo: `⚠️ Horario vencido sin adherir — Reprogramar (${hoyBA.ddmm} · ${horaVenc})`,
            motivo:
              p.motivoVencimiento ||
              `Horario vencido hoy (${hoyBA.ddmm} · ${horaVenc}) en ${p.destinoNombre} sin cambio a "Adhirió: Sí".`,
            fechaVencida: `${hoyBA.ddmm} (${horaVenc})`,
            propuestaReprogramacion: `Reprogramar pasada Puerta a Puerta por ${p.destinoNombre} (${p.contact.barrio}) para mañana ${manianaBA.nombreDia} ${manianaBA.ddmm}${
              p.cafeHubAsignado ? ` o en ${p.cafeHubAsignado.nombre} (${p.cafeHubAsignado.direccion})` : ''
            }`,
            mensajeDisculpasReprogramacion:
              p.mensajeDisculpasVencido || p.mensajeReprogramacionCalendar || p.contact.mensajeSugerido,
          };
        }
        if (!alertasPendientesVencidos.some((a) => a.id === p.contact.id)) {
          alertasPendientesVencidos.push(p.contact);
        }
      }
    }

    if (finDelDiaHoy) {
      return false;
    }
    return true;
  });

  const resumenEjecutivo = `Agenda calculada en vivo (${hoyBA.etiquetaCompleta}) sobre ${filtrados.length} contactos: se descartaron automáticamente los ${adheridosTotales} ya adheridos (Col. F = Sí) y se seleccionaron únicamente las ${elegiblesAgendaConLugar.length} personas pendientes que ya tienen dirección, esquina o punto de encuentro determinado en Google Sheets / Sección 1. Los bloques diarios se organizaron sin superposiciones horarias y se adaptan automáticamente a las confirmaciones 1-a-1 (Café vs Puerta a Puerta).`;

  return {
    timestamp: hoyBA.hhmm,
    fechaHoraActualEtiqueta: hoyBA.etiquetaCompleta,
    totalAnalizados: filtrados.length,
    resumenEjecutivo,
    metricas: {
      nuevosPrimerContacto,
      cambioChipSinConcretar,
      sinRespuestaSeguimiento,
      visitasAgendadas,
      retirosPendientes,
      adheridosTotales,
      alertasVencidasReprogramar: alertasPendientesVencidos.length,
      conPuntoEncuentroDeterminado: elegiblesAgendaConLugar.length,
    },
    alertasPendientesVencidos,
    agendaSugeridaDias: agendaSugeridaDiasVigente,
    recomendacionesBarrio,
    colaMensajes,
  };
}

/**
 * Genera el mensaje personalizado 1-a-1 para consultar y pedir confirmación de la propuesta
 * sugerida en un bloque de la Agenda Recomendada Día por Día, adaptándose dinámicamente
 * a la modalidad elegida/confirmada (encuentro en café, recorrido Puerta a Puerta o reunión de los miércoles en Chile 1408)
 * y garantizando correspondencia 100% con el café sugerido en el bloque y en la Hoja de Ruta en Terreno.
 */
export function generarMensajePropuestaBloqueAgenda(
  contact: Contact,
  bloque: BloqueAgendaRecomendado,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  opcionesOverride?: {
    modalidad?: ModalidadEncuentroAgenda;
    cafeHubNombre?: string;
    cafeHubDireccion?: string;
    franjaHoraria?: string;
  }
): string {
  // Si recién se conversó hoy con la persona, no repetir saludo introductorio formal
  const hoyBA = obtenerPartesFechaHoraBA();
  const yaConversadoHoy =
    contact.ultimoContacto === hoyBA.isoDate ||
    (contact.ultimoMensajeCorteEnviadoAt && contact.ultimoMensajeCorteEnviadoAt.startsWith(hoyBA.isoDate)) ||
    (contact.horasDesdeUltimoContacto !== undefined && contact.horasDesdeUltimoContacto < 12);

  const saludo = yaConversadoHoy
    ? (contact.sinNombre ? 'Te paso la propuesta para organizarnos:' : `${contact.primerNombre}, te paso la propuesta para coordinar:`)
    : (contact.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${contact.primerNombre}, ¿cómo estás?`);

  const comLow = (contact.comentario || '').toLowerCase();
  const esEncuentroSedeChile =
    bloque.modalidad === 'EVENTO_SEDE' ||
    bloque.modalidad === 'ENCUENTRO_SEDE' ||
    bloque.id === 'agenda-sede-chile-1408' ||
    contact.situacion === 'EVENTO_CHILE_1408' ||
    /chile\s*1408|reuni[oó]n\s+de\s+los\s+mi[eé]rcoles|reuni[oó]n\s+del\s+partido/i.test(comLow);
  const declinoCafe =
    comLow.includes('declinó café') ||
    comLow.includes('declino cafe') ||
    comLow.includes('pasa a puerta a puerta');
  const pidioCafe =
    !esEncuentroSedeChile &&
    (contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
      comLow.includes('prefiere punto de encuentro') ||
      comLow.includes('prefiere café hub'));

  const modalidadEfectiva: ModalidadEncuentroAgenda =
    opcionesOverride?.modalidad ||
    bloque.modalidadElegidaUsuario ||
    (esEncuentroSedeChile
      ? 'EVENTO_SEDE'
      : declinoCafe
      ? 'PUERTA_A_PUERTA'
      : pidioCafe
      ? 'CAFE_HUB'
      : bloque.modalidad);

  // Parada calculada en la Hoja de Ruta de este bloque para este vecino
  const paradaVecino = bloque.paradasRutaSugerida?.find((p) => p.contact.id === contact.id);

  // UNIFICACIÓN ESTRICTA DE CAFÉ DEL GRUPO:
  // Sólo se propone café si el bloque agrupa a varias personas contactadas (>= 2) o si se indicó un café explícito
  const cafePrincipalBloque = bloque.cafesHubOpciones?.[0];
  const tieneCafeGrupal =
    Boolean(
      opcionesOverride?.cafeHubNombre ||
        bloque.cafeElegidoUsuario ||
        cafePrincipalBloque ||
        paradaVecino?.cafeHubAsignado
    ) &&
    (bloque.contactosIncluidos.length >= 2 ||
      Boolean(opcionesOverride?.cafeHubNombre || bloque.cafeElegidoUsuario));

  const nombreCafeSeleccionado =
    opcionesOverride?.cafeHubNombre ||
    bloque.cafeElegidoUsuario ||
    cafePrincipalBloque?.nombre ||
    paradaVecino?.cafeHubAsignado?.nombre;

  const direccionCafeSeleccionada =
    opcionesOverride?.cafeHubDireccion ||
    cafePrincipalBloque?.direccion ||
    paradaVecino?.cafeHubAsignado?.direccion;

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: contact.barrio,
      calleOCruce: contact.calleOCruce,
      lat: contact.lat,
      lng: contact.lng,
    },
    profile,
    {
      incluirCafe: tieneCafeGrupal,
      cafeNombre: nombreCafeSeleccionado,
      cafeDireccion: direccionCafeSeleccionada,
      cafeLat: cafePrincipalBloque?.lat,
      cafeLng: cafePrincipalBloque?.lng,
    }
  );

  const dirVecino = contact.calleOCruce || `${contact.barrio}`;

  // Limpiar cualquier metadato interno de la etiqueta de día y franja horaria antes de armar el mensaje para el vecino
  const diaLimpio = (bloque.diaEtiqueta || '')
    .replace(/\s*[—–-]\s*Actualizado[^)]*/gi, '')
    .replace(/\s*\(Recorrido[^)]*\)/gi, '')
    .replace(/\s*\(Confirmación[^)]*\)/gi, '')
    .replace(/\s*·\s*Reunión en Chile 1408/gi, '')
    .trim();

  const franjaLimpia = (opcionesOverride?.franjaHoraria || bloque.franjaHoraria || '')
    .replace(/\s*\(\d+\s*parada[^)]*\)/gi, '')
    .replace(/\s*\(Mesa\s*Caf[eé]\s*HUB[^)]*\)/gi, '')
    .replace(/\s*\(Encuentro\s*en\s*caf[eé][^)]*\)/gi, '')
    .replace(/\s*\(Sede[^)]*\)/gi, '')
    .trim();

  // Si es Puerta a Puerta y tenemos la parada calculada para este vecino, ofrecer su horario conveniente calculado según la agenda del día
  const dispColG = analizarDisponibilidadColumnaG(obtenerTextoHorarioAgendaContacto(contact));
  const detalleHoraPuntual =
    paradaVecino && modalidadEfectiva === 'PUERTA_A_PUERTA'
      ? dispColG.esVentanaAmplia && dispColG.etiquetaVentana
        ? ` alrededor de las *${paradaVecino.horaLlegada} hs* (dentro de tu disponibilidad ${dispColG.etiquetaVentana})`
        : ` cerca de las *${paradaVecino.horaLlegada} hs*`
      : '';

  const notaFichas =
    contact.situacion === 'RETIRO_FICHAS'
      ? ' Además aprovecho para retirar las fichas firmadas que tenés listas.'
      : '';

  const introDisculpas = contact.alertaVencido?.activa
    ? `Te pido disculpas antes que nada porque no pude cumplir con nuestro compromiso anterior para los 2 minutos de tu firma de adhesión. `
    : '';

  const construirPropuesta = (): string => {
    // Si tenía una HORA PUNTUAL RÍGIDA en Columna G que verdaderamente chocó con Google Calendar
    if (paradaVecino?.conflictoCalendar && paradaVecino.mensajeReprogramacionCalendar) {
      if (tieneCafeGrupal) {
        return paradaVecino.mensajeReprogramacionCalendar;
      }
      return paradaVecino.mensajeReprogramacionCalendar
        .replace(/Quería proponerte dos opciones:\s*\n1\.\s*/i, 'Quería proponerte ')
        .replace(/\n2\.\s*O bien encontrarnos unos minutos en el café[^\n]*/i, '')
        .replace(/¿Cuál de las dos te queda mejor\?/i, '¿Te queda bien ese horario?');
    }

    if (
      modalidadEfectiva === 'EVENTO_SEDE' ||
      modalidadEfectiva === 'ENCUENTRO_SEDE' ||
      comLow.includes('chile 1408') ||
      comLow.includes('sede popurrí') ||
      comLow.includes('sede central')
    ) {
      return `${saludo}\n\n${introDisculpas}Te escribo por el encuentro en la sede de *${profile.sedeCentral}* para *${diaLimpio}* (${franjaLimpia}), así charlamos y sumamos tu firma de adhesión en 2 minutos con tu DNI físico de CABA.${notaFichas}\n\n¿Me confirmás si podés acercarte en ese horario o preferís que coordinemos pasar 2 minutos por *${dirVecino}*?`;
    }

    if (
      (modalidadEfectiva === 'CAFE_HUB' ||
        modalidadEfectiva === 'PUNTO_ADHESION' ||
        modalidadEfectiva === 'SEGUIMIENTO_PUNTO_ADHESION') &&
      infoCafe.incluirCafe
    ) {
      return `${saludo}\n\n${introDisculpas}Para *${diaLimpio}* entre las *${franjaLimpia}* voy a estar en ${infoCafe.fraseCafe}, y quería proponerte si te queda cómodo acercarte 2 minutos para firmar la ficha de adhesión en papel (acordate de traer tu DNI físico con domicilio en CABA).${notaFichas}\n\n¿Me confirmás si te viene bien acercarte a *${infoCafe.cafeNombre}* en esa franja? Si no llegás a poder en ese punto, avisame y coordinamos otro horario dentro del recorrido para pasar por tu dirección. Gracias.`;
    }

    // Modalidad PUERTA_A_PUERTA
    return infoCafe.incluirCafe
      ? `${saludo}\n\n${introDisculpas}Estoy organizando el recorrido por *${contact.barrio}* para *${diaLimpio}*${
          detalleHoraPuntual || ` en la franja de *${franjaLimpia}*`
        }, y quería proponerte pasar 2 minutos por *${dirVecino}* para ${
          contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
            ? 'retirar las fichas firmadas'
            : 'firmar la ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano)'
        }.\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en ese horario, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.`
      : `${saludo}\n\n${introDisculpas}Estoy organizando el recorrido por *${contact.barrio}* para *${diaLimpio}*${
          detalleHoraPuntual || ` en la franja de *${franjaLimpia}*`
        }, y quería proponerte pasar 2 minutos por *${dirVecino}* para ${
          contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
            ? 'retirar las fichas firmadas'
            : 'firmar la ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano)'
        }.\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en ese horario? Gracias.`;
  };

  return aplicarReglaSaludoMismoDia(construirPropuesta(), contact, 'AUTO_MISMO_DIA');
}

/**
 * Genera el mensaje personalizado 1-a-1 desde la pestaña "3. Mapa Pendientes" (Circuitos y Puntos Céntricos),
 * adaptándose automáticamente al café elegido de la lista de Google Maps, a la fecha contenida en la Columna "G"
 * y a la recomendación de la Agenda Día por Día, sin repetir quién es el remitente ni hablar de "Café HUB" como evento.
 */
export function generarMensajePersonalizadoCircuitoMapa(
  contact: Contact,
  cluster: MicroCluster,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  opciones?: {
    modalidad?: ModalidadEncuentroAgenda;
    cafeSeleccionado?: { nombre: string; direccion: string };
    fechaPropuesta?: string;
    franjaPropuesta?: string;
  }
): string {
  const saludo = contact.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${contact.primerNombre}, ¿cómo estás?`;
  const agrupaVariasPersonas =
    cluster.miembros.length >= 2 || Boolean(opciones?.cafeSeleccionado);

  const modalidad: ModalidadEncuentroAgenda =
    opciones?.modalidad ||
    cluster.modalidadRecomendadaAgenda ||
    (cluster.convieneCafeHub && agrupaVariasPersonas ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');

  const cafePrincipalCluster = cluster.cafesHubCercanos?.[0];
  const cafeNombre =
    opciones?.cafeSeleccionado?.nombre ||
    cafePrincipalCluster?.nombre ||
    cluster.cafeRecomendado;
  const cafeDir =
    opciones?.cafeSeleccionado?.direccion ||
    cafePrincipalCluster?.direccion ||
    cluster.esquinaCentrica;

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: contact.barrio,
      calleOCruce: contact.calleOCruce,
      lat: contact.lat,
      lng: contact.lng,
    },
    profile,
    {
      incluirCafe: agrupaVariasPersonas,
      cafeNombre,
      cafeDireccion: cafeDir,
      cafeLat: cafePrincipalCluster?.lat,
      cafeLng: cafePrincipalCluster?.lng,
    }
  );

  const fechaTexto =
    opciones?.fechaPropuesta ||
    contact.fechasMencionadas[0] ||
    cluster.fechasAgrupadas?.[0] ||
    'estos próximos días';
  const franjaTexto =
    opciones?.franjaPropuesta ||
    (contact.franjaHoraria !== 'Flexible'
      ? `por la ${contact.franjaHoraria.toLowerCase()}`
      : 'entre las 15:00 y las 19:00 hs');
  const dirVecino = contact.calleOCruce || `tu domicilio en ${contact.barrio}`;
  const notaFichas =
    contact.situacion === 'RETIRO_FICHAS'
      ? ' Además aprovecho para retirar las fichas extras.'
      : '';

  const construirMsgMapa = (): string => {
    if (modalidad === 'EVENTO_SEDE' || modalidad === 'ENCUENTRO_SEDE') {
      return `${saludo}\n\nTe escribo por la reunión de los miércoles en la sede de *${profile.sedeCentral}* (${fechaTexto} · ${franjaTexto}) así compartimos un rato y firmás tu ficha de adhesión en papel con tu DNI físico de CABA.${notaFichas}\n\n¿Te viene bien acercarte el miércoles a Chile 1408 o preferís que coordinemos por *${contact.barrio}*?`;
    }

    if (modalidad === 'PUERTA_A_PUERTA' || !infoCafe.incluirCafe) {
      return infoCafe.incluirCafe
        ? `${saludo}\n\nSiguiendo lo que conversamos (${fechaTexto}), estoy armando el recorrido por *${contact.barrio}* (${franjaTexto}) para pasar 2 minutos por *${dirVecino}* y que firmemos tu ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en esa franja, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.`
        : `${saludo}\n\nSiguiendo lo que conversamos (${fechaTexto}), estoy armando el recorrido por *${contact.barrio}* (${franjaTexto}) para pasar 2 minutos por *${dirVecino}* y que firmemos tu ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en esa franja? Gracias.`;
    }

    return `${saludo}\n\nPara *${fechaTexto}* (${franjaTexto}) voy a estar en ${infoCafe.fraseCafe}, y quería proponerte encontrarnos 2 minutos ahí para recibir tu firma de adhesión en papel (acordate de traer tu DNI físico con domicilio en CABA).${notaFichas}\n\n¿Me confirmás si te queda cómodo acercarte a *${infoCafe.cafeNombre}* en esa franja? Si no podés acercarte al café, avisame y coordinamos otro horario dentro de la planificación para pasar por tu dirección. Gracias.`;
  };

  return aplicarReglaSaludoMismoDia(construirMsgMapa(), contact, 'AUTO_MISMO_DIA');
}


/**
 * Devuelve una fecha sugerida vigente (DD/MM) para confirmar o reprogramar un encuentro:
 * - Si el contacto tiene una fecha futura en `fechasMencionadas`, la prioriza.
 * - Si `fallbackFecha` es futura (o es hoy y el contacto NO está vencido), la usa.
 * - Si la fecha anterior ya venció (ej. 21/10 vencido), sugiere automáticamente mañana (ej. 22/10).
 */

export function aplicarRespuestaPropuestaAgenda(
  raw: RawContactRow,
  bloque: BloqueAgendaRecomendado,
  respuesta: TipoRespuestaPropuestaAgenda,
  opciones?: {
    nuevaDireccion?: string;
    nuevaFecha?: string;
    nuevaFranja?: FranjaHoraria;
    nuevoHorarioPuntual?: string;
    nuevaModalidad?: 'PUERTA_A_PUERTA' | 'CAFE_HUB';
    nuevoCafe?: string;
    notaAdicional?: string;
    confirmarEncuentro?: boolean;
    mantenerComentarioInterno?: boolean;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): RawContactRow {
  const calleExistente = (raw.calleOCruce || '').trim() || extraerCalleOCruce(raw.comentario);
  const direccionEfectiva =
    opciones?.nuevaDireccion?.trim() ||
    calleExistente ||
    `Domicilio en ${raw.barrio || 'CABA'}`;

  const hoyBA = obtenerPartesFechaHoraBA();
  const manianaBA = sumarDiasAFechaBA(Date.now(), 1);
  const fechaCandidata = opciones?.nuevaFecha?.trim() || bloque.fechaClave || manianaBA.ddmm;
  // Si no se pasó nuevaFecha explícita y la fecha del bloque ya quedó en el pasado, usar mañana por defecto
  const fechaEfectiva =
    !opciones?.nuevaFecha?.trim() &&
    /^\d{1,2}\/\d{1,2}$/.test(fechaCandidata) &&
    compararFechaDDMMConHoyBA(fechaCandidata, hoyBA) < 0
      ? manianaBA.ddmm
      : fechaCandidata;

  const franjaEfectiva = opciones?.nuevaFranja || analizarFranjaHoraria(obtenerTextoHorarioAgendaContacto(raw));
  const horarioPuntualLimpio = opciones?.nuevoHorarioPuntual?.trim() || '';
  const notaExtra = opciones?.notaAdicional?.trim() ? ` · ${opciones.notaAdicional.trim()}` : '';

  // Traducir la franja elegida a una expresión clara para que analizarFranjaHoraria y analizarDisponibilidadColumnaG la detecten
  const etiquetaFranjaElegida = (franja?: FranjaHoraria): string => {
    switch (franja) {
      case 'Mañana':
        return 'por la mañana (9 a 12:30)';
      case 'Mediodía':
        return 'al mediodía (12:30 a 15)';
      case 'Tarde':
        return 'por la tarde (15 a 18)';
      case 'Vespertino':
        return 'después de las 18:00';
      case 'Fin de Semana':
        return 'el fin de semana';
      default:
        return '';
    }
  };

  const textoTurnoElegido = horarioPuntualLimpio
    ? `a las ${horarioPuntualLimpio.replace(/\s*hs$/i, '')} hs`
    : opciones?.nuevaFranja && opciones.nuevaFranja !== 'Sin definir'
    ? etiquetaFranjaElegida(opciones.nuevaFranja)
    : '';

  // Preservar cualquier franja horaria amplia original si el usuario no eligió una nueva franja/hora
  const dispOrig = analizarDisponibilidadColumnaG(obtenerTextoHorarioAgendaContacto(raw));

  // Café HUB unificado del bloque (fuente única de verdad entre Pestaña 2 y Pestaña 3)
  const cafePrincipalBloque = bloque.cafesHubOpciones?.[0];
  const cafeUnificadoTexto =
    opciones?.nuevoCafe?.trim() ||
    bloque.cafeElegidoUsuario ||
    (cafePrincipalBloque
      ? `${cafePrincipalBloque.nombre} (${cafePrincipalBloque.direccion.split(',')[0]})`
      : profile.cafesPorBarrio[raw.barrio]?.nombre || bloque.puntoEncuentroODireccion);

  // Limpiar fechas antiguas vencidas cuando se consolida o reprograma una nueva fecha
  const comentarioSinFechasViejas = (raw.comentario || '')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, '')
    .replace(/\[Confirmado[^\]]*\]/gi, '')
    .replace(/\[Reprogramado[^\]]*\]/gi, '')
    .replace(/\[Pasó a Puerta a Puerta[^\]]*\]/gi, '')
    .replace(/\[Declinó Café[^\]]*\]/gi, '')
    .replace(/\[Pasó a Café Hub[^\]]*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const paradaVecino = bloque.paradasRutaSugerida?.find((p) => p.contact.id === raw.id);
  const resolverHoraPuntualConfirmada = () => {
    if (textoTurnoElegido) return textoTurnoElegido;
    if (dispOrig.horaPuntualPactada && !dispOrig.esVentanaAmplia) {
      return `a las ${dispOrig.horaPuntualPactada} hs`;
    }
    if (paradaVecino?.horaLlegada) {
      return `a las ${paradaVecino.horaLlegada} hs`;
    }
    if (bloque.horaInicioCalculada) {
      return `a las ${bloque.horaInicioCalculada} hs`;
    }
    return `${bloque.franjaHoraria}`;
  };

  const horaEstructuradaConfirmada =
    horarioPuntualLimpio.replace(/\s*hs$/i, '') ||
    (dispOrig.horaPuntualPactada && !dispOrig.esVentanaAmplia ? dispOrig.horaPuntualPactada : '') ||
    paradaVecino?.horaLlegada ||
    bloque.horaInicioCalculada ||
    raw.horarioEncuentro ||
    '';

  const esRetiroFichas = raw.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS';

  const limpiarAutoConfirmacionDeComentario = (com?: string): string => {
    if (!com) return '';
    return com
      .replace(/Visita confirmada Puerta a Puerta en [^\n·]+/gi, '')
      .replace(/Encuentro confirmado en Caf[eé] Hub [^\n·]+/gi, '')
      .replace(/Visita reprogramada para el [^\n·]+/gi, '')
      .replace(/\[Confirmado 1-a-1[^\]]*\]/gi, '')
      .replace(/^\s*[·—-]\s*|\s*[·—-]\s*$/g, '')
      .trim();
  };

  const comentarioInternoBase = limpiarAutoConfirmacionDeComentario(raw.comentario);

  switch (respuesta) {
    case 'CONFIRMO_PROPUESTA': {
      const modalidadEfectiva =
        opciones?.nuevaModalidad ||
        (bloque.modalidad === 'PUERTA_A_PUERTA' ? 'PUERTA_A_PUERTA' : 'CAFE_HUB');
      const horarioIndividualConfirmado = resolverHoraPuntualConfirmada();
      const tagCafeInterno =
        modalidadEfectiva === 'CAFE_HUB' ? `[Confirmado 1-a-1 · Café Hub: ${cafeUnificadoTexto}]` : '';
      const nuevoComentario = opciones?.mantenerComentarioInterno
        ? [comentarioInternoBase, opciones?.notaAdicional, tagCafeInterno].filter(Boolean).join(' · ')
        : modalidadEfectiva === 'PUERTA_A_PUERTA'
        ? `Visita confirmada Puerta a Puerta en ${direccionEfectiva} (el ${fechaEfectiva} ${horarioIndividualConfirmado}) [Confirmado 1-a-1 · Puerta a Puerta]${notaExtra}`
        : `Encuentro confirmado en Café Hub ${cafeUnificadoTexto} el ${fechaEfectiva} ${horarioIndividualConfirmado} (${direccionEfectiva}) [Confirmado 1-a-1 · Café Hub: ${cafeUnificadoTexto}]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: esRetiroFichas ? 'Sí' : 'Pendiente',
        calleOCruce: direccionEfectiva,
        diasEncuentro: fechaEfectiva,
        horaInicio: horaEstructuradaConfirmada,
        horaFin: '',
        horarioEncuentro: horaEstructuradaConfirmada,
        retiroConfirmado: esRetiroFichas ? true : raw.retiroConfirmado,
        estadoFlujo: esRetiroFichas ? 'PENDIENTE_RETIRO_FICHAS' : 'ENCUENTRO_CONFIRMADO',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA': {
      // La persona declinó ir al Café HUB y confirmó que pasemos Puerta a Puerta por su domicilio/esquina
      const franjaTxt = resolverHoraPuntualConfirmada();
      const nuevoComentario = opciones?.mantenerComentarioInterno
        ? [comentarioInternoBase, opciones?.notaAdicional].filter(Boolean).join(' · ')
        : `Visita confirmada Puerta a Puerta en ${direccionEfectiva} (el ${fechaEfectiva} ${franjaTxt}) [Confirmado 1-a-1 · Declinó Café Hub -> Pasa a Puerta a Puerta]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: esRetiroFichas ? 'Sí' : 'Pendiente',
        calleOCruce: direccionEfectiva,
        diasEncuentro: fechaEfectiva,
        horaInicio: horaEstructuradaConfirmada,
        horaFin: '',
        horarioEncuentro: horaEstructuradaConfirmada,
        retiroConfirmado: esRetiroFichas ? true : raw.retiroConfirmado,
        estadoFlujo: esRetiroFichas ? 'PENDIENTE_RETIRO_FICHAS' : 'ENCUENTRO_CONFIRMADO',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'PASA_A_CAFE_HUB': {
      const turnoCafeTxt = resolverHoraPuntualConfirmada();
      const cafeDestino =
        opciones?.nuevoCafe?.trim() ||
        (opciones?.nuevaDireccion?.trim() &&
        /caf[eé]|bar|havanna|starbucks|martinez|bonafide/i.test(opciones.nuevaDireccion)
          ? opciones.nuevaDireccion.trim()
          : cafeUnificadoTexto);
      const nuevoComentario = opciones?.mantenerComentarioInterno
        ? [
            comentarioInternoBase,
            opciones?.notaAdicional,
            `[Confirmado 1-a-1 · Café Hub: ${cafeDestino}]`,
          ]
            .filter(Boolean)
            .join(' · ')
        : `Encuentro confirmado en Café Hub ${cafeDestino} el ${fechaEfectiva} ${turnoCafeTxt} (${direccionEfectiva}) [Confirmado 1-a-1 · Café Hub: ${cafeDestino}]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: esRetiroFichas ? 'Sí' : 'Pendiente',
        calleOCruce: direccionEfectiva,
        diasEncuentro: fechaEfectiva,
        horaInicio: horaEstructuradaConfirmada,
        horaFin: '',
        horarioEncuentro: horaEstructuradaConfirmada,
        retiroConfirmado: esRetiroFichas ? true : raw.retiroConfirmado,
        estadoFlujo: esRetiroFichas ? 'PENDIENTE_RETIRO_FICHAS' : 'ENCUENTRO_CONFIRMADO',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'REPROGRAMAR_DIA_HORA': {
      const yaEstabaConfirmado =
        raw.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
        raw.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
        (esRetiroFichas && Boolean(raw.retiroConfirmado)) ||
        /\[Confirmad|Visita confirmada/i.test(raw.comentario || '');
      const quedaConfirmado = Boolean(opciones?.confirmarEncuentro || yaEstabaConfirmado);
      const modalidadEfectiva =
        opciones?.nuevaModalidad ||
        (/caf[eé]\s*hub/i.test(raw.comentario || '') ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
      const cafeDestinoReprog =
        opciones?.nuevoCafe?.trim() || cafeUnificadoTexto;
      const franjaTxt =
        textoTurnoElegido ||
        (quedaConfirmado ? resolverHoraPuntualConfirmada() : '') ||
        etiquetaFranjaElegida(franjaEfectiva) ||
        'entre 15:30 y 18';

      if (quedaConfirmado) {
        const tagCafeConfirmado =
          modalidadEfectiva === 'CAFE_HUB'
            ? `[Confirmado 1-a-1 · Café Hub: ${cafeDestinoReprog}]`
            : '';
        const nuevoComentarioConfirmado = opciones?.mantenerComentarioInterno
          ? [comentarioInternoBase, opciones?.notaAdicional, tagCafeConfirmado]
              .filter(Boolean)
              .join(' · ')
          : modalidadEfectiva === 'CAFE_HUB'
          ? `Encuentro confirmado en Café Hub ${cafeDestinoReprog} el ${fechaEfectiva} ${franjaTxt} (${direccionEfectiva}) [Confirmado 1-a-1 · Café Hub: ${cafeDestinoReprog}]${notaExtra}`
          : `Visita confirmada Puerta a Puerta en ${direccionEfectiva} (el ${fechaEfectiva} ${franjaTxt}) [Confirmado 1-a-1 · Puerta a Puerta]${notaExtra}`;
        return actualizarDatosContactoEnApp(raw, {
          rsp: 'Sí',
          adhirio: esRetiroFichas ? 'Sí' : 'Pendiente',
          calleOCruce: direccionEfectiva,
          diasEncuentro: fechaEfectiva,
          horaInicio: horaEstructuradaConfirmada,
          horaFin: '',
          horarioEncuentro: horaEstructuradaConfirmada,
          retiroConfirmado: esRetiroFichas ? true : raw.retiroConfirmado,
          estadoFlujo: esRetiroFichas ? 'PENDIENTE_RETIRO_FICHAS' : 'ENCUENTRO_CONFIRMADO',
          comentario: nuevoComentarioConfirmado,
        }).actualizado;
      }

      const baseLugar = direccionEfectiva ? `(${direccionEfectiva})` : '';
      const nuevoComentario = opciones?.mantenerComentarioInterno
        ? [comentarioInternoBase, opciones?.notaAdicional].filter(Boolean).join(' · ')
        : `Visita reprogramada para el ${fechaEfectiva} ${franjaTxt} ${baseLugar}${
            comentarioSinFechasViejas && !comentarioSinFechasViejas.includes(direccionEfectiva)
              ? ` — ${comentarioSinFechasViejas}`
              : ''
          }${notaExtra}`.trim();
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: esRetiroFichas ? 'Sí' : 'Pendiente',
        calleOCruce: direccionEfectiva,
        diasEncuentro: fechaEfectiva,
        horaInicio: horarioPuntualLimpio.replace(/\s*hs$/i, '') || raw.horaInicio,
        horaFin: horarioPuntualLimpio ? '' : raw.horaFin,
        horarioEncuentro: horarioPuntualLimpio.replace(/\s*hs$/i, '') || etiquetaFranjaElegida(franjaEfectiva) || raw.horarioEncuentro,
        retiroConfirmado: esRetiroFichas ? false : raw.retiroConfirmado,
        estadoFlujo: esRetiroFichas ? 'PENDIENTE_RETIRO_FICHAS' : 'PASO_DATOS_FALTA_CONFIRMAR',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'YA_ADHIRIO': {
      const nuevoComentario = opciones?.mantenerComentarioInterno
        ? [raw.comentario, opciones?.notaAdicional].filter(Boolean).join(' · ')
        : `${raw.comentario ? raw.comentario + ' · ' : ''}[Adhesión firmada OK]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Sí',
        retiroConfirmado: false,
        estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'POSTERGO_O_BAJA':
    default: {
      const esBaja = /baja|no quiere|descartar/i.test(opciones?.notaAdicional || '');
      const nuevoComentario = opciones?.mantenerComentarioInterno
        ? [raw.comentario, opciones?.notaAdicional].filter(Boolean).join(' · ')
        : `${raw.comentario ? raw.comentario + ' · ' : ''}[${
            esBaja ? 'Solicitó baja' : 'Postergó para más adelante'
          }${notaExtra}]`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: esBaja ? 'No' : 'Pendiente',
        estadoFlujo: esBaja ? 'DESCARTADO_O_BAJA' : 'POSTERGO_SALUD_O_VIAJE',
        comentario: nuevoComentario,
      }).actualizado;
    }
  }
}

export interface ValidacionDireccionHorarioResult {
  direccionReconocidaEnCABA: boolean;
  barrioInferido: string | null;
  barrioDifiereDelActual: boolean;
  advertenciaDireccion?: string;
  advertenciasHorario: string[];
  sugerenciaAlternativa?: string;
}

/**
 * Valida en vivo cuando se ingresa o modifica una dirección o un horario en un contacto:
 * 1) Verifica si la dirección pertenece a CABA e infiere su barrio real.
 * 2) Verifica si el día y horario ingresados se superponen con algún evento de Google Calendar
 *    o con la visita de otro vecino agendado ese mismo día, contemplando los tiempos reales de traslado.
 */
export function validarDireccionYHorarioContacto(
  contact: { id: string; nombre: string; barrio: string; lat?: number; lng?: number },
  calleOCruceInput: string,
  comentarioInput: string,
  todosLosContactos: Contact[] = [],
  calendarEvents: CalendarEventItem[] = [],
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now()
): ValidacionDireccionHorarioResult {
  const dirEfectiva = (calleOCruceInput || '').trim() || extraerCalleOCruce(comentarioInput || '');
  const direccionReconocidaEnCABA = dirEfectiva ? esDireccionReconocidaEnCABA(dirEfectiva) : true;
  const barrioInferido = dirEfectiva
    ? inferirBarrioDesdeDireccionOComentario(dirEfectiva, `${dirEfectiva} ${comentarioInput || ''}`)
    : null;
  const barrioActual = (contact.barrio || 'Palermo').trim();
  const barrioDifiereDelActual = Boolean(
    barrioInferido && barrioInferido.toLowerCase() !== barrioActual.toLowerCase()
  );

  let advertenciaDireccion: string | undefined;
  if (dirEfectiva && !direccionReconocidaEnCABA) {
    advertenciaDireccion = `⚠️ La dirección "${dirEfectiva}" no se reconoce como calle/altura o esquina válida de CABA (o pertenece a Provincia/GBA). Verificala o usá "Sin DNI CABA" si vive fuera de Capital.`;
  } else if (barrioDifiereDelActual && barrioInferido) {
    advertenciaDireccion = `📍 Según la dirección "${dirEfectiva}", el barrio real en CABA es ${barrioInferido} (actualmente figura ${barrioActual}). Se actualizará automáticamente al guardar.`;
  }

  const advertenciasHorario: string[] = [];
  let sugerenciaAlternativa: string | undefined;

  const textoCombinado = `${dirEfectiva ? `(${dirEfectiva}) ` : ''}${comentarioInput || ''}`.trim();
  const disp = analizarDisponibilidadColumnaG(textoCombinado);
  const fechas = extraerFechasMencionadas(textoCombinado);
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const fechaEval = fechas[0] || (disp.horaPuntualPactada ? hoyBA.ddmm : undefined);

  const barrioGeo = barrioInferido || barrioActual || 'Palermo';
  const geo = dirEfectiva
    ? geocodificarContactoLocal(dirEfectiva, barrioGeo, contact.id)
    : { lat: contact.lat || -34.588, lng: contact.lng || -58.425, exacta: false };

  const minIni = disp.horaPuntualPactada
    ? horaAMinutosDelDia(disp.horaPuntualPactada)
    : disp.minInicioVentana;
  const minFin = disp.horaPuntualPactada
    ? horaAMinutosDelDia(disp.horaPuntualPactada) + 10
    : disp.minFinVentana;

  if (fechaEval && minIni !== undefined && minFin !== undefined && !disp.esVentanaAmplia) {
    // 1. Chequear contra eventos de Google Calendar de esa fecha
    const eventosVigentes = filtrarEventosCalendarVigentes(calendarEvents, ahoraMs);
    for (const ev of eventosVigentes) {
      if (ev.fecha && ev.fecha !== fechaEval) continue;
      const evIni = horaAMinutosDelDia(ev.startTime);
      const evFin = horaAMinutosDelDia(ev.endTime);
      const esVirt = esEventoVirtualCalendar(ev);
      const geoEv = geocodificarEventoCalendar(ev, profile);
      const tieneDirFisica = Boolean(
        ev.location && ev.location.trim() && ev.location.trim().toUpperCase() !== 'CABA'
      );
      const tr = esVirt
        ? { minutos: 0, modo: 'WALKING' as const }
        : tieneDirFisica
        ? calcularMinutosTrasladoCABA(geo.lat, geo.lng, geoEv.lat, geoEv.lng)
        : { minutos: 20, modo: 'TRANSIT' as const };
      const margen = esVirt ? 5 : Math.max(20, tr.minutos);

      if (minIni < evFin + margen && minFin + margen > evIni) {
        const horaLibreSugerida = sumarMinutosAHora(ev.endTime, margen + 5);
        advertenciasHorario.push(
          `⚠️ Superposición con tu evento de Google Calendar "${ev.summary}" (${ev.startTime}-${ev.endTime} hs el ${fechaEval}${
            esVirt ? '' : `, contemplando ~${tr.minutos} min de traslado`
          }).`
        );
        sugerenciaAlternativa = `Sugerencia: coordinar a partir de las ${horaLibreSugerida} hs o proponer el Café HUB del circuito.`;
      }
    }

    // 2. Chequear contra otros vecinos agendados el mismo día
    for (const otro of todosLosContactos) {
      if (otro.id === contact.id || otro.adhirio === 'Sí' || otro.situacion === 'DESCARTADO_NO_CABA') {
        continue;
      }
      const fechaOtro = resolverFechaObjetivoContacto(otro, ahoraMs) || otro.fechasMencionadas[0];
      if (fechaOtro !== fechaEval) continue;
      const dispOtro = analizarDisponibilidadColumnaG(obtenerTextoHorarioAgendaContacto(otro));
      if (dispOtro.esVentanaAmplia) continue;
      const otroIni = dispOtro.horaPuntualPactada
        ? horaAMinutosDelDia(dispOtro.horaPuntualPactada)
        : dispOtro.minInicioVentana;
      if (otroIni === undefined) continue;
      const otroFin = dispOtro.horaPuntualPactada
        ? otroIni + 10
        : dispOtro.minFinVentana ?? otroIni + 10;

      const trVecino = calcularMinutosTrasladoCABA(geo.lat, geo.lng, otro.lat, otro.lng);
      if (minIni < otroFin + trVecino.minutos && minFin + trVecino.minutos > otroIni) {
        const horaPostOtro = sumarMinutosAHora(
          sumarMinutosAHora('00:00', otroFin),
          trVecino.minutos + 5
        );
        advertenciasHorario.push(
          `⚠️ Choque o tiempo insuficiente de traslado (~${trVecino.minutos} min) con la visita de #${otro.id} ${otro.nombreCompletoCorregido} (${sumarMinutosAHora('00:00', otroIni)} hs en ${otro.calleOCruce || otro.barrio}).`
        );
        if (!sugerenciaAlternativa) {
          const cafeCercano = buscarCafeHubMasCercano(geo.lat, geo.lng);
          sugerenciaAlternativa = `Alternativa óptima: pasar por ${
            dirEfectiva || barrioGeo
          } a las ${horaPostOtro} hs${
            cafeCercano ? ` o convocar a ambos en ${cafeCercano.nombre} (${cafeCercano.direccion.split(',')[0]})` : ''
          }.`;
        }
      }
    }
  }

  return {
    direccionReconocidaEnCABA,
    barrioInferido,
    barrioDifiereDelActual,
    advertenciaDireccion,
    advertenciasHorario,
    sugerenciaAlternativa,
  };
}


