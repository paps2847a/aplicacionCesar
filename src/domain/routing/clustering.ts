import { ModalidadEncuentroAgenda } from '../../types';
import { obtenerRangoHorarioEfectivoContacto } from '../contacts/contactStatus';
import {
  Contact,
  MicroCluster,
  VoiceProfile,
} from '../../types';
import {
  COORDENADAS_BARRIOS_CABA,
  COORDENADAS_DIRECCIONES_CABA,
  DEFAULT_VOICE_PROFILE,
} from '../../data/estatusPopurriData';
import {
  distanciaHaversineMetros,
  estimarMinutosCaminandoCABA,
  resolverCoordenadasPartidaPerfil,
  normalizarBarrioCABA,
} from '../geo/cabaLocations';
import { seleccionarCafesHubPorCercaniaYFranja } from '../geo/cafesHub';
import { obtenerPartesFechaHoraBA, sumarDiasAFechaBA } from '../calendar/availability';
import { listarCafesHubCercanos } from '../../data/cafesHubCatalog';
import {
  obtenerTurnoMacroContacto,
  resolverFechaObjetivoContacto,
  sonHorariosCompatiblesEnCircuito,
} from '../contacts/contactStatus';

export function construirMicroClusters(
  contacts: Contact[],
  maxMinutosRadio: number = 15,
  filtroFranja: string = 'Todos',
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now()
): MicroCluster[] {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);

  const candidatos = contacts
    .filter((c) => {
      if (c.situacion === 'DESCARTADO_NO_CABA' || c.situacion === 'YA_ADHIRIO') return false;
      if (c.estadoFlujo === 'DESCARTADO_O_BAJA' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') return false;
      if (c.esCerradoOArchivadoSinDniCaba) return false;
      // Regla estricta 1: sólo personas que aún NO han adherido
      if (c.adhirio === 'Sí') return false;
      // Regla estricta 2: sólo personas que tienen dirección o punto de encuentro cargado en la Columna "G" ("Comentario")
      if (!c.tieneDireccionRealEnComentario || !c.calleOCruce || !c.calleOCruce.trim()) return false;
      if (filtroFranja !== 'Todos' && c.franjaHoraria !== filtroFranja && c.franjaHoraria !== 'Flexible') {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const fa = resolverFechaObjetivoContacto(a, ahoraMs) || '';
      const fb = resolverFechaObjetivoContacto(b, ahoraMs) || '';
      const aEsHoy = fa === hoyBA.ddmm ? 0 : 1;
      const bEsHoy = fb === hoyBA.ddmm ? 0 : 1;
      if (aEsHoy !== bEsHoy) return aEsHoy - bEsHoy;
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      if (fa !== fb) return fa.localeCompare(fb);
      // Dentro de la misma fecha, priorizar quienes tienen hora puntual pactada y horario más temprano
      const ra = obtenerRangoHorarioEfectivoContacto(a);
      const rb = obtenerRangoHorarioEfectivoContacto(b);
      const aTienePuntual = ra.horaPuntualMin !== undefined ? 0 : 1;
      const bTienePuntual = rb.horaPuntualMin !== undefined ? 0 : 1;
      const refA = ra.horaPuntualMin ?? ra.minIni;
      const refB = rb.horaPuntualMin ?? rb.minIni;
      if (Math.abs(refA - refB) <= 60 && aTienePuntual !== bTienePuntual) {
        return aTienePuntual - bTienePuntual;
      }
      if (refA !== refB) return refA - refB;
      return 0;
    });

  const gruposRaw: {
    centroLat: number;
    centroLng: number;
    barrioBase: string;
    miembros: Contact[];
    fechaExplicita?: string;
    turnoGrupo?: 'AM' | 'PM' | 'FLEX';
  }[] = [];

  for (const c of candidatos) {
    const fechaContacto = resolverFechaObjetivoContacto(c, ahoraMs);
    const turnoContacto = obtenerTurnoMacroContacto(c);
    const barrioContacto = normalizarBarrioCABA((c.barrio || 'Palermo').split('/')[0].trim());
    let mejorGrupo: (typeof gruposRaw)[number] | null = null;
    let menorMinutos = Infinity;

    for (const g of gruposRaw) {
      // No superar 6 paradas por circuito para que todo recorrido Puerta a Puerta sea realizable en 45-105 min reales
      if (g.miembros.length >= 6) {
        continue;
      }
      // Nunca mezclar barrios distantes (ej: Palermo con Saavedra) en un mismo circuito
      if (normalizarBarrioCABA(g.barrioBase) !== barrioContacto) {
        continue;
      }
      // Si el contacto tiene fecha explícita y el grupo ya tiene otra fecha explícita distinta, no mezclarlos
      if (fechaContacto && g.fechaExplicita && fechaContacto !== g.fechaExplicita) {
        continue;
      }
      // Si uno tiene fecha de HOY y el otro no tiene fecha, sólo agrupar si comparten el mismo turno
      if (
        (fechaContacto === hoyBA.ddmm && g.fechaExplicita && g.fechaExplicita !== hoyBA.ddmm) ||
        (g.fechaExplicita === hoyBA.ddmm && fechaContacto && fechaContacto !== hoyBA.ddmm)
      ) {
        continue;
      }
      // No mezclar citas estrictas de la Mañana/Mediodía ('AM') con citas estrictas de la Tarde/Noche ('PM')
      // ni ventanas horarias que no tengan intersección real (ej: 10:00 hs o 9-16 hs con 17:30 hs)
      if (
        (turnoContacto !== 'FLEX' &&
          g.turnoGrupo &&
          g.turnoGrupo !== 'FLEX' &&
          turnoContacto !== g.turnoGrupo) ||
        !sonHorariosCompatiblesEnCircuito(g.miembros, c)
      ) {
        continue;
      }

      const est = estimarMinutosCaminandoCABA(c.lat, c.lng, g.centroLat, g.centroLng);
      if (est.minutosCaminando <= maxMinutosRadio && est.minutosCaminando < menorMinutos) {
        const n = g.miembros.length;
        const nuevoLat = (g.centroLat * n + c.lat) / (n + 1);
        const nuevoLng = (g.centroLng * n + c.lng) / (n + 1);
        const todosEntran = g.miembros.every(
          (m) =>
            estimarMinutosCaminandoCABA(m.lat, m.lng, nuevoLat, nuevoLng).minutosCaminando <=
            maxMinutosRadio + 3
        );
        if (todosEntran) {
          menorMinutos = est.minutosCaminando;
          mejorGrupo = g;
        }
      }
    }

    if (mejorGrupo) {
      mejorGrupo.miembros.push(c);
      if (!mejorGrupo.fechaExplicita && fechaContacto) {
        mejorGrupo.fechaExplicita = fechaContacto;
      }
      if ((!mejorGrupo.turnoGrupo || mejorGrupo.turnoGrupo === 'FLEX') && turnoContacto !== 'FLEX') {
        mejorGrupo.turnoGrupo = turnoContacto;
      }
      const n = mejorGrupo.miembros.length;
      mejorGrupo.centroLat = mejorGrupo.miembros.reduce((acc, x) => acc + x.lat, 0) / n;
      mejorGrupo.centroLng = mejorGrupo.miembros.reduce((acc, x) => acc + x.lng, 0) / n;
    } else {
      gruposRaw.push({
        centroLat: c.lat,
        centroLng: c.lng,
        barrioBase: barrioContacto,
        miembros: [c],
        fechaExplicita: fechaContacto,
        turnoGrupo: turnoContacto,
      });
    }
  }

  return gruposRaw
    .sort((a, b) => b.miembros.length - a.miembros.length)
    .map((g, idx) => {
      // Determinar dinámicamente el barrio principal (moda) y todos los barrios que integran el circuito
      const conteoBarrios: Record<string, number> = {};
      for (const m of g.miembros) {
        const b = (m.barrio || 'CABA').trim();
        conteoBarrios[b] = (conteoBarrios[b] || 0) + 1;
      }
      const barriosOrdenados = Object.entries(conteoBarrios)
        .sort((a, b) => b[1] - a[1])
        .map(([b]) => b);
      const barrioPrincipal = barriosOrdenados[0] || 'Palermo';
      const etiquetaCircuito =
        barriosOrdenados.length > 1
          ? `${barriosOrdenados.slice(0, 2).join(' / ')}`
          : barrioPrincipal;

      const cafeHubBarrio = profile.cafesPorBarrio[barrioPrincipal];

      // Buscar los Cafés HUB oficiales de la lista de Google Maps del usuario más cercanos al centroide real del circuito
      const cafesOficialesCercanos = listarCafesHubCercanos(g.centroLat, g.centroLng, 4, true);
      const cafeOficialPrincipal = cafesOficialesCercanos[0];

      // Buscar la intersección o Café HUB conocido más cercano al centroide
      let esquinaMasCercana = cafeOficialPrincipal
        ? `${cafeOficialPrincipal.nombre} (${cafeOficialPrincipal.direccion.split(',')[0]})`
        : cafeHubBarrio?.esquina || `Centro de ${barrioPrincipal}`;
      let minDistCentroide = cafeOficialPrincipal ? cafeOficialPrincipal.distanciaMetros : Infinity;
      for (const dir of COORDENADAS_DIRECCIONES_CABA) {
        const d = distanciaHaversineMetros(g.centroLat, g.centroLng, dir.lat, dir.lng);
        if (d < minDistCentroide && d <= 600) {
          minDistCentroide = d;
          esquinaMasCercana = dir.label;
        }
      }

      const refLat = cafeOficialPrincipal ? cafeOficialPrincipal.lat : g.centroLat;
      const refLng = cafeOficialPrincipal ? cafeOficialPrincipal.lng : g.centroLng;

      const miembrosDetalle = g.miembros.map((contact) => {
        const est = estimarMinutosCaminandoCABA(contact.lat, contact.lng, refLat, refLng);
        return {
          contact,
          minutosCaminando: est.minutosCaminando,
          cuadrasAprox: est.cuadrasAprox,
          distanciaMetros: est.distanciaMetros,
        };
      });

      const tiempos = miembrosDetalle.map((m) => m.minutosCaminando);
      const mediaMinutos =
        Math.round((tiempos.reduce((a, b) => a + b, 0) / Math.max(1, tiempos.length)) * 10) / 10;
      const maxMinutos = Math.round(Math.max(...tiempos, 0) * 10) / 10;

      // Fechas mencionadas en Columna G dentro de este circuito (priorizando fecha objetivo activa)
      const fechasResueltas = g.miembros
        .map((m) => resolverFechaObjetivoContacto(m, ahoraMs))
        .filter((f): f is string => Boolean(f));
      const fechasAgrupadas = Array.from(
        new Set([...fechasResueltas, ...g.miembros.flatMap((m) => m.fechasMencionadas).filter(Boolean)])
      );
      const fechaPrincipal = g.fechaExplicita || fechasAgrupadas[0] || '';
      const convieneCafeHub =
        g.miembros.length >= 2 && maxMinutos <= maxMinutosRadio + 6;

      const modalidadRecomendadaAgenda: ModalidadEncuentroAgenda = convieneCafeHub
        ? 'CAFE_HUB'
        : 'PUERTA_A_PUERTA';

      let etiquetaFechaGrupo = `Próximos días (${hoyBA.ddmm} - ${manianaBA.ddmm})`;
      if (fechaPrincipal) {
        if (fechaPrincipal === hoyBA.ddmm) {
          etiquetaFechaGrupo = `HOY ${fechaPrincipal} (Columna G)`;
        } else if (fechaPrincipal === manianaBA.ddmm) {
          etiquetaFechaGrupo = `MAÑANA ${fechaPrincipal} (Columna G)`;
        } else {
          etiquetaFechaGrupo = `Fecha ${fechaPrincipal} (Columna G)`;
        }
      }

      const esSugeridoProximosDias =
        convieneCafeHub || g.miembros.length >= 2 || Boolean(fechaPrincipal);

      const franjasSet = Array.from(new Set(g.miembros.map((m) => m.franjaHoraria)));
      const cafeRecomendadoNombre = cafeOficialPrincipal
        ? `${cafeOficialPrincipal.nombre} (${cafeOficialPrincipal.direccion.split(',')[0]})`
        : cafeHubBarrio?.nombre || `Café céntrico en ${esquinaMasCercana}`;
      const urlGoogleMapsCafe =
        cafeOficialPrincipal?.urlGoogleMaps ||
        cafeHubBarrio?.urlGoogleMaps ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `Cafetería cerca de ${esquinaMasCercana}, ${barrioPrincipal}, CABA, Argentina`
        )}`;

      const recomendacionAgendaTexto = convieneCafeHub
        ? `Recomendación Agenda Día por Día (${etiquetaFechaGrupo}): Conviene armar CAFÉ HUB en ${etiquetaCircuito} para ${g.miembros.length} vecino(s) (~${mediaMinutos} min a pie). Elegí abajo cuál de los Cafés HUB de tu lista de Google Maps definir para personalizar automáticamente los mensajes.`
        : `Recomendación Agenda Día por Día (${etiquetaFechaGrupo}): Conviene RECORRIDO PUERTA A PUERTA para ${g.miembros.length} vecino(s) en ${etiquetaCircuito} (o elegí un Café HUB de tu lista abajo si preferís convocarlo a un punto).`;

      return {
        id: `cluster-${idx + 1}`,
        numero: idx + 1,
        nombreNodo: `Circuito ${idx + 1} — ${etiquetaCircuito} · ${etiquetaFechaGrupo} (${cafeOficialPrincipal ? cafeOficialPrincipal.nombre : esquinaMasCercana.split(',')[0]})`,
        barrioPrincipal,
        esquinaCentrica: cafeOficialPrincipal
          ? `${cafeOficialPrincipal.nombre} · ${cafeOficialPrincipal.direccion.split(',')[0]}`
          : esquinaMasCercana,
        cafeRecomendado: cafeRecomendadoNombre,
        centroLat: Number(g.centroLat.toFixed(5)),
        centroLng: Number(g.centroLng.toFixed(5)),
        miembros: miembrosDetalle,
        mediaMinutos,
        maxMinutos,
        convieneCafeHub,
        franjasCompatibles: franjasSet,
        veredicto: convieneCafeHub
          ? `CAFÉ HUB SUGERIDO · ${etiquetaFechaGrupo} (${g.miembros.length} pendientes a ~${mediaMinutos} min a pie)`
          : `RECORRIDO CASA X CASA · ${etiquetaFechaGrupo} (${g.miembros.length} pendiente${g.miembros.length > 1 ? 's' : ''})`,
        explicacion: convieneCafeHub
          ? `${g.miembros.length} personas sin adherir con dirección en Columna G (${etiquetaFechaGrupo}) en ${etiquetaCircuito} están a un promedio de ${mediaMinutos} min caminando de "${cafeRecomendadoNombre}". Seleccioná un café de tu lista compartida para definir el punto y personalizar el mensaje a cada vecino.`
          : `Circuito de ${g.miembros.length} contacto/s sin adherir (${etiquetaFechaGrupo}) cerca de ${esquinaMasCercana}: en la Agenda conviene resolverlo Puerta a Puerta o elegir un Café HUB cercano para personalizar su mensaje.`,
        urlGoogleMapsCafe,
        cafesHubCercanos: cafesOficialesCercanos,
        fechasAgrupadas,
        etiquetaFechaGrupo,
        modalidadRecomendadaAgenda,
        esSugeridoProximosDias,
        recomendacionAgendaTexto,
      };
    });
}


