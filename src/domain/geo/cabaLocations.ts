import { Contact, EstadoFlujo, RawContactRow, SituacionContacto, VoiceProfile } from '../../types';
import { capitalizarPalabras } from '../contacts/nameCorrection';
import {
  COORDENADAS_BARRIOS_CABA,
  COORDENADAS_DIRECCIONES_CABA,
  DEFAULT_VOICE_PROFILE,
} from '../../data/estatusPopurriData';

export const MAPA_BARRIOS_CABA_CANONICOS: Record<string, string> = {
  palermo: 'Palermo',
  'palermo soho': 'Palermo',
  'palermo hollywood': 'Palermo',
  'palermo chico': 'Palermo',
  'las cañitas': 'Palermo',
  'las canitas': 'Palermo',
  saavedra: 'Saavedra',
  nuñez: 'Núñez',
  nunez: 'Núñez',
  núñez: 'Núñez',
  belgrano: 'Belgrano',
  'belgrano r': 'Belgrano',
  'belgrano c': 'Belgrano',
  'villa urquiza': 'Villa Urquiza',
  urquiza: 'Villa Urquiza',
  coghlan: 'Coghlan',
  'villa pueyrredon': 'Villa Pueyrredón',
  'villa pueyrredón': 'Villa Pueyrredón',
  colegiales: 'Colegiales',
  recoleta: 'Recoleta',
  caballito: 'Caballito',
  almagro: 'Almagro',
  'villa crespo': 'Villa Crespo',
  chacarita: 'Chacarita',
  'villa devoto': 'Villa Devoto',
  devoto: 'Villa Devoto',
  boedo: 'Boedo',
  'san telmo': 'San Telmo',
  retiro: 'Retiro',
  flores: 'Flores',
  floresta: 'Floresta',
  'parque patricios': 'Parque Patricios',
  monserrat: 'Monserrat',
  montserrat: 'Monserrat',
  balvanera: 'Balvanera',
  once: 'Balvanera',
  abasto: 'Balvanera',
  'san nicolas': 'San Nicolás',
  'san nicolás': 'San Nicolás',
  microcentro: 'San Nicolás',
  constitucion: 'Constitución',
  constitución: 'Constitución',
  barracas: 'Barracas',
  'la boca': 'La Boca',
  boca: 'La Boca',
  'puerto madero': 'Puerto Madero',
  'san cristobal': 'San Cristóbal',
  'san cristóbal': 'San Cristóbal',
  'nueva pompeya': 'Nueva Pompeya',
  pompeya: 'Nueva Pompeya',
  'parque chacabuco': 'Parque Chacabuco',
  paternal: 'Paternal',
  'la paternal': 'Paternal',
  agronomia: 'Agronomía',
  agronomía: 'Agronomía',
  'parque chas': 'Parque Chas',
  'villa ortuzar': 'Villa Ortúzar',
  'villa ortúzar': 'Villa Ortúzar',
  'villa del parque': 'Villa del Parque',
  'villa general mitre': 'Villa General Mitre',
  'villa santa rita': 'Villa Santa Rita',
  'monte castro': 'Monte Castro',
  'velez sarsfield': 'Vélez Sársfield',
  'vélez sársfield': 'Vélez Sársfield',
  'villa luro': 'Villa Luro',
  versalles: 'Versalles',
  'villa real': 'Villa Real',
  liniers: 'Liniers',
  mataderos: 'Mataderos',
  'parque avellaneda': 'Parque Avellaneda',
  'villa soldati': 'Villa Soldati',
  'villa lugano': 'Villa Lugano',
  lugano: 'Villa Lugano',
  'villa riachuelo': 'Villa Riachuelo',
  caba: 'CABA',
  'capital federal': 'CABA',
};

