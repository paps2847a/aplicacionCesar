import { analizarFranjaHoraria } from '../calendar/availability';
import { extraerCalleOCruce } from '../geo/cabaLocations';
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
import { construirMicroClusters } from './clustering';
import {
  corregirPelonesDiaSemanaEnTexto,
  postProcesarMensajeAntiPelonesYSaludo,
} from '../messaging/greetingsAndTone';
import { extraerPrimerNombre } from '../contacts/nameCorrection';
import { CATALOGO_CAFES_HUB_CABA, buscarCafeHubMasCercano } from '../../data/cafesHubCatalog';
import { procesarContacto, resolverFechaObjetivoContacto, sonHorariosCompatiblesEnCircuito } from '../contacts/contactStatus';
import { calcularResumenKPIsPadron } from '../tasks/dailyTasks';
import { diagnosticarYGenerarMensajeSeguimiento48h, generarMensajeContextual } from '../messaging/messageTemplates';
import { actualizarDatosContactoEnApp } from '../sync/dataMerging';

export function esContactoConfirmadoEnLista1a1(contact: Contact): boolean {
  if (
    contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    contact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
  ) {
    return true;
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
  bufferMinutos: number = 20,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  eventosCalendar: CalendarEventItem[] = [],
  fechaRutaDDMM?: string,
  opcionesRuta?: {
    cafeHubBloque?: { nombre: string; direccion: string; lat?: number; lng?: number };
    modalidadBloque?: ModalidadEncuentroAgenda;
    idsConfirmados1a1?: Set<string>;
    contactosMismoDia?: Contact[];
    ahoraMs?: number;
  }
): ParadaRuta[] {
  // Regla: sólo considerar personas que aún NO han adherido y que tienen dirección o punto en Columna G ("Comentario")
  const paradasNoAdheridas = paradas.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      Boolean((c.calleOCruce && c.calleOCruce.trim().length > 0) || c.tienePuntoEncuentroDeterminado)
  );
  if (paradasNoAdheridas.length === 0) return [];

  const ahoraRefMs = opcionesRuta?.ahoraMs ?? Date.now();
  const hoyBA = obtenerPartesFechaHoraBA(ahoraRefMs);
  const minutosActualesBA = hoyBA.hour * 60 + hoyBA.minute;
  const esRutaDeHoy = !fechaRutaDDMM || fechaRutaDDMM === hoyBA.ddmm;

  const eventosUnicos = deduplicarEventosCalendar(eventosCalendar);
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
  // (si el vecino no tiene calle/altura propia y se reúne en Café HUB o Chile 1408, usa las coordenadas exactas del punto de encuentro)
  const obtenerUbicacionEncuentroContacto = (c: Contact): {
    lat: number;
    lng: number;
    destinoNombre: string;
    destinoDireccionMaps: string;
  } => {
    if (c.calleOCruce && c.calleOCruce.trim().length > 0) {
      const barrioMaps = /chile\s+1408/i.test(c.calleOCruce) ? 'Monserrat' : c.barrio || 'Palermo';
      return {
        lat: c.lat,
        lng: c.lng,
        destinoNombre: `${c.calleOCruce} (${barrioMaps})`,
        destinoDireccionMaps: `${c.calleOCruce}, ${barrioMaps}, CABA, Argentina`,
      };
    }
    if (c.situacion === 'EVENTO_CHILE_1408') {
      return {
        lat: -34.6158,
        lng: -58.3862,
        destinoNombre: 'Chile 1408 (Monserrat)',
        destinoDireccionMaps: 'Chile 1408, Monserrat, CABA, Argentina',
      };
    }
    if (cafeDelBloque && cafeDelBloque.lat !== undefined && cafeDelBloque.lng !== undefined) {
      const dirCortaCafe = cafeDelBloque.direccion.split(',')[0].trim();
      return {
        lat: cafeDelBloque.lat,
        lng: cafeDelBloque.lng,
        destinoNombre: `${cafeDelBloque.nombre} - ${dirCortaCafe} (${c.barrio || barrioModa})`,
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
  const pendientes = [...paradasNoAdheridas];
  const ordenadas: Contact[] = [];
  let actualLat = partidaResuelta.lat;
  let actualLng = partidaResuelta.lng;

  while (pendientes.length > 0) {
    let mejorIdx = 0;
    let menorScore = Infinity;
    for (let i = 0; i < pendientes.length; i++) {
      const cand = pendientes[i];
      const ubiCand = obtenerUbicacionEncuentroContacto(cand);
      const d = distanciaHaversineMetros(actualLat, actualLng, ubiCand.lat, ubiCand.lng);
      const disp = analizarDisponibilidadColumnaG(cand.comentario);
      let refMinutos = 15 * 60;
      let bonusPuntual = 0;
      if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
        refMinutos = horaAMinutosDelDia(disp.horaPuntualPactada);
        bonusPuntual = -500; // Prioridad estricta a quien pactó una hora puntual exacta (ej. Laura 10:00 hs, Felipe 15:00 hs)
      } else if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
        refMinutos = Math.round(disp.minInicioVentana * 0.45 + disp.minFinVentana * 0.55);
      } else if (cand.franjaHoraria === 'Mañana') {
        refMinutos = 10 * 60 + 30;
      } else if (cand.franjaHoraria === 'Mediodía') {
        refMinutos = 13 * 60;
      } else if (cand.franjaHoraria === 'Vespertino') {
        refMinutos = 18 * 60;
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
    let origenNombre = profile.direccionPartida;
    let origenDireccionMaps = partidaResuelta.direccionMaps;
    let origenLat = partidaResuelta.lat;
    let origenLng = partidaResuelta.lng;
    let finVisitaParadaAnteriorMin: number | null = null;

    for (let i = 0; i < secuenciaContactos.length; i++) {
      const c = secuenciaContactos[i];
      const ubiDestino = obtenerUbicacionEncuentroContacto(c);
      const destinoNombre = ubiDestino.destinoNombre;
      const destinoDireccionMaps = ubiDestino.destinoDireccionMaps;
      const destLat = ubiDestino.lat;
      const destLng = ubiDestino.lng;

      const dispColG = analizarDisponibilidadColumnaG(c.comentario);
      const horaPactadaExplicita = dispColG.esVentanaAmplia ? undefined : dispColG.horaPuntualPactada;

      let trasladoActual = calcularMinutosTrasladoCABA(origenLat, origenLng, destLat, destLng);
      let minutosViaje = trasladoActual.minutos;
      let modoTraslado = trasladoActual.modo;

      let horaSalida = cursorHora;
      let notaHorarioConveniente: string | undefined;

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
          const trasladoHaciaEv = esVirtual
            ? { minutos: 0, modo: 'WALKING' as const, distanciaMetros: 0, cuadras: 0 }
            : calcularMinutosTrasladoCABA(stopLat, stopLng, geoEv.lat, geoEv.lng);
          const margenHaciaEv = esVirtual ? 5 : Math.min(25, trasladoHaciaEv.minutos + 2);
          const margenPostEv = esVirtual ? 2 : 0;

          if (iniSalidaMin < evFin + margenPostEv && finVisitaMin + margenHaciaEv > evIni) {
            return { ev, geoEv, trasladoEv: trasladoHaciaEv, evIni, evFin, esVirtual };
          }
        }
        return null;
      };

      const pactadaExactaMin = horaPactadaExplicita ? horaAMinutosDelDia(horaPactadaExplicita) : null;
      const ventanaColGYaVencidaHoy =
        esRutaDeHoy &&
        dispColG.minFinVentana !== undefined &&
        minutosActualesBA >= dispColG.minFinVentana + 5;
      const citaPuntualYaVencidaHoy =
        esRutaDeHoy &&
        ((pactadaExactaMin !== null && minutosActualesBA >= pactadaExactaMin + 5) ||
          ventanaColGYaVencidaHoy);

      // Si es la ruta de HOY y esta parada NO es una cita o ventana ya vencida en el pasado,
      // el promotor no puede salir hacia esta parada antes de la hora actual (`minutosActualesBA`).
      if (
        esRutaDeHoy &&
        !citaPuntualYaVencidaHoy &&
        minutosActualesBA >= 8 * 60 + 30 &&
        minutosActualesBA < 19 * 60 + 30 &&
        horaAMinutosDelDia(horaSalida) < minutosActualesBA
      ) {
        const salidaAhoraMin = Math.ceil(minutosActualesBA / 5) * 5;
        horaSalida = sumarMinutosAHora('00:00', salidaAhoraMin);
      }

      const salidaActualMin = horaAMinutosDelDia(horaSalida);
      const llegadaActualMin = salidaActualMin + minutosViaje;

      // 1. Posicionar inicialmente según hora puntual pactada o inicio de ventana (incluyendo "por la tarde" >= 14:00)
      if (horaPactadaExplicita && pactadaExactaMin !== null) {
        const salidaParaLlegarPuntualMin = Math.max(8 * 60, pactadaExactaMin - minutosViaje);
        if (citaPuntualYaVencidaHoy) {
          horaSalida = sumarMinutosAHora('00:00', salidaParaLlegarPuntualMin);
        } else if (i === 0 && Math.abs(llegadaActualMin - pactadaExactaMin) <= 60) {
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
      }

      // 3. BUCLE ESTRICTO ANTI-CHOQUE CALENDAR:
      // Si el tramo [horaSalida, horaFinVisita] choca con CUALQUIER evento de Google Calendar (ej. Dentista 11:30-13:00,
      // Almuerzo con Frima 13:15-14:15, Terapia 14:30-15:20 o Reunión virtual 16:00-17:00), avanzar iterativamente
      // hasta el primer hueco libre posterior a todos los eventos encadenados.
      const eventosSaltados: CalendarEventItem[] = [];
      let guardIter = 0;
      while (guardIter < 12 && !citaPuntualYaVencidaHoy) {
        guardIter++;
        const salMin = horaAMinutosDelDia(horaSalida);
        const llegMin = salMin + minutosViaje;
        const finMin = llegMin + bufferEfectivo;
        const choque = chequearChoqueTramoConCalendar(salMin, finMin, destLat, destLng);
        if (!choque) break;

        if (!eventosSaltados.some((e) => e.id === choque.ev.id)) {
          eventosSaltados.push(choque.ev);
        }

        const nuevaSalidaMin = choque.evFin + (choque.esVirtual ? 2 : 0);
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
            .map((e) => `"${e.summary}" (${e.startTime}-${e.endTime})`)
            .join(', ');
          notaHorarioConveniente = `Franja amplia en Col. G (${dispColG.etiquetaVentana}): se reubicó automáticamente a las ${horaLlegada} hs para no superponerse con ${resumenEvs}.`;
        } else {
          notaHorarioConveniente = `Dentro de su franja de Col. G (${dispColG.etiquetaVentana}) · Horario conveniente asignado: ${horaLlegada} hs (sin choques con Calendar).`;
        }
      }

      const detalleTransporte =
        trasladoActual.distanciaMetros <= 30
          ? `En el mismo punto de encuentro (${destinoNombre.split(',')[0]})`
          : modoTraslado === 'WALKING'
          ? `A pie (${minutosViaje} min / ${trasladoActual.cuadras} cuadras desde ${origenNombre.split(',')[0]})`
          : `Transporte Público (~${minutosViaje} min desde ${origenNombre.split(',')[0]} hacia ${c.barrio})`;

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
          .map((e) => `"${e.summary}" (${e.startTime}-${e.endTime})`)
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

            const prevDisp = analizarDisponibilidadColumnaG(prevP.contact.comentario);
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

              const dispOtro = analizarDisponibilidadColumnaG(otro.comentario);
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

  return paradasOrdenadasPorHora.map((p, idx) => ({
    ...p,
    orden: idx + 1,
  }));
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

  return corregirPelonesDiaSemanaEnTexto(construirTextoTerreno());
}


export function generarCorteEstrategicoLocal(
  contactsInput: Contact[],
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  filtroBarrio: string = 'Todos',
  eventosCalendarInput: CalendarEventItem[] = INITIAL_CALENDAR_EVENTS,
  ahoraMs: number = Date.now()
): CorteResultado {
  const eventosCalendar = filtrarEventosCalendarVigentes(eventosCalendarInput, ahoraMs);
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);
  const dia2BA = sumarDiasAFechaBA(ahoraMs, 2);
  const dia3BA = sumarDiasAFechaBA(ahoraMs, 3);
  const dia4BA = sumarDiasAFechaBA(ahoraMs, 4);

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
      c.adhirio !== 'Sí' &&
      c.estadoFlujo !== 'YA_ADHIRIO_FIRMA_OK' &&
      c.estadoFlujo !== 'DESCARTADO_O_BAJA' &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      c.situacion !== 'YA_ADHIRIO'
  );

  const elegiblesAgendaConLugar = noAdheridosTotales.filter(
    (c) => c.tienePuntoEncuentroDeterminado
  );

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
  ];

  // Buscador inteligente de ventana horaria DIURNA REALISTA (09:30 a 20:00 hs, jamás de madrugada ni cruzando medianoche)
  // que evita choques con los eventos de Google Calendar de ese día dejando margen de traslado hacia/desde el evento.
  const intervalosOcupadosPorDia: Record<string, { ini: number; fin: number }[]> = {};
  for (const d of diasOperativos) {
    intervalosOcupadosPorDia[d.diaBA.ddmm] = [];
  }

  const encontrarVentanaDiurnaSinChoqueCalendar = (params: {
    diaInfo: (typeof diasOperativos)[number];
    duracionMin: number;
    franjaPreferida: FranjaHoraria;
    latBarrio: number;
    lngBarrio: number;
    ventanaColumnaG?: { minIni: number; minFin: number };
    horaPuntualPreferida?: string;
  }): { horaInicio: string; notaCalendar: string; chocaForzado: boolean } => {
    const {
      diaInfo,
      duracionMin,
      franjaPreferida,
      latBarrio,
      lngBarrio,
      ventanaColumnaG,
      horaPuntualPreferida,
    } = params;
    const { diaBA, esHoy, eventos } = diaInfo;

    const trasladoDesdeBase = calcularMinutosTrasladoCABA(
      profile.latPartida,
      profile.lngPartida,
      latBarrio,
      lngBarrio
    ).minutos;

    const tieneRestriccionMatutinaOPuntual =
      Boolean(horaPuntualPreferida) ||
      Boolean(ventanaColumnaG && ventanaColumnaG.minIni < 14 * 60) ||
      franjaPreferida === 'Mañana' ||
      franjaPreferida === 'Mediodía';

    const minInicioOperativo = tieneRestriccionMatutinaOPuntual
      ? 8 * 60 + 30
      : esHoy && hoyBA.hour >= 9 && hoyBA.hour < 16
      ? Math.min(15 * 60, Math.ceil((hoyBA.hour * 60 + hoyBA.minute + 25) / 15) * 15)
      : 9 * 60 + 30;
    const maxFinOperativo = 20 * 60; // Tope estricto 20:00 hs (nunca de noche ni madrugada)

    // Determinar hora ideal de salida desde la base según hora puntual pactada (descontando traslado), ventana de Columna G o franja horaria
    const horaBasePreferidaMin = horaPuntualPreferida
      ? Math.max(8 * 60 + 15, horaAMinutosDelDia(horaPuntualPreferida) - trasladoDesdeBase)
      : ventanaColumnaG
      ? Math.max(minInicioOperativo, ventanaColumnaG.minIni - Math.min(20, trasladoDesdeBase))
      : franjaPreferida === 'Mañana'
      ? 9 * 60 + 45
      : franjaPreferida === 'Mediodía'
      ? 12 * 60 + 15
      : franjaPreferida === 'Vespertino'
      ? 17 * 60 + 30
      : 15 * 60;

    // Construir grilla completa de candidatos cada 15 min ordenada por cercanía a horaBasePreferidaMin
    // e incluir horaBasePreferidaMin explícitamente para respetar citas puntuales (ej. 10:00 hs -> salida ~09:41 hs)
    const setCandidatos = new Set<number>();
    if (
      horaBasePreferidaMin >= minInicioOperativo &&
      horaBasePreferidaMin <= maxFinOperativo - 35
    ) {
      setCandidatos.add(horaBasePreferidaMin);
    }
    for (let m = minInicioOperativo; m <= maxFinOperativo - 35; m += 15) {
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
          a + duracionMin <= ventanaColumnaG.minFin + 20
            ? 0
            : 1;
        const bEnVentana =
          b + trasladoDesdeBase >= ventanaColumnaG.minIni &&
          b + duracionMin <= ventanaColumnaG.minFin + 20
            ? 0
            : 1;
        if (aEnVentana !== bEnVentana) return aEnVentana - bEnVentana;
      }
      return Math.abs(a - horaBasePreferidaMin) - Math.abs(b - horaBasePreferidaMin);
    });

    const ocupadosAgenda = intervalosOcupadosPorDia[diaBA.ddmm] || [];

    const evaluarCandidato = (iniMin: number, durMinEfectiva: number) => {
      const finMin = iniMin + durMinEfectiva;
      if (finMin > maxFinOperativo + 45) return null;

      // Verificar que NO se solape con ningún otro bloque ya agendado ese mismo día (dejando 15 min de traslado entre bloques)
      const chocaConOtroBloque = ocupadosAgenda.some(
        (b) => iniMin < b.fin + 15 && finMin + 15 > b.ini
      );
      if (chocaConOtroBloque) return null;

      // Verificar que NO choque con ningún evento de Google Calendar de ese día (incluyendo tiempo de traslado)
      for (const ev of eventos) {
        const evIni = horaAMinutosDelDia(ev.startTime);
        const evFin = horaAMinutosDelDia(ev.endTime);
        const esVirt = esEventoVirtualCalendar(ev);
        const geoEv = geocodificarEventoCalendar(ev, profile);
        const trasladoEv = esVirt
          ? { minutos: 0, modo: 'WALKING' as const }
          : calcularMinutosTrasladoCABA(latBarrio, lngBarrio, geoEv.lat, geoEv.lng);
        const margenAntes = esVirt ? 5 : Math.min(25, trasladoEv.minutos + 4);
        const margenDespues = esVirt ? 2 : Math.min(20, trasladoEv.minutos);
        if (iniMin < evFin + margenDespues && finMin + margenAntes > evIni) {
          return null;
        }
      }
      return { iniMin, finMin };
    };

    // Si el circuito tiene una cita puntual pactada (ej. Laura 10:00 hs), evaluar primero si al menos la 1ra parada
    // entra en su horario puntual; el resto de las paradas se adaptarán dinámicamente en calcularHojaDeRuta.
    if (horaPuntualPreferida) {
      const okPuntual = evaluarCandidato(horaBasePreferidaMin, Math.min(duracionMin, 28));
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
      const ok = evaluarCandidato(candMin, duracionMin);
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

    // 1. Seleccionar café de la zona SÓLO cuando el bloque agrupa a varias personas ya contactadas (>= 2)
    const esSede =
      modalidadPreferida === 'EVENTO_SEDE' || modalidadPreferida === 'ENCUENTRO_SEDE';
    const agrupaVariasPersonas = !esSede && contactosGrupo.length >= 2;

    const seleccionCafes = seleccionarCafesHubPorCercaniaYFranja(
      contactosGrupo,
      barrioPrincipal,
      fechaClave,
      profile
    );
    const cafesRanking = agrupaVariasPersonas ? seleccionCafes.cafesRanking : [];
    const franjaCompartidaResumen = seleccionCafes.franjaCompartidaResumen;
    const mediaMinutosMejorCafe = seleccionCafes.mediaMinutosMejorCafe;
    const mejorCafe = cafesRanking[0];
    const nombreMejorCafe = mejorCafe
      ? `${mejorCafe.nombre} (${mejorCafe.direccion.split(',')[0]})`
      : profile.cafesPorBarrio[barrioPrincipal]?.nombre || `Café de ${barrioPrincipal}`;

    // Si es el encuentro de los miércoles en Chile 1408, no tratar el propio evento "Hagamos Popurrí (Chile 1408)" como choque
    const eventosParaCalculoRuta = esSede
      ? eventosDelDia.filter(
          (ev) => !/chile\s*1408|hagamos\s*popurr[ií]/i.test(`${ev.summary || ''} ${ev.location || ''}`)
        )
      : eventosDelDia;

    // 2. Calcular la Hoja de Ruta Casa x Casa REAL para las direcciones de este circuito,
    //    pasando explícitamente el `mejorCafe` del bloque (sólo si agrupa >= 2 personas) y los `contactosMismoDia`
    const bufferPorParada = contactosGrupo.length >= 5 ? 15 : 20;
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

    let horaInicioReal = esSede
      ? '18:30'
      : paradasRutaSugerida[0]?.horaSalida || horaSalidaBase;

    const calcularDuracionActivaRuta = (paradas: ParadaRuta[]) =>
      paradas.length > 0
        ? Math.max(
            25,
            paradas.reduce((acc, p) => acc + p.minutosViaje + p.minutosEncuentro, 0)
          )
        : Math.max(30, contactosGrupo.length * 20);

    const duracionCafeHubMin = Math.max(
      60,
      Math.min(90, 45 + contactosGrupo.length * 10)
    );

    let duracionTotalMinutos = esSede
      ? 120
      : modalidadPreferida === 'PUERTA_A_PUERTA'
      ? calcularDuracionActivaRuta(paradasRutaSugerida)
      : duracionCafeHubMin;

    const calcularFinReal = (iniStr: string, paradas: ParadaRuta[], durMin: number): string =>
      esSede
        ? '20:30'
        : modalidadPreferida === 'PUERTA_A_PUERTA' && paradas.length > 0
        ? paradas[paradas.length - 1].horaFinVisita
        : sumarMinutosAHora(iniStr, durMin);

    let horaFinReal = calcularFinReal(horaInicioReal, paradasRutaSugerida, duracionTotalMinutos);

    // Garantizar que el intervalo real [horaInicioReal, horaFinReal] jamás se superponga con otro bloque del mismo día
    const ocupadosHoy = intervalosOcupadosPorDia[fechaClave] || [];
    const chocaConOcupados = (iniM: number, finM: number) =>
      ocupadosHoy.some((oc) => iniM < oc.fin + 5 && finM + 5 > oc.ini);

    let iniMinReal = horaAMinutosDelDia(horaInicioReal);
    let finMinReal = Math.max(iniMinReal + 25, horaAMinutosDelDia(horaFinReal));

    if (!esSede && chocaConOcupados(iniMinReal, finMinReal)) {
      const basePrefMin = horaAMinutosDelDia(horaSalidaBase);
      const spanNecesario = Math.max(duracionTotalMinutos, finMinReal - iniMinReal);
      const candsOrdenados: number[] = [];
      for (let cand = 8 * 60 + 30; cand <= 20 * 60 + 30; cand += 15) {
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
        const paradasCand = calcularHojaDeRuta(
          contactosGrupo,
          candStr,
          bufferPorParada,
          profile,
          eventosParaCalculoRuta,
          fechaClave,
          opcionesCalculoRuta
        );
        const durCand =
          modalidadPreferida === 'PUERTA_A_PUERTA'
            ? calcularDuracionActivaRuta(paradasCand)
            : duracionCafeHubMin;
        const iniCandStr = paradasCand[0]?.horaSalida || candStr;
        const finCandStr = calcularFinReal(iniCandStr, paradasCand, durCand);
        const iniCandM = horaAMinutosDelDia(iniCandStr);
        const finCandM = Math.max(iniCandM + 25, horaAMinutosDelDia(finCandStr));
        if (!chocaConOcupados(iniCandM, finCandM) && finCandM <= 21 * 60 + 30) {
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
            horaInicioReal = sumarMinutosAHora('00:00', iniMinReal);
            horaFinReal = sumarMinutosAHora('00:00', finMinReal);
            duracionTotalMinutos = finMinReal - iniMinReal;
            break;
          }
        }
      }
    }

    // Registrar el intervalo completo del bloque en este día para que ningún bloque posterior se superponga con él
    if (!intervalosOcupadosPorDia[fechaClave]) {
      intervalosOcupadosPorDia[fechaClave] = [];
    }
    intervalosOcupadosPorDia[fechaClave].push({
      ini: horaAMinutosDelDia(horaInicioReal),
      fin: horaAMinutosDelDia(horaFinReal),
    });

    // Franja horaria limpia para que sea 100% legible y apta para mensajes sin textos internos
    const franjaHorariaLimpia = esSede
      ? '18:30 a 20:30 hs'
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
      ? `Reunión de los miércoles en ${profile.sedeCentral} · 18:30 a 20:30 hs`
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
    if (!gruposPorBarrioRemanentes[b]) gruposPorBarrioRemanentes[b] = [];
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
    fechaExp?: string
  ): CircuitoParaAgendar => {
    const conteoF: Record<string, number> = {};
    let minIniComun: number | undefined;
    let minFinComun: number | undefined;
    let horaPuntual: string | undefined;

    for (const c of miembrosSub) {
      conteoF[c.franjaHoraria] = (conteoF[c.franjaHoraria] || 0) + 1;
      const disp = analizarDisponibilidadColumnaG(c.comentario);
      if (disp.horaPuntualPactada && !disp.esVentanaAmplia) {
        if (
          !horaPuntual ||
          horaAMinutosDelDia(disp.horaPuntualPactada) < horaAMinutosDelDia(horaPuntual)
        ) {
          horaPuntual = disp.horaPuntualPactada;
        }
      } else if (disp.minInicioVentana !== undefined && disp.minFinVentana !== undefined) {
        minIniComun =
          minIniComun === undefined
            ? disp.minInicioVentana
            : Math.max(minIniComun, disp.minInicioVentana);
        minFinComun =
          minFinComun === undefined
            ? disp.minFinVentana
            : Math.min(minFinComun, disp.minFinVentana);
      }
    }
    if (minIniComun !== undefined && minFinComun !== undefined && minIniComun >= minFinComun) {
      minIniComun = undefined;
      minFinComun = undefined;
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

    // Un café sólo se propone como modalidad de bloque cuando agrupa al menos a 2 personas contactadas
    const convieneCafe =
      miembrosSub.length < 2
        ? false
        : modalidadForzada === 'CAFE_HUB'
        ? true
        : modalidadForzada === 'PUERTA_A_PUERTA'
        ? false
        : convieneCafeDefault && miembrosSub.length >= 2;

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
      modalidadAdaptadaPorConfirmacion:
        miembrosSub.length < 2 && modalidadForzada === 'CAFE_HUB'
          ? 'PUERTA_A_PUERTA'
          : modalidadForzada,
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
        comLow.includes('visita puerta a puerta');
      const pidioCafe =
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
        comLow.includes('prefiere punto de encuentro') ||
        comLow.includes('prefiere café hub') ||
        (c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' && comLow.includes('café'));
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
      modalidadForzada?: ModalidadEncuentroAgenda
    ): CircuitoParaAgendar =>
      calcularMetadatosCircuito(
        subId,
        barrio,
        miembrosSub,
        convieneCafeDefault,
        modalidadForzada,
        fechaExp
      );

    const grupoCafeCandidato = [...pidieronCafeHub, ...sinPreferenciaForzada];
    // Sólo separar en un sub-bloque de café si ese sub-bloque agrupa al menos a 2 personas contactadas
    if (
      pidieronPuertaAPuerta.length > 0 &&
      grupoCafeCandidato.length >= 2 &&
      (pidieronCafeHub.length > 0 || sinPreferenciaForzada.length >= 3)
    ) {
      return [
        armarSubCircuito(`${clusterIdBase}-cafe`, grupoCafeCandidato, 'CAFE_HUB'),
        armarSubCircuito(`${clusterIdBase}-pap`, pidieronPuertaAPuerta, 'PUERTA_A_PUERTA'),
      ];
    }

    if (pidieronPuertaAPuerta.length > 0) {
      return [armarSubCircuito(clusterIdBase, contactosOrig, 'PUERTA_A_PUERTA')];
    }

    if (pidieronCafeHub.length > 0 && contactosOrig.length >= 2) {
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
    for (let i = 0; i < listaRem.length; i += 5) {
      const lote = listaRem.slice(i, i + 5);
      const coordsB = COORDENADAS_BARRIOS_CABA[barrioRem] || COORDENADAS_BARRIOS_CABA.Palermo;
      circuitosCrudos.push(
        ...construirCircuitosAdaptadosSegunConfirmacion(
          `cluster-extra-${barrioRem.toLowerCase()}-${i}`,
          barrioRem,
          lote,
          coordsB.lat,
          coordsB.lng,
          lote.length >= 2,
          lote.map((c) => resolverFechaObjetivoContacto(c, ahoraMs)).find(Boolean)
        )
      );
    }
  }

  // CONSOLIDACIÓN ANTI-SUPERPOSICIÓN POR DÍA, BARRIO Y COMPATIBILIDAD HORARIA REAL:
  // 1) Si en un mismo día explícito hay múltiples micro-circuitos del mismo barrio y misma modalidad,
  //    los unificamos si sus ventanas/horas son compatibles.
  // 2) Si un contacto quedó aislado en un circuito de 1 persona y ya existe otro circuito del mismo barrio
  //    compatible en día y horario (< 6 personas), lo sumamos a ese grupo barrial para facilitar la recolección.
  const circuitosParaAgendar: CircuitoParaAgendar[] = [];

  for (const circ of circuitosCrudos) {
    const modCirc = circ.modalidadAdaptadaPorConfirmacion || (circ.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
    const compatibleExistente = circuitosParaAgendar.find((ex) => {
      if (ex.barrio.toLowerCase() !== circ.barrio.toLowerCase()) return false;
      if (ex.miembros.length + circ.miembros.length > 6) return false;

      if (circ.fechaExplicita && ex.fechaExplicita && ex.fechaExplicita !== circ.fechaExplicita) {
        return false;
      }
      if (
        (circ.fechaExplicita === hoyBA.ddmm && ex.fechaExplicita !== hoyBA.ddmm) ||
        (ex.fechaExplicita === hoyBA.ddmm && circ.fechaExplicita !== hoyBA.ddmm)
      ) {
        return false;
      }

      const modEx = ex.modalidadAdaptadaPorConfirmacion || (ex.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
      const esRemanenteIndividual = circ.miembros.length === 1 || ex.miembros.length === 1;
      if (modEx !== modCirc && !esRemanenteIndividual) return false;

      if (circ.fechaExplicita === hoyBA.ddmm && modCirc === 'PUERTA_A_PUERTA' && modEx === 'PUERTA_A_PUERTA') {
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

  // Ordenar circuitos priorizando estrictamente:
  // 1) Fecha explícita de HOY (ej. 21/10) — prioridad absoluta para nunca desplazar citas pautadas para hoy
  // 2) Fecha explícita de MAÑANA (ej. 22/10)
  // 3) Otra fecha explícita de los próximos días operativos (ej. 23/10, 24/10)
  // 4) Alertas de encuentros vencidos de días anteriores a reprogramar
  // 5) Hora puntual pactada más temprana en Columna G y ventana horaria más temprana
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

  circuitosParaAgendar.sort((a, b) => {
    const pa = prioridadFechaCircuito(a);
    const pb = prioridadFechaCircuito(b);
    if (pa !== pb) return pa - pb;
    const minA = minReferenciaOrdenCircuito(a);
    const minB = minReferenciaOrdenCircuito(b);
    const aPuntual = Boolean(a.horaPuntualMasTemprana);
    const bPuntual = Boolean(b.horaPuntualMasTemprana);
    if (Math.abs(minA - minB) <= 45 && aPuntual !== bPuntual) {
      return aPuntual ? -1 : 1;
    }
    if (Math.abs(minA - minB) >= 15) return minA - minB;
    return b.miembros.length - a.miembros.length;
  });

  const agendaSugeridaDias: BloqueAgendaRecomendado[] = [];
  const conteoCircuitosPorDia: Record<string, number> = {};

  // Las reuniones en Chile 1408 son los miércoles (18:30 a 20:30 hs, según Google Calendar "Hagamos Popurrí")
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
      fin: 20 * 60 + 30,
    });
  }

  circuitosParaAgendar.slice(0, 16).forEach((circ, idx) => {
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

    conteoCircuitosPorDia[diaElegido.diaBA.ddmm] =
      (conteoCircuitosPorDia[diaElegido.diaBA.ddmm] || 0) + 1;

    const modalidadCirc: ModalidadEncuentroAgenda =
      circ.modalidadAdaptadaPorConfirmacion ||
      (circ.convieneCafeHub ? 'CAFE_HUB' : 'PUERTA_A_PUERTA');
    const duracionEst =
      modalidadCirc === 'PUERTA_A_PUERTA'
        ? Math.max(35, circ.miembros.length * 22)
        : Math.max(60, Math.min(90, 45 + circ.miembros.length * 10));

    const slot = encontrarVentanaDiurnaSinChoqueCalendar({
      diaInfo: diaElegido,
      duracionMin: duracionEst,
      franjaPreferida: circ.franjaDominante,
      latBarrio: circ.centroLat,
      lngBarrio: circ.centroLng,
      ventanaColumnaG: circ.ventanaColumnaGComun,
      horaPuntualPreferida: circ.horaPuntualMasTemprana,
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
        notaCalendarBase: `Coincide con la reunión de los miércoles en la Sede de Chile 1408 (18:30 a 20:30 hs, evento "Hagamos Popurrí" en Calendar).`,
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
  const saludo = contact.sinNombre ? 'Hola, ¿cómo estás?' : `Hola, ${contact.primerNombre}, ¿cómo estás?`;

  const comLow = (contact.comentario || '').toLowerCase();
  const declinoCafe =
    comLow.includes('declinó café') ||
    comLow.includes('declino cafe') ||
    comLow.includes('pasa a puerta a puerta');
  const pidioCafe =
    contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    comLow.includes('prefiere punto de encuentro') ||
    comLow.includes('prefiere café hub');

  const modalidadEfectiva: ModalidadEncuentroAgenda =
    opcionesOverride?.modalidad ||
    bloque.modalidadElegidaUsuario ||
    (declinoCafe
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
  const dispColG = analizarDisponibilidadColumnaG(contact.comentario);
  const detalleHoraPuntual =
    paradaVecino && modalidadEfectiva === 'PUERTA_A_PUERTA'
      ? dispColG.esVentanaAmplia && dispColG.etiquetaVentana
        ? ` alrededor de las *${paradaVecino.horaLlegada} hs* (dentro de tu disponibilidad ${dispColG.etiquetaVentana})`
        : ` cerca de las *${paradaVecino.horaLlegada} hs*`
      : '';

  const notaFichas =
    contact.situacion === 'RETIRO_FICHAS'
      ? ' Además te llevo las fichas extras en blanco que me pediste para tus contactos de CABA.'
      : '';

  const introDisculpas = contact.alertaVencido?.activa
    ? `Te pido disculpas antes que nada porque no pude cumplir con nuestro compromiso anterior para los 2 minutos de tu firma de adhesión. `
    : '';

  // Si tenía una HORA PUNTUAL RÍGIDA en Columna G que verdaderamente chocó con Google Calendar
  if (paradaVecino?.conflictoCalendar && paradaVecino.mensajeReprogramacionCalendar) {
    return paradaVecino.mensajeReprogramacionCalendar;
  }

  if (modalidadEfectiva === 'EVENTO_SEDE' || modalidadEfectiva === 'ENCUENTRO_SEDE') {
    return `${saludo}\n\n${introDisculpas}Te escribo por la reunión de los miércoles en *${profile.sedeCentral}* para *${diaLimpio}* (${franjaLimpia}), así charlamos y sumamos tu firma de adhesión en 2 minutos con tu DNI físico de CABA.${notaFichas}\n\n¿Me confirmás si podés acercarte el miércoles en ese horario o preferís que coordinemos pasar 2 minutos por *${dirVecino}*?`;
  }

  if (
    (modalidadEfectiva === 'CAFE_HUB' ||
      modalidadEfectiva === 'PUNTO_ADHESION' ||
      modalidadEfectiva === 'SEGUIMIENTO_PUNTO_ADHESION') &&
    infoCafe.incluirCafe
  ) {
    const sugerenciaHorarioDomicilio = paradaVecino?.horaLlegada
      ? ` (por ejemplo pasando cerca de las *${paradaVecino.horaLlegada} hs*)`
      : '';
    return `${saludo}\n\n${introDisculpas}Para *${diaLimpio}* entre las *${franjaLimpia}* voy a estar por *${contact.barrio}* y quería proponerte si te queda cómodo que nos encontremos 2 minutos en ${infoCafe.fraseCafe}, para firmar la ficha de adhesión en papel (acordate de traer tu DNI físico con domicilio en CABA).${notaFichas}\n\n¿Me confirmás si te viene bien pasar por *${infoCafe.cafeNombre}* en esa franja, o preferís que pase 2 minutos por *${dirVecino}*${sugerenciaHorarioDomicilio}? Gracias.`;
  }

  // Modalidad PUERTA_A_PUERTA: propone el horario conveniente según la agenda del día en orden cronológico,
  // y sólo menciona el café alternativo si el bloque agrupa a varias personas ya contactadas (>= 2)
  return infoCafe.incluirCafe
    ? `${saludo}\n\n${introDisculpas}Estoy organizando el recorrido por *${contact.barrio}* para *${diaLimpio}*${
        detalleHoraPuntual || ` en la franja de *${franjaLimpia}*`
      }, y quería proponerte pasar 2 minutos por *${dirVecino}* para firmar la ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en ese horario, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.`
    : `${saludo}\n\n${introDisculpas}Estoy organizando el recorrido por *${contact.barrio}* para *${diaLimpio}*${
        detalleHoraPuntual || ` en la franja de *${franjaLimpia}*`
      }, y quería proponerte pasar 2 minutos por *${dirVecino}* para firmar la ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en ese horario? Gracias.`;
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
      ? ' Además te llevo las fichas extras que me pediste.'
      : '';

  if (modalidad === 'EVENTO_SEDE' || modalidad === 'ENCUENTRO_SEDE') {
    return `${saludo}\n\nTe escribo por la reunión de los miércoles en la sede de *${profile.sedeCentral}* (${fechaTexto} · ${franjaTexto}) así compartimos un rato y firmás tu ficha de adhesión en papel con tu DNI físico de CABA.${notaFichas}\n\n¿Te viene bien acercarte el miércoles a Chile 1408 o preferís que coordinemos por *${contact.barrio}*?`;
  }

  if (modalidad === 'PUERTA_A_PUERTA' || !infoCafe.incluirCafe) {
    return infoCafe.incluirCafe
      ? `${saludo}\n\nSiguiendo lo que conversamos (${fechaTexto}), estoy armando el recorrido por *${contact.barrio}* (${franjaTexto}) para pasar 2 minutos por *${dirVecino}* y que firmemos tu ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en esa franja, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.`
      : `${saludo}\n\nSiguiendo lo que conversamos (${fechaTexto}), estoy armando el recorrido por *${contact.barrio}* (${franjaTexto}) para pasar 2 minutos por *${dirVecino}* y que firmemos tu ficha de adhesión en papel (acordate de tener el DNI físico de CABA a mano).${notaFichas}\n\n¿Me confirmás si te queda bien que pase por *${dirVecino}* en esa franja? Gracias.`;
  }

  return `${saludo}\n\nPara *${fechaTexto}* (${franjaTexto}) voy a estar por *${contact.barrio}* y quería proponerte pasar o encontrarnos 2 minutos en ${infoCafe.fraseCafe}, para recibir tu firma de adhesión en papel (acordate de traer tu DNI físico con domicilio en CABA).${notaFichas}\n\n¿Me confirmás si te queda cómodo acercarte a *${infoCafe.cafeNombre}* en esa franja, o preferís que pase 2 minutos por *${dirVecino}*? Gracias.`;
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
    notaAdicional?: string;
    confirmarEncuentro?: boolean;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): RawContactRow {
  const calleExistente = extraerCalleOCruce(raw.comentario);
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

  const franjaEfectiva = opciones?.nuevaFranja || analizarFranjaHoraria(raw.comentario);
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

  // Preservar cualquier franja horaria amplia original de Columna G si el usuario no eligió una nueva franja/hora
  const dispOrig = analizarDisponibilidadColumnaG(raw.comentario);
  const ventanaConservada =
    !textoTurnoElegido && dispOrig.esVentanaAmplia && dispOrig.etiquetaVentana
      ? ` ${dispOrig.etiquetaVentana}`
      : '';

  // Café HUB unificado del bloque (fuente única de verdad entre Pestaña 2 y Pestaña 3)
  const cafePrincipalBloque = bloque.cafesHubOpciones?.[0];
  const cafeUnificadoTexto =
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

  switch (respuesta) {
    case 'CONFIRMO_PROPUESTA': {
      const lugarConfirmado =
        opciones?.nuevaDireccion?.trim()
          ? opciones.nuevaDireccion.trim()
          : bloque.modalidad === 'PUERTA_A_PUERTA'
          ? direccionEfectiva
          : cafeUnificadoTexto;
      const paradaVecino = bloque.paradasRutaSugerida?.find((p) => p.contact.id === raw.id);
      const horarioIndividualConfirmado =
        textoTurnoElegido ||
        (dispOrig.horaPuntualPactada
          ? `a las ${dispOrig.horaPuntualPactada} hs`
          : dispOrig.etiquetaVentana
          ? `${dispOrig.etiquetaVentana}`
          : paradaVecino?.horaLlegada && bloque.modalidad === 'PUERTA_A_PUERTA'
          ? `a las ${paradaVecino.horaLlegada} hs`
          : `${bloque.franjaHoraria}`);
      const nuevoComentario = `${lugarConfirmado} (el ${fechaEfectiva} ${horarioIndividualConfirmado}) [Confirmado 1-a-1]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: 'ENCUENTRO_CONFIRMADO',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA': {
      // La persona declinó ir al Café HUB y confirmó que pasemos Puerta a Puerta por su domicilio/esquina
      const franjaTxt =
        textoTurnoElegido ||
        ventanaConservada ||
        `(${bloque.franjaHoraria})`;
      const nuevoComentario = `Visita confirmada Puerta a Puerta el ${fechaEfectiva} ${franjaTxt} (${direccionEfectiva}) [Declinó Café Hub -> Pasa a Puerta a Puerta]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: 'ENCUENTRO_CONFIRMADO',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'PASA_A_CAFE_HUB': {
      const turnoCafeTxt = textoTurnoElegido || `(${bloque.franjaHoraria})`;
      const cafeDestino =
        opciones?.nuevaDireccion?.trim() && /caf[eé]|bar|havanna|starbucks|martinez|bonafide/i.test(opciones.nuevaDireccion)
          ? opciones.nuevaDireccion.trim()
          : cafeUnificadoTexto;
      const nuevoComentario = `Prefiere punto de encuentro Café Hub confirmado el ${fechaEfectiva} ${turnoCafeTxt} (${direccionEfectiva} -> ${cafeDestino}) [Confirmado 1-a-1]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: 'PREFIERE_CAFE_HUB_O_SEDE',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'REPROGRAMAR_DIA_HORA': {
      const franjaTxt =
        textoTurnoElegido ||
        etiquetaFranjaElegida(franjaEfectiva) ||
        'entre 15:30 y 18';
      const baseLugar = direccionEfectiva ? `(${direccionEfectiva})` : '';
      const tagConfirmacion = opciones?.confirmarEncuentro ? ' [Confirmado 1-a-1]' : '';
      const nuevoComentario = `Visita reprogramada para el ${fechaEfectiva} ${franjaTxt} ${baseLugar}${
        comentarioSinFechasViejas && !comentarioSinFechasViejas.includes(direccionEfectiva)
          ? ` — ${comentarioSinFechasViejas}`
          : ''
      }${tagConfirmacion}${notaExtra}`.trim();
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Pendiente',
        estadoFlujo: opciones?.confirmarEncuentro ? 'ENCUENTRO_CONFIRMADO' : 'PASO_DATOS_FALTA_CONFIRMAR',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'YA_ADHIRIO': {
      const nuevoComentario = `${raw.comentario ? raw.comentario + ' · ' : ''}[Adhesión firmada OK]${notaExtra}`;
      return actualizarDatosContactoEnApp(raw, {
        rsp: 'Sí',
        adhirio: 'Sí',
        estadoFlujo: 'YA_ADHIRIO_FIRMA_OK',
        comentario: nuevoComentario,
      }).actualizado;
    }

    case 'POSTERGO_O_BAJA':
    default: {
      const esBaja = /baja|no quiere|descartar/i.test(opciones?.notaAdicional || '');
      const nuevoComentario = `${raw.comentario ? raw.comentario + ' · ' : ''}[${
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

/**
 * Parsea un archivo o feed iCal (.ics) de Google Calendar y extrae con máxima precisión
 * todos los eventos dentro de la ventana operativa (desde 1 día atrás hasta 14 días adelante),
 * incluyendo soporte de eventos recurrentes semanales/diarios (RRULE) y conversión exacta a hora de Buenos Aires.
 */

