import { buscarCafeHubMasCercano } from '../../data/cafesHubCatalog';
import { geocodificarContactoLocal } from './cabaLocations';
import { ModoSaludoMismoDia } from '../../types';
import {
  CafeHubCercanoCluster,
  Contact,
  VoiceProfile,
} from '../../types';
import {
  CATALOGO_CAFES_HUB_CABA,
  CafeHubCurado,
} from '../../data/cafesHubCatalog';
import {
  COORDENADAS_BARRIOS_CABA,
  DEFAULT_VOICE_PROFILE,
} from '../../data/estatusPopurriData';
import {
  distanciaHaversineMetros,
  estimarMinutosCaminandoCABA,
} from './cabaLocations';

export interface OpcionesCafeMensaje {
  incluirCafe?: boolean;
  cafeNombre?: string;
  cafeDireccion?: string;
  cafeLat?: number;
  cafeLng?: number;
  horarioTexto?: string;
  cafeTexto?: string;
  modoSaludo?: ModoSaludoMismoDia;
  ahoraMs?: number;
}

/**
 * Resuelve el café correspondiente a un grupo barrial y formatea la referencia natural
 * incluyendo el nombre del café, su dirección y los minutos aproximados desde el lugar sugerido por la persona.
 */
export function describirCafeConDistanciaDesdeContacto(
  contact: {
    barrio: string;
    calleOCruce?: string;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  opciones?: OpcionesCafeMensaje
): {
  incluirCafe: boolean;
  cafeNombre: string;
  cafeDireccion: string;
  minutosAprox: number;
  fraseCafe: string;
  horarioCafe: string;
} {
  const barrioNorm = (contact.barrio || 'Palermo').trim();
  const geoContacto =
    typeof contact.lat === 'number' && typeof contact.lng === 'number'
      ? { lat: contact.lat, lng: contact.lng }
      : geocodificarContactoLocal(contact.calleOCruce || '', barrioNorm);

  let rawNombre = opciones?.cafeNombre || '';
  let rawDir = opciones?.cafeDireccion || '';
  let cafeLat = opciones?.cafeLat;
  let cafeLng = opciones?.cafeLng;

  if (!rawNombre && opciones?.cafeTexto) {
    const m = opciones.cafeTexto.match(/^([^(]+)(?:\(([^)]+)\))?/);
    if (m) {
      rawNombre = m[1].trim();
      if (m[2]) rawDir = m[2].trim();
    } else {
      rawNombre = opciones.cafeTexto.trim();
    }
  }

  // Buscar coincidencia en el catálogo oficial de cafés CABA para obtener dirección y coordenadas exactas
  const candidatosMismoBarrio = CATALOGO_CAFES_HUB_CABA.filter(
    (cf) => cf.esCaba && cf.barrio.toLowerCase() === barrioNorm.toLowerCase()
  );
  const mejorDelBarrio =
    candidatosMismoBarrio.length > 0
      ? [...candidatosMismoBarrio].sort(
          (a, b) =>
            estimarMinutosCaminandoCABA(geoContacto.lat, geoContacto.lng, a.lat, a.lng)
              .distanciaMetros -
            estimarMinutosCaminandoCABA(geoContacto.lat, geoContacto.lng, b.lat, b.lng)
              .distanciaMetros
        )[0]
      : buscarCafeHubMasCercano(geoContacto.lat, geoContacto.lng);

  if (rawNombre) {
    const matchCat = CATALOGO_CAFES_HUB_CABA.find(
      (cf) =>
        cf.nombre.toLowerCase() === rawNombre.toLowerCase() ||
        rawNombre.toLowerCase().includes(cf.nombre.toLowerCase())
    );
    if (matchCat) {
      if (!rawDir) rawDir = matchCat.direccion.split(',')[0].trim();
      if (cafeLat === undefined) cafeLat = matchCat.lat;
      if (cafeLng === undefined) cafeLng = matchCat.lng;
    }
  } else if (mejorDelBarrio) {
    rawNombre = mejorDelBarrio.nombre;
    rawDir = mejorDelBarrio.direccion.split(',')[0].trim();
    cafeLat = mejorDelBarrio.lat;
    cafeLng = mejorDelBarrio.lng;
  } else if (profile.cafesPorBarrio[barrioNorm]) {
    rawNombre = profile.cafesPorBarrio[barrioNorm].nombre;
    rawDir = profile.cafesPorBarrio[barrioNorm].esquina.split(',')[0].trim();
  }

  const cafeNombre =
    rawNombre.replace(/\s*\([^)]*\)\s*$/, '').split('/')[0].trim() ||
    `Café de ${barrioNorm}`;
  const cafeDireccion =
    rawDir.split(',')[0].trim() ||
    profile.cafesPorBarrio[barrioNorm]?.esquina?.split(',')[0]?.trim() ||
    barrioNorm;

  const coordsBarrio =
    COORDENADAS_BARRIOS_CABA[barrioNorm] || COORDENADAS_BARRIOS_CABA.Palermo;
  const latDest = cafeLat ?? mejorDelBarrio?.lat ?? coordsBarrio.lat;
  const lngDest = cafeLng ?? mejorDelBarrio?.lng ?? coordsBarrio.lng;

  const est = estimarMinutosCaminandoCABA(
    geoContacto.lat,
    geoContacto.lng,
    latDest,
    lngDest
  );
  const minutosAprox = Math.max(2, Math.min(18, Math.round(est.minutosCaminando)));

  const lugarSugerido = (contact.calleOCruce || '').trim();
  const tieneLugarEspecifico =
    Boolean(lugarSugerido) && !/chile\s*1408/i.test(lugarSugerido);

  const fraseCafe = tieneLugarEspecifico
    ? `el café *${cafeNombre}* (${cafeDireccion}, que está a unos ${minutosAprox} minutos de ${lugarSugerido})`
    : `el café *${cafeNombre}* (${cafeDireccion}, a unos ${minutosAprox} minutos dentro de ${barrioNorm})`;

  const horarioCafe =
    opciones?.horarioTexto ||
    profile?.cafesPorBarrio?.[barrioNorm]?.horariosSugeridos ||
    'esta semana por la tarde';

  return {
    incluirCafe: opciones?.incluirCafe ?? true,
    cafeNombre,
    cafeDireccion,
    minutosAprox,
    fraseCafe,
    horarioCafe,
  };
}