export function esBarrioDeCABA(valor: string): boolean {
  const limpio = String(valor || '')
    .replace(/"/g, '')
    .trim()
    .toLowerCase();
  if (!limpio) return false;
  return Boolean(MAPA_BARRIOS_CABA_CANONICOS[limpio]);
}

export function normalizarBarrioCABA(valor: string): string {
  const limpio = String(valor || '').replace(/"/g, '').trim();
  if (!limpio) return 'Palermo';
  const canon = MAPA_BARRIOS_CABA_CANONICOS[limpio.toLowerCase()];
  return canon || capitalizarPalabras(limpio);
}


export function esEmailValido(valor: string): boolean {
  const limpio = String(valor || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio);
}


export function esIdFilaValido(valor: string): boolean {
  const limpio = String(valor || '').trim();
  if (!limpio) return true;
  return (
    /^#?\d+$/.test(limpio) ||
    /^#?N\d+$/i.test(limpio) ||
    /^#?S\/?N(-\d+)?$/i.test(limpio) ||
    /^S\d+-\d+$/i.test(limpio)
  );
}

/**
 * Repara automáticamente cualquier contacto cuyas columnas hayan quedado desfasadas
 * (por ejemplo, cuando el Nombre de la Columna B quedó en `id`, el Barrio en `nombre` y el Email en `barrio`).
 */

export function extraerCalleOCruce(comentario: string): string {
  if (!comentario) return '';
  const rawStr = String(comentario).trim();
  if (!rawStr) return '';

  const esExpresionFechaOHora = (s: string): boolean => {
    const t = s.trim();
    if (!t) return true;
    const tieneCalleConAltura =
      /\b(?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+|Dr\.?\s+|Sta\.?\s+)?[A-ZÁÉÍÓÚÑa-záéíóúñ]{3,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ.]{2,}){0,3}\s+(?:al\s+)?\d{3,4}\b/i.test(
        t
      );
    if (tieneCalleConAltura) return false;
    if (
      /\b\d{1,2}\/\d{1,2}\b/.test(t) ||
      /\b\d{1,2}\s*(?:o|y|al|-)\s*\d{1,2}\/\d{1,2}\b/i.test(t) ||
      /\b\d{1,2}:\d{2}\b/.test(t) ||
      /\b(?:a\s+las|antes\s+de\s+las|despu[eé]s\s+de\s+las|cualquier\s+hora|entre\s+(?:el\s+|las\s+)?\d|de\s+\d{1,2}\s+a\s+\d{1,2}|\d{1,2}\s*(?:hs|horas|h)\b|por\s+la\s+(?:ma[ñn]ana|tarde|noche)|al\s+mediod[ií]a|paradas?\s+en\s+orden|mesa\s+caf[eé])/i.test(
        t
      )
    ) {
      return true;
    }
    return false;
  };

  // 1. Evaluar primero el texto escrito FUERA de los paréntesis cuando el usuario escribe "Dirección (fecha y hora)"
  //    (ej: "Charcas 3702 1B (el 21/10 a las 10)", "Beruti 3459, depto 12B (entre el 20 y 24/10...)", "Av. Cnel. Díaz 2277 (...)", "Av. Bullrich y Av. Santa Fe (...)")
  const antesDeParentesis = rawStr
    .split('(')[0]
    .replace(
      /^(?:visita\s+confirmada|visita\s+reprogramada|visita\s+puerta\s+a\s+puerta|visita|encuentro\s+confirmado|confirmad[oa]|reprogramad[oa]|vive\s+en|domicilio\s+en|va\s+a\s+pasar\s+por|pasa\s+por|prefiere\s+pasar\s+por|se\s+acerca\s+a)\b[:\s-]*/i,
      ''
    )
    .replace(/\b\d{1,2}\s*(?:o|y|al|-)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/\b(?:a\s+las\s+\d{1,2}(?::\d{2})?\s*(?:hs|h)?|\d{1,2}:\d{2}\s*hs|cualquier\s+hora|en\s+cualquier\s+horario)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, '')
    .trim();

  if (
    antesDeParentesis.length >= 5 &&
    !esExpresionFechaOHora(antesDeParentesis) &&
    !esBarrioDeCABA(antesDeParentesis) &&
    !/^(sin\s+respuesta|no\s+contesta|1er\s+mensaje|pidi[oó]\s+m[aá]s\s+info|no\s+tiene\s+domicilio)/i.test(
      antesDeParentesis
    )
  ) {
    const tieneAlturaOCruce =
      /\b(?:al\s+)?\d{3,4}\b/.test(antesDeParentesis) ||
      /\b[A-ZÁÉÍÓÚÑa-záéíóúñ.]{3,}\s+(?:y|e)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ.]{3,}/i.test(antesDeParentesis) ||
      /\b(parque|pqe\.?|plaza|pza\.?|estaci[oó]n|subte|club|shopping|caf[eé]|sede|ecoparque|bot[aá]nico)\b/i.test(
        antesDeParentesis
      );
    if (tieneAlturaOCruce) {
      return antesDeParentesis
        .replace(/,?\s*hija de.*$/i, '')
        .replace(/^Pqe\.\s*/i, 'Parque ')
        .replace(/^Pza\.\s*/i, 'Plaza ')
        .trim();
    }
  }

  // 2. Buscar dentro de paréntesis (...) en la Columna G ignorando paréntesis que sean fechas u horarios
  const matches = [...rawStr.matchAll(/\(([^)]+)\)/g)];
  for (let i = 0; i < matches.length; i++) {
    let txt = matches[i][1].trim();
    if (
      /^x\d+$/i.test(txt) ||
      /consertada|concertada|confirmad[oa]|sin respuesta|pendiente|verificad[oa]|auto-wa|no existe|1er\s*(contacto|msj|mensaje)|^#\d+$/i.test(
        txt
      ) ||
      esExpresionFechaOHora(txt)
    ) {
      continue;
    }
    txt = txt
      .replace(/,?\s*hija de.*$/i, '')
      .replace(/,\s*\d+\s*$/i, '')
      .replace(/^Pqe\.\s*/i, 'Parque ')
      .replace(/^Pza\.\s*/i, 'Plaza ')
      .trim();

    const esPuntoEspecifico =
      /^(parque|pqe\.?|plaza|pza\.?|estaci[oó]n|subte|club|shopping|caf[eé]|sede|hospital|ecoparque|bot[aá]nico|obelisco)\b/i.test(
        txt
      );
    if (esBarrioDeCABA(txt) && !esPuntoEspecifico) {
      continue;
    }
    if (txt.length > 3) return txt;
  }

  // 3. Buscar coincidencias directas en el diccionario de direcciones y puntos de CABA (priorizando coincidencias más específicas)
  const comLow = rawStr.toLowerCase();
  const coordenadasOrdenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
    (a, b) => b.match.length - a.match.length
  );
  for (const item of coordenadasOrdenadas) {
    if (comLow.includes(item.match)) {
      const etiquetaLimpia = item.label.split(',')[0].replace(/\s*\([^)]*\)/g, '').trim();
      return etiquetaLimpia || item.match;
    }
  }

  // 4. Buscar puntos de encuentro explícitos (Parque, Plaza, Estación, Club, Shopping) escritos sin paréntesis
  const matchPunto = rawStr.match(
    /\b((?:Parque|Pqe\.|Plaza|Pza\.|Estaci[oó]n|Club|Shopping)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?)/
  );
  if (matchPunto && matchPunto[1]) {
    return matchPunto[1]
      .replace(/^Pqe\.\s*/i, 'Parque ')
      .replace(/^Pza\.\s*/i, 'Plaza ')
      .trim();
  }

  // 5. Buscar intersecciones explícitas ("Calle1 y Calle2" o "Calle1 e Calle2") escritas sin paréntesis
  const matchCruce = rawStr.match(
    /\b((?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+){0,2}\s+(?:y|e)\s+(?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+){0,2})\b/
  );
  if (matchCruce && matchCruce[1]) {
    const cand = matchCruce[1].trim();
    const palabrasTiempo =
      /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[ñn]ana|tarde|noche|nombre|apellido)\b/i;
    if (!palabrasTiempo.test(cand) && !esBarrioDeCABA(cand)) {
      return cand;
    }
  }

  // 6. Buscar calle con altura numérica (ej. "Av. Cabildo 2040", "Av. Cnel. Díaz 2277", "Charcas 3702") escrita sin paréntesis
  const matchAltura = rawStr.match(
    /\b((?:Av\.?\s+|Avenida\s+|Cnel\.?\s+|Gral\.?\s+|Dr\.?\s+|Sta\.?\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+(?:\s+(?:del|de\s+la|de|[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+)){0,3}\s+(?:al\s+)?\d{3,4}(?:\s*,?\s*(?:depto\.?|piso|dto\.?)?\s*\d*[A-Za-z]?)?)\b/
  );
  if (matchAltura && matchAltura[1]) {
    const cand = matchAltura[1].trim();
    const prefijoInvalido =
      /^(visita|semana|entre|hasta|desde|despu[eé]s|luego|antes|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|contacto|fila)\b/i;
    if (!prefijoInvalido.test(cand)) {
      return cand;
    }
  }

  return '';
}

/**
 * Determina si el contacto tiene una dirección real, intersección o punto de encuentro
 * cargado en la Columna "G" ("Comentario") del Google Sheets.
 * Si sólo contamos con el barrio en la Columna C pero no hay dirección/punto en la Columna G, devuelve `false`.
 */
export function tieneDireccionOPuntoEnComentario(comentario: string): boolean {
  return extraerCalleOCruce(comentario).trim().length > 0;
}

/**
 * Infiere el barrio oficial de CABA a partir de la dirección, esquina o punto de encuentro
 * introducido en la Columna "G" ("Comentario") del Google Sheets.
 * Si no hay dirección/punto de encuentro o no puede determinarse un barrio específico, devuelve `null`.
 */
export function inferirBarrioDesdeDireccionOComentario(
  calleOCruce: string,
  comentario: string = ''
): string | null {
  const dirLimpia = (calleOCruce || '').trim();
  if (!dirLimpia) return null;

  const low = dirLimpia.toLowerCase();
  const comLow = (comentario || '').toLowerCase();

  // 1. Buscar primero en el diccionario geoespacial exacto de direcciones y puntos de encuentro de CABA
  for (const item of COORDENADAS_DIRECCIONES_CABA) {
    if (low.includes(item.match) || item.match.includes(low)) {
      return item.barrio;
    }
  }

  // Extraer altura numérica si la dirección incluye número de puerta (ej: "Cabildo 2100" -> 2100)
  const matchNum = low.match(/\b(\d{2,4})\b/);
  const altura = matchNum ? parseInt(matchNum[1], 10) : null;

  // 2. Reglas por avenidas largas de CABA según altura o intersección
  if (low.includes('cabildo')) {
    if (altura !== null) {
      if (altura < 1500) return 'Colegiales';
      if (altura >= 3000) return 'Núñez';
      return 'Belgrano';
    }
    if (low.includes('congreso') || low.includes('quesada') || low.includes('manuela pedraza') || low.includes('criszólogo') || low.includes('larralde')) {
      return 'Núñez';
    }
    if (low.includes('lacroze') || low.includes('teodoro') || low.includes('newbery') || low.includes('dorrego')) {
      return 'Colegiales';
    }
    return 'Belgrano';
  }

  if (low.includes('santa fe')) {
    if (altura !== null && altura < 2800) return 'Recoleta';
    if (low.includes('callao') || low.includes('pueyrredón') || low.includes('pueyrredon')) return 'Recoleta';
    return 'Palermo';
  }

  if (low.includes('corrientes')) {
    if (altura !== null) {
      if (altura < 1800) return 'San Nicolás';
      if (altura < 3400) return 'Balvanera';
      if (altura < 4700) return 'Almagro';
      return 'Villa Crespo';
    }
    if (low.includes('medrano') || low.includes('bulnes') || low.includes('gascón') || low.includes('gascon')) return 'Almagro';
    if (low.includes('scalabrini') || low.includes('malabia') || low.includes('thames') || low.includes('dorrego')) return 'Villa Crespo';
    if (low.includes('callao') || low.includes('pueyrredón') || low.includes('pueyrredon')) return 'Balvanera';
    if (low.includes('9 de julio') || low.includes('obelisco') || low.includes('florida') || low.includes('maipú') || low.includes('maipu')) return 'San Nicolás';
  }

  if (low.includes('rivadavia')) {
    if (altura !== null) {
      if (altura < 1800) return 'Monserrat';
      if (altura < 3400) return 'Balvanera';
      if (altura < 4400) return 'Almagro';
      if (altura < 6200) return 'Caballito';
      return 'Flores';
    }
    if (low.includes('acoyte') || low.includes('parque rivadavia') || low.includes('primera junta')) return 'Caballito';
  }

  if (low.includes('álvarez thomas') || low.includes('alvarez thomas')) {
    if (altura !== null) {
      if (altura < 1300) return 'Colegiales';
      if (altura < 2200) return 'Villa Ortúzar';
      return 'Villa Urquiza';
    }
    if (low.includes('lacroze') || low.includes('elcano') || low.includes('virrey')) return 'Colegiales';
    return 'Villa Urquiza';
  }

  if (low.includes('monroe')) {
    if (altura !== null) {
      if (altura < 3000) return 'Belgrano';
      if (altura < 4200) return 'Coghlan';
      return 'Villa Urquiza';
    }
    if (low.includes('triunvirato') || low.includes('capdevila') || low.includes('bauness') || low.includes('bucarelli')) {
      return 'Villa Urquiza';
    }
    if (low.includes('naón') || low.includes('naon') || low.includes('melián') || low.includes('melian') || low.includes('washington')) {
      return 'Coghlan';
    }
    if (low.includes('cabildo') || low.includes('cuba') || low.includes('vuelta de obligado')) {
      return 'Belgrano';
    }
  }

  // 3. Reglas por calles, parques y puntos emblemáticos de cada barrio de CABA
  if (
    /parque saavedra|pqe\.?\s*saavedra|garc[ií]a del r[ií]o|besares|vilela|paroissien|arias\b|deheza|pico\b|correa\b|balb[ií]n y larralde|pinto y vilela|amen[aá]bar y besares|vidal y garc[ií]a/i.test(
      low
    ) ||
    ((/meli[aá]n|washington|r[oó]mulo na[oó]n|pinto\b|larralde|balb[ií]n|zapiola/i.test(low)) &&
      (altura === null || altura >= 3200 || low.includes('iberá') || low.includes('ibera')))
  ) {
    return 'Saavedra';
  }

  if (
    /plaza italia|pza\.?\s*italia|ecoparque|bot[aá]nico|rosedal|el solar|las ca[ñn]itas|huergo\b|godoy cruz|el salvador|honduras|costa rica|nicaragua|soler\b|guatemala\b|fitz roy|bonpland|carranza|ravignani|ravigniani|niceto|g[üu]emes|coronel d[ií]az|salguero|ar[aá]oz|charcas|scalabrini ort[ií]z y charcas|libertador 4\d\d\d/i.test(
      low
    )
  ) {
    return 'Palermo';
  }

  if (
    /chile 1\d\d\d|santiago del estero \d+|per[uú] al 100|per[uú] \d{1,3}\b|plaza de mayo|av\.?\s*de mayo|bol[ií]var \d{1,3}\b|piedras \d{1,3}\b|tacuar[ií] \d{1,3}\b|moreno \d{3,4}\b|alsina \d{3,4}\b/i.test(
      low
    )
  ) {
    return 'Monserrat';
  }

  if (
    /maip[uú] \d+|florida \d+|lavalle \d+|microcentro|obelisco|reconquista \d+|san mart[ií]n \d{1,3}\b|suipacha \d{1,3}\b|esmeralda \d{1,3}\b/i.test(
      low
    )
  ) {
    return 'San Nicolás';
  }

  if (
    /club pinocho|capdevila|triunvirato|plaza echeverr[ií]a|estaci[oó]n urquiza|bucarelli|bauness|cullen|andonaegui|altolaguirre|olaz[aá]bal [45]\d\d\d|blanco encalada [45]\d\d\d|manuela pedraza [45]\d\d\d/i.test(
      low
    )
  ) {
    return 'Villa Urquiza';
  }

  if (
    /caracas [45]\d\d\d|mosconi [23]\d\d\d|artigas [45]\d\d\d|plaza mart[ií]n rodr[ií]guez|plaza alem|gavil[aá]n [45]\d\d\d|nazca [45]\d\d\d/i.test(
      low
    )
  ) {
    return 'Villa Pueyrredón';
  }

  if (/estaci[oó]n coghlan|pedro ignacio rivera [34]\d\d\d|tronador [23]\d\d\d|nahuel huapi [34]\d\d\d/i.test(low)) {
    return 'Coghlan';
  }

  if (
    /plaza mafalda|lacroze y conde|conde \d{3,4}\b|teodoro garc[ií]a|palpa\b|aguilar\b|c[eé]spedes\b/i.test(
      low
    )
  ) {
    return 'Colegiales';
  }

  if (
    /barrancas de belgrano|juramento|barrio chino|sucre \d+|echeverr[ií]a [123]\d\d\d|la pampa \d+|virrey del pino|vuelta de obligado/i.test(
      low
    )
  ) {
    return 'Belgrano';
  }

  if (/las heras y pueyrred[oó]n|plaza francia|jun[ií]n 1\d\d\d|callao 1\d\d\d|quintana\b|alvear 1\d\d\d|posadas 1\d\d\d/i.test(low)) {
    return 'Recoleta';
  }

  if (/acoyte|parque rivadavia|parque centenario|primera junta|pedro goyena|rosario \d{3}\b|jose mar[ií]a moreno/i.test(low)) {
    return 'Caballito';
  }

  if (/medrano|castro barros|plaza almagro|pr[ií]ngles|yatay|gasc[oó]n/i.test(low)) {
    return 'Almagro';
  }

  if (/warnes|camargo|padilla|murillo|luis viale|aguirre \d+|vera \d+|velasco \d+|loyola \d+/i.test(low)) {
    return 'Villa Crespo';
  }

  if (/parque lezama|plaza dorrego|defensa [6789]\d\d|defensa 1\d\d\d|san telmo/i.test(low)) {
    return 'San Telmo';
  }

  if (/parque patricios|caseros [23]\d\d\d|uspallata/i.test(low)) {
    return 'Parque Patricios';
  }

  if (/plaza arenales|chivilcoy [34]\d\d\d|beir[oó] [345]\d\d\d/i.test(low)) {
    return 'Villa Devoto';
  }

  // 4. Si en la dirección o el comentario con dirección se menciona explícitamente un barrio oficial de CABA
  for (const [keyBarrio, nombreCanonico] of Object.entries(MAPA_BARRIOS_CABA_CANONICOS)) {
    if (keyBarrio.length >= 5 && (low.includes(keyBarrio) || comLow.includes(`(${keyBarrio})`))) {
      return nombreCanonico;
    }
  }

  return null;
}

/**
 * Si la dirección o punto de encuentro introducido en la Columna "G" ("Comentario") del Google Sheets
 * no coincide con el barrio cargado en el Google Sheets, modifica automáticamente el barrio al barrio
 * adecuado/correcto en función de la dirección o punto de encuentro cargada.
 */
export function sincronizarBarrioConDireccionComentario(raw: RawContactRow): RawContactRow {
  const comLow = (raw.comentario || '').toLowerCase();
  if (
    comLow.includes('chile 1408') ||
    /reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(comLow)
  ) {
    const barrioActualSede = (raw.barrio || '').trim()
      ? normalizarBarrioCABA(raw.barrio)
      : 'Palermo';
    return {
      ...raw,
      barrio: barrioActualSede,
    };
  }

  const calleOCruce = extraerCalleOCruce(raw.comentario);
  if (!calleOCruce) {
    return raw;
  }

  const barrioCorrecto = inferirBarrioDesdeDireccionOComentario(calleOCruce, raw.comentario);
  if (!barrioCorrecto) {
    return raw;
  }

  const barrioActual = (raw.barrio || '').trim() ? normalizarBarrioCABA(raw.barrio) : 'Palermo';
  if (barrioCorrecto.toLowerCase() !== barrioActual.toLowerCase()) {
    return {
      ...raw,
      barrio: barrioCorrecto,
      barrioOriginalSheet: raw.barrioOriginalSheet || barrioActual,
      barrioCorregidoPorDireccion: true,
    };
  }

  return {
    ...raw,
    barrio: barrioCorrecto,
  };
}

/**
 * Extrae todas las fechas DD/MM mencionadas en el comentario, incluyendo expresiones compuestas
 * donde varios días comparten el mismo mes (ej: "20 o 21/10", "21 o 22/10", "21 o 23/10", "21 y 22/10", "del 20 al 22/10").
 */

export function geocodificarContactoLocal(
  calleOCruce: string,
  barrio: string,
  id: string = ''
): { lat: number; lng: number; exacta: boolean } {
  const limpio = (calleOCruce || '')
    .toLowerCase()
    .replace(/\bsta\.?\s*fe\b/g, 'santa fe')
    .replace(/\bcnel\.?\b/g, 'coronel')
    .replace(/\bgral\.?\b/g, 'general')
    .trim();

  if (limpio) {
    // Ordenar de mayor a menor longitud de match para que "godoy cruz 3268" tenga prioridad sobre "godoy cruz"
    const ordenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
      (a, b) => b.match.length - a.match.length
    );
    for (const item of ordenadas) {
      if (limpio.includes(item.match) || (limpio.length >= 6 && item.match.includes(limpio))) {
        return { lat: item.lat, lng: item.lng, exacta: true };
      }
    }
  }

  // Fallback alrededor del centro del barrio (corregido según dirección si aplica)
  const base = COORDENADAS_BARRIOS_CABA[barrio] || COORDENADAS_BARRIOS_CABA.Palermo;
  const numId = parseInt(String(id).replace(/\D/g, ''), 10) || 1;
  const angle = (numId * 137.5 * Math.PI) / 180;
  const radius = 0.002 + (numId % 7) * 0.0008;
  return {
    lat: Number((base.lat + Math.cos(angle) * radius).toFixed(5)),
    lng: Number((base.lng + Math.sin(angle) * radius).toFixed(5)),
    exacta: Boolean(limpio),
  };
}

/**
 * Resuelve las coordenadas exactas del punto de partida configurado en el perfil
 * a partir de `profile.direccionPartida`, garantizando que si el usuario cambia
 * la dirección de salida (o corrige su altura), el cálculo de tramos use la ubicación real.
 */
export function resolverCoordenadasPartidaPerfil(profile: VoiceProfile): {
  lat: number;
  lng: number;
  direccionMaps: string;
} {
  const dirRaw = (profile.direccionPartida || 'Godoy Cruz 3268, Palermo, CABA').trim();
  const geo = geocodificarContactoLocal(dirRaw, 'Palermo', '0');
  const direccionMaps = /caba|ciudad aut[oó]noma|buenos aires/i.test(dirRaw)
    ? /argentina/i.test(dirRaw)
      ? dirRaw
      : `${dirRaw}, Argentina`
    : `${dirRaw}, CABA, Argentina`;

  if (geo.exacta) {
    return { lat: geo.lat, lng: geo.lng, direccionMaps };
  }
  return {
    lat: profile.latPartida || -34.5738,
    lng: profile.lngPartida || -58.4215,
    direccionMaps,
  };
}

/**
 * Distancia Haversine en metros y estimación realista de caminata en la traza urbana de CABA
 * (alineada con los tiempos reales de Google Maps a pie y cruces de avenidas).
 */