/**
 * Genera el mensaje conversacional con la voz de César Rincón (Modo Breve o Modo Completo),
 * evitando redundancias y orientándolo a concretar la adhesión de forma natural en una conversación de WhatsApp.
 * Reglas de estilo:
 * - Sólo dice quién es ("Soy César...") en el primer mensaje (`primer_contacto`) y en el seguimiento si la persona no respondió (`seguimiento_sin_respuesta`).
 * - No termina los mensajes con "¡Un abrazo grande!" ni abusa de los signos de exclamación.
 * - No menciona "Café HUB" como evento: propone pasar/encontrarse en el café [nombre] con su dirección adjunta y los minutos aproximados desde el lugar sugerido por la persona (sólo cuando ese café agrupa a varias personas ya contactadas).
 */

export function seleccionarCafesHubPorCercaniaYFranja(
  grupo: Contact[],
  barrioReferencia: string,
  fechaClave: string,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): {
  cafesRanking: CafeHubCercanoCluster[];
  franjaCompartidaResumen: string;
  mediaMinutosMejorCafe: number;
} {
  const coordsBarrio =
    COORDENADAS_BARRIOS_CABA[barrioReferencia] || COORDENADAS_BARRIOS_CABA.Palermo;
  const centroLat =
    grupo.length > 0
      ? grupo.reduce((acc, c) => acc + c.lat, 0) / grupo.length
      : coordsBarrio.lat;
  const centroLng =
    grupo.length > 0
      ? grupo.reduce((acc, c) => acc + c.lng, 0) / grupo.length
      : coordsBarrio.lng;

  // Analizar días y franjas horarias compartidas por el grupo
  const conteoFranjas: Record<string, number> = {};
  for (const c of grupo) {
    const f = c.franjaHoraria || 'Tarde';
    conteoFranjas[f] = (conteoFranjas[f] || 0) + 1;
  }
  const franjasOrdenadas = Object.entries(conteoFranjas)
    .sort((a, b) => b[1] - a[1])
    .map(([f, count]) => `${f} (${count})`);
  const franjaDominante =
    Object.entries(conteoFranjas).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Tarde';
  const franjaCompartidaResumen =
    franjasOrdenadas.length > 0
      ? `Día ${fechaClave} · Franja compartida: ${franjasOrdenadas.join(', ')}`
      : `Día ${fechaClave} · Franja ${franjaDominante}`;

  const candidatosCaba: CafeHubCurado[] = CATALOGO_CAFES_HUB_CABA.filter((cf) => cf.esCaba);
  const cafesMismoBarrio = candidatosCaba.filter(
    (cf) =>
      cf.barrio.toLowerCase() === barrioReferencia.toLowerCase() ||
      grupo.some((m) => m.barrio.toLowerCase() === cf.barrio.toLowerCase())
  );
  // Priorizar estrictamente los cafés del mismo barrio del circuito (si existen en el catálogo) para nunca mezclar cafés de Saavedra/Puerto Madero en un circuito de Palermo
  const poolCafes = cafesMismoBarrio.length >= 1 ? cafesMismoBarrio : candidatosCaba;

  const puntuados = poolCafes
    .map((cf: CafeHubCurado) => {
      // Calcular distancia promedio real a todos los miembros del grupo (no sólo al centroide)
      const distPromedioMetros =
        grupo.length > 0
          ? Math.round(
              grupo.reduce(
                (acc, m) =>
                  acc +
                  estimarMinutosCaminandoCABA(m.lat, m.lng, cf.lat, cf.lng).distanciaMetros,
                0
              ) / grupo.length
            )
          : estimarMinutosCaminandoCABA(centroLat, centroLng, cf.lat, cf.lng).distanciaMetros;

      const minPromedio =
        grupo.length > 0
          ? Math.max(
              2,
              Math.round(
                grupo.reduce(
                  (acc, m) =>
                    acc +
                    estimarMinutosCaminandoCABA(m.lat, m.lng, cf.lat, cf.lng).minutosCaminando,
                  0
                ) / grupo.length
              )
            )
          : Math.max(2, Math.round(estimarMinutosCaminandoCABA(centroLat, centroLng, cf.lat, cf.lng).minutosCaminando));
      const cuadrasPromedio = Math.max(1, Math.round(distPromedioMetros / 100));

      const mismoBarrio =
        cf.barrio.toLowerCase() === barrioReferencia.toLowerCase() ||
        grupo.some((m) => m.barrio.toLowerCase() === cf.barrio.toLowerCase());
      const cafeConfigBarrio = profile.cafesPorBarrio[cf.barrio];
      const coincideFranjaBarrio =
        cafeConfigBarrio &&
        cafeConfigBarrio.horariosSugeridos
          .toLowerCase()
          .includes(franjaDominante.toLowerCase().slice(0, 4));

      const score =
        distPromedioMetros -
        (mismoBarrio ? 2500 : 0) -
        (coincideFranjaBarrio ? 220 : 0);

      return {
        cafe: {
          id: cf.id,
          nombre: cf.nombre,
          direccion: cf.direccion,
          barrio: cf.barrio,
          urlGoogleMaps: cf.urlGoogleMaps,
          lat: cf.lat,
          lng: cf.lng,
          distanciaMetros: distPromedioMetros,
          minutosCaminando: minPromedio,
          cuadrasAprox: cuadrasPromedio,
        } satisfies CafeHubCercanoCluster,
        score,
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const cafesRanking = puntuados.map((p) => p.cafe);
  const mediaMinutosMejorCafe = cafesRanking[0]?.minutosCaminando ?? 10;

  return {
    cafesRanking,
    franjaCompartidaResumen,
    mediaMinutosMejorCafe,
  };
}

/**
 * Determina si una persona ya confirmó su respuesta en la Lista 1-a-1 Unificada (o en la planilla)
 * para activar el envío del envío en terreno en la Pestaña 3 ("3. Hoja de Ruta en Terreno").
 */