export function distanciaHaversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimarMinutosCaminandoCABA(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { distanciaMetros: number; cuadrasAprox: number; minutosCaminando: number } {
  const lineal = distanciaHaversineMetros(lat1, lng1, lat2, lng2);
  if (lineal < 15) {
    return { distanciaMetros: 0, cuadrasAprox: 0, minutosCaminando: 1 };
  }
  // En CABA (Palermo / Recoleta / Belgrano / Colegiales) la cuadrícula está rotada ~35° respecto del norte
  // (calles SO-NE como Godoy Cruz/Oro y avenidas NO-SE como Santa Fe/Libertador/Córdoba).
  const radLat = (((lat1 + lat2) / 2) * Math.PI) / 180;
  const dy = (lat2 - lat1) * 111320;
  const dx = (lng2 - lng1) * 111320 * Math.cos(radLat);
  const theta = (35 * Math.PI) / 180;
  const du = Math.abs(dx * Math.cos(theta) - dy * Math.sin(theta));
  const dv = Math.abs(dx * Math.sin(theta) + dy * Math.cos(theta));
  const manhattanRotado = du + dv;

  const metrosGrilla =
    lineal <= 320
      ? Math.round(lineal * 1.28)
      : Math.round(Math.max(lineal * 1.28, manhattanRotado * 1.04));
  const cuadrasAprox = Math.max(1, Math.round(metrosGrilla / 100));
  // Velocidad efectiva urbana de Google Maps en CABA (~70 m/min incluyendo semáforos y esquinas)
  const esperaCrucesMin = metrosGrilla > 950 ? 1.5 : metrosGrilla > 450 ? 1 : 0;
  const minutosCaminando = Math.max(
    1,
    Math.round((metrosGrilla / 70 + esperaCrucesMin) * 10) / 10
  );
  return { distanciaMetros: metrosGrilla, cuadrasAprox, minutosCaminando };
}


export function tienePuntoEncuentroODireccionDeterminada(input: {
  adhirio?: string;
  estadoFlujo?: EstadoFlujo;
  situacion?: SituacionContacto;
  calleOCruce?: string;
  tieneDireccionRealEnComentario?: boolean;
  comentario?: string;
}): boolean {
  const adh = (input.adhirio || '').toLowerCase();
  if (adh === 'sí' || adh === 'si') return false;
  if (
    input.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    input.estadoFlujo === 'DESCARTADO_O_BAJA' ||
    input.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    input.situacion === 'YA_ADHIRIO' ||
    input.situacion === 'DESCARTADO_NO_CABA'
  ) {
    return false;
  }

  if (input.tieneDireccionRealEnComentario || (input.calleOCruce && input.calleOCruce.trim().length > 0)) {
    return true;
  }

  if (
    input.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
    input.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    input.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    input.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    input.situacion === 'VISITA_AGENDADA' ||
    input.situacion === 'PREFIERE_PUNTO' ||
    input.situacion === 'EVENTO_CHILE_1408'
  ) {
    return true;
  }

  const com = (input.comentario || '').toLowerCase();
  return /\b(chile\s*1408|caf[eé]\s*hub|punto\s*de\s*encuentro|sede|plaza|pza\.|estaci[oó]n|parque|pqe\.|reuni[oó]n\s*de\s*los\s*mi[eé]rcoles|visita)\b/i.test(
    com
  );
}

/**
 * Extrae si la celda de la Columna "G" ("Comentario") contiene una hora o ventana horaria explícita
 * y devuelve el minuto del día (0..1439) en que vence dicha hora/franja.
 */

export function calcularMinutosTrasladoCABA(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { modo: 'WALKING' | 'TRANSIT'; minutos: number; distanciaMetros: number; cuadras: number } {
  const est = estimarMinutosCaminandoCABA(lat1, lng1, lat2, lng2);
  if (est.distanciaMetros <= 30) {
    return {
      modo: 'WALKING',
      minutos: 1,
      distanciaMetros: est.distanciaMetros,
      cuadras: 0,
    };
  }
  // En CABA hasta ~1350m (~13-14 cuadras, ~18-20 min) es más rápido o equivalente ir a pie
  // que esperar colectivo + caminar a las paradas; a partir de >1350m se usa Transporte Público
  // contemplando caminata a parada (~5 min) + espera promedio en CABA (~6 min) + viaje urbano + caminata final (~3 min).
  const modo: 'WALKING' | 'TRANSIT' = est.distanciaMetros <= 1350 ? 'WALKING' : 'TRANSIT';
  const minutosWalking = Math.ceil(est.minutosCaminando);
  const minutosTransit = Math.min(
    65,
    13 +
      Math.round(est.distanciaMetros / 230) +
      (est.distanciaMetros > 3500 ? 4 : 0) +
      (est.distanciaMetros > 6000 ? 4 : 0)
  );
  const minutos =
    modo === 'WALKING'
      ? minutosWalking
      : Math.max(16, Math.min(minutosWalking, minutosTransit));
  return {
    modo,
    minutos,
    distanciaMetros: est.distanciaMetros,
    cuadras: est.cuadrasAprox,
  };
}

export const EVENTOS_FICTICIOS_LEGACY_IDS = new Set([
  'cal-hoy-1',
  'cal-hoy-2',
  'cal-man-1',
  'cal-man-2',
  'cal-pas-1',
]);

export const EVENTOS_FICTICIOS_LEGACY_SUMMARIES = new Set([
  'reunión equipo comunal / zoom',
  'tramite personal en microcentro',
  'trámite personal en microcentro',
  'desayuno de trabajo en belgrano',
  'actividad barrial comuna 14',
  'almuerzo familiar',
]);


