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
 * Limpia sufijos postales y administrativos de Google Maps al pegar una dirección
 * (ej: "Guatemala 5672, C1425BVJ Cdad. Autónoma de Buenos Aires, Argentina" -> "Guatemala 5672")
 * y corrige errores de capitalización como "AutóNoma".
 */
export function limpiarDireccionPegadaMaps(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/Aut[oó]Noma/g, 'Autónoma')
    .replace(/,\s*[A-Z]?\d{4}[A-Z]{0,3}\s+(?:Cdad\.?|Ciudad)\s+Aut[oó]noma\s+de\s+Buenos\s+Aires.*$/i, '')
    .replace(/,\s*(?:Cdad\.?|Ciudad)\s+Aut[oó]noma\s+de\s+Buenos\s+Aires.*$/i, '')
    .replace(/\b[A-Z]\d{4}[A-Z]{3}\b\s*/g, '')
    .replace(/,\s*(?:CABA|Capital\s+Federal|Buenos\s+Aires|Argentina)\s*$/i, '')
    .replace(/,\s*Argentina\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, '')
    .trim();
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
    antesDeParentesis.length <= 52 &&
    !antesDeParentesis.includes('?') &&
    !/respondi[oó]\s+en\s+wa|tengo\s+dni|radicad[oa]/i.test(antesDeParentesis) &&
    !esExpresionFechaOHora(antesDeParentesis) &&
    !esBarrioDeCABA(antesDeParentesis) &&
    !/^(sin\s+respuesta|no\s+contesta|1er\s+mensaje|pidi[oó]\s+m[aá]s\s+info|no\s+tiene\s+domicilio)/i.test(
      antesDeParentesis
    )
  ) {
    const tieneAlturaOCruce =
      /\b(?:al\s+)?\d{3,4}\b/.test(antesDeParentesis) ||
      /\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.]{2,}\s+(?:y|e)\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.]{2,}/.test(
        antesDeParentesis
      ) ||
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
  const esMensajeAutoWA = /respondi[oó]\s+en\s+wa/i.test(rawStr);
  const coordenadasOrdenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
    (a, b) => b.match.length - a.match.length
  );
  for (const item of coordenadasOrdenadas) {
    if (esBarrioDeCABA(item.match)) continue;
    // En transcripciones largas de WhatsApp ("Respondió en WA: ..."), exigir que la coincidencia tenga altura numérica, cruce o punto explícito
    if (
      esMensajeAutoWA &&
      !/\b\d{2,4}\b/.test(item.match) &&
      !/\b(?:y|e)\b/.test(item.match) &&
      !/\b(parque|plaza|estaci[oó]n|chile\s*1408|ecoparque|bot[aá]nico)\b/i.test(item.match)
    ) {
      continue;
    }
    if (comLow.includes(item.match)) {
      const etiquetaLimpia = item.label
        .replace(/\s*\([^)]*\)/g, '')
        .split(',')[0]
        .replace(/\s*\([^)]*$/g, '')
        .trim();
      if (etiquetaLimpia && !esBarrioDeCABA(etiquetaLimpia)) {
        return etiquetaLimpia;
      }
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
    /plaza italia|pza\.?\s*italia|ecoparque|bot[aá]nico|rosedal|el solar|las ca[ñn]itas|huergo\b|godoy cruz|el salvador|honduras|costa rica|nicaragua|soler\b|guatemala\b|fitz roy|bonpland|carranza|ravignani|ravigniani|niceto|g[üu]emes|coronel d[ií]az|salguero|ar[aá]oz|charcas|scalabrini ort[ií]z|malabia|paraguay [345]\d\d\d|paraguay y|thames|uriarte|serrano|gorriti|cabrera|arce\b|b[aá]ez|chenaut|migueletes|cervi[ñn]o|lafinur|borges|gurruchaga|armenia|rep[uú]blica [aá]rabe|segu[ií]|ugarteche|bulnes [23]\d\d\d|vidt|jer[oó]nimo salguero|libertador [234]\d\d\d/i.test(
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

  if (/estaci[oó]n coghlan|pedro ignacio rivera [34]\d\d\d|tronador [23]\d\d\d|nahuel huapi [34]\d\d\d|holmberg [23]\d\d\d/i.test(low)) {
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

  if (/las heras y pueyrred[oó]n|plaza francia|jun[ií]n 1\d\d\d|callao 1\d\d\d|quintana\b|alvear 1\d\d\d|posadas 1\d\d\d|arenales [12]\d\d\d|juncal [12]\d\d\d|french [23]\d\d\d|beruti [23]\d\d\d|pe[ñn]a [23]\d\d\d|pacheco de melo|agote|paraguay [12]\d\d\d|azcu[eé]naga 1\d\d\d|larrea 1\d\d\d|anchorena 1\d\d\d|ecuador 1\d\d\d|ag[üu]ero [12]\d\d\d|gallo 1\d\d\d|s[aá]nchez de bustamante [12]\d\d\d|billinghurst [12]\d\d\d/i.test(low)) {
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
export function esDireccionReconocidaEnCABA(textoDireccion: string): boolean {
  const limpio = (textoDireccion || '').trim();
  if (!limpio || limpio.length < 4) return false;
  const low = limpio.toLowerCase();
  // Si menciona provincia / fuera de CABA explícitamente
  if (
    /\b(provincia|gba|pba|zona norte|zona sur|zona oeste|vicente l[oó]pez|olivos|mart[ií]nez|san isidro|tigre|avellaneda|lan[uú]s|lomas|quilmes|la plata|mor[oó]n|ramos mej[ií]a|caseros pba|san mart[ií]n pba|pilar|escobar)\b/i.test(
      low
    )
  ) {
    return false;
  }
  if (inferirBarrioDesdeDireccionOComentario(limpio, limpio)) return true;
  if (extraerCalleOCruce(limpio).length >= 4) return true;
  // Verificar formato calle + altura o calle y calle
  if (/\b[a-záéíóúñ]{3,}\s+\d{2,4}\b/i.test(limpio)) return true;
  if (/\b[a-záéíóúñ]{3,}\s+(?:y|e\/|esq\.?|esquina)\s+[a-záéíóúñ]{3,}\b/i.test(limpio)) return true;
  return false;
}

export function sincronizarBarrioConDireccionComentario(raw: RawContactRow): RawContactRow {
  const tieneCamposEstructurados =
    raw.diasEncuentro !== undefined ||
    raw.horarioEncuentro !== undefined ||
    raw.horaInicio !== undefined ||
    raw.horaFin !== undefined ||
    raw.calleOCruce !== undefined;

  const comLow = tieneCamposEstructurados
    ? `${raw.calleOCruce || ''}`.toLowerCase()
    : `${raw.calleOCruce || ''} ${raw.comentario || ''}`.toLowerCase();
  if (
    comLow.includes('chile 1408') ||
    /reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(`${raw.calleOCruce || ''} ${raw.comentario || ''}`)
  ) {
    const barrioActualSede = (raw.barrio || '').trim()
      ? normalizarBarrioCABA(raw.barrio)
      : 'Palermo';
    return {
      ...raw,
      barrio: barrioActualSede,
    };
  }

  const calleOCruce = tieneCamposEstructurados
    ? (raw.calleOCruce || '').trim()
    : (raw.calleOCruce || '').trim() || extraerCalleOCruce(raw.comentario);
  if (!calleOCruce) {
    return raw;
  }

  const barrioCorrecto = inferirBarrioDesdeDireccionOComentario(
    calleOCruce,
    tieneCamposEstructurados ? calleOCruce : `${raw.calleOCruce || ''} ${raw.comentario || ''}`
  );
  if (!barrioCorrecto) {
    return {
      ...raw,
      calleOCruce,
    };
  }

  const barrioActual = (raw.barrio || '').trim() ? normalizarBarrioCABA(raw.barrio) : 'Palermo';
  if (barrioCorrecto.toLowerCase() !== barrioActual.toLowerCase()) {
    return {
      ...raw,
      calleOCruce,
      barrio: barrioCorrecto,
      barrioOriginalSheet: raw.barrioOriginalSheet || barrioActual,
      barrioCorregidoPorDireccion: true,
    };
  }

  return {
    ...raw,
    calleOCruce,
    barrio: barrioCorrecto,
  };
}

/**
 * Extrae todas las fechas DD/MM mencionadas en el comentario, incluyendo expresiones compuestas
 * donde varios días comparten el mismo mes (ej: "20 o 21/10", "21 o 22/10", "21 o 23/10", "21 y 22/10", "del 20 al 22/10").
 */

// Caché en memoria de coordenadas y tiempos reales a pie obtenidos vía Google Maps API (/api/geo/walking-distance)
const CACHE_GEOCODE_MAPS = new Map<string, { lat: number; lng: number; exacta: boolean }>();
const CACHE_WALKING_MAPS = new Map<string, { distanciaMetros: number; minutosCaminando: number }>();

export function registrarGeocodeMapsEnCache(
  direccionNormalizada: string,
  lat: number,
  lng: number
): void {
  const key = limpiarDireccionPegadaMaps(direccionNormalizada).toLowerCase();
  if (!key) return;
  CACHE_GEOCODE_MAPS.set(key, { lat, lng, exacta: true });
}

export function registrarWalkingMapsEnCache(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  distanciaMetros: number,
  minutosCaminando: number
): void {
  const key = `${lat1.toFixed(4)},${lng1.toFixed(4)}->${lat2.toFixed(4)},${lng2.toFixed(4)}`;
  const revKey = `${lat2.toFixed(4)},${lng2.toFixed(4)}->${lat1.toFixed(4)},${lng1.toFixed(4)}`;
  CACHE_WALKING_MAPS.set(key, { distanciaMetros, minutosCaminando });
  CACHE_WALKING_MAPS.set(revKey, { distanciaMetros, minutosCaminando });
}

interface TramoCalleCABA {
  patron: RegExp;
  altMin: number;
  latMin: number;
  lngMin: number;
  altMax: number;
  latMax: number;
  lngMax: number;
}

const EJES_CALLES_CABA: TramoCalleCABA[] = [
  { patron: /\bguatemala\b/i, altMin: 4000, latMin: -34.5912, lngMin: -58.4202, altMax: 6000, latMax: -34.5762, lngMax: -58.4395 },
  { patron: /\bparaguay\b/i, altMin: 1000, latMin: -34.5968, lngMin: -58.3812, altMax: 5600, latMax: -34.5778, lngMax: -58.4342 },
  { patron: /\bcharcas\b/i, altMin: 2500, latMin: -34.5948, lngMin: -58.4025, altMax: 5200, latMax: -34.5791, lngMax: -58.4292 },
  { patron: /\bg[üu]emes\b/i, altMin: 2900, latMin: -34.5905, lngMin: -58.4075, altMax: 4900, latMax: -34.5798, lngMax: -58.4258 },
  { patron: /\bsanta\s+fe\b/i, altMin: 1000, latMin: -34.5956, lngMin: -58.3815, altMax: 5300, latMax: -34.5752, lngMax: -58.4325 },
  { patron: /\bcabildo\b/i, altMin: 1, latMin: -34.5735, lngMin: -58.4352, altMax: 4900, latMax: -34.5382, lngMax: -58.4748 },
  { patron: /\bsoler\b/i, altMin: 3200, latMin: -34.5918, lngMin: -58.4115, altMax: 6000, latMax: -34.5775, lngMax: -58.4412 },
  { patron: /\bnica?ragua\b/i, altMin: 4300, latMin: -34.5882, lngMin: -58.4242, altMax: 6000, latMax: -34.5768, lngMax: -58.4408 },
  { patron: /\bcosta\s+rica\b/i, altMin: 3900, latMin: -34.5912, lngMin: -58.4195, altMax: 6000, latMax: -34.5782, lngMax: -58.4422 },
  { patron: /\bel\s+salvador\b/i, altMin: 3800, latMin: -34.5922, lngMin: -58.4185, altMax: 6000, latMax: -34.5790, lngMax: -58.4435 },
  { patron: /\bhonduras\b/i, altMin: 3700, latMin: -34.5932, lngMin: -58.4175, altMax: 6000, latMax: -34.5802, lngMax: -58.4445 },
  { patron: /\bgorriti\b/i, altMin: 3500, latMin: -34.5955, lngMin: -58.4162, altMax: 6000, latMax: -34.5815, lngMax: -58.4455 },
  { patron: /\bcabrera\b/i, altMin: 2900, latMin: -34.5968, lngMin: -58.4085, altMax: 6000, latMax: -34.5828, lngMax: -58.4465 },
  { patron: /\bniceto\s+vega\b/i, altMin: 4600, latMin: -34.5925, lngMin: -58.4315, altMax: 6000, latMax: -34.5838, lngMax: -58.4475 },
  { patron: /\bc[oó]rdoba\b/i, altMin: 1000, latMin: -34.5992, lngMin: -58.3812, altMax: 6000, latMax: -34.5848, lngMax: -58.4485 },
  { patron: /\bscalabrini\s+ort[ií]z\b/i, altMin: 1, latMin: -34.6025, lngMin: -58.4375, altMax: 3300, latMax: -34.5765, lngMax: -58.4095 },
  { patron: /\bmalabia\b/i, altMin: 100, latMin: -34.6015, lngMin: -58.4395, altMax: 2400, latMax: -34.5835, lngMax: -58.4215 },
  { patron: /\barmenia\b/i, altMin: 1100, latMin: -34.5945, lngMin: -58.4315, altMax: 2500, latMax: -34.5822, lngMax: -58.4198 },
  { patron: /\bgurruchaga\b/i, altMin: 100, latMin: -34.6005, lngMin: -58.4425, altMax: 2500, latMax: -34.5825, lngMax: -58.4222 },
  { patron: /\bborges\b/i, altMin: 1600, latMin: -34.5895, lngMin: -58.4292, altMax: 2500, latMax: -34.5815, lngMax: -58.4212 },
  { patron: /\bthames\b/i, altMin: 100, latMin: -34.5995, lngMin: -58.4455, altMax: 2500, latMax: -34.5808, lngMax: -58.4235 },
  { patron: /\buriarte\b/i, altMin: 800, latMin: -34.5945, lngMin: -58.4415, altMax: 2500, latMax: -34.5798, lngMax: -58.4248 },
  { patron: /\bgodoy\s+cruz\b/i, altMin: 1300, latMin: -34.5905, lngMin: -58.4395, altMax: 3300, latMax: -34.5735, lngMax: -58.4212 },
  { patron: /\b(?:sta\.?\s*mar[ií]a\s+de\s+)?oro\b/i, altMin: 1700, latMin: -34.5872, lngMin: -58.4352, altMax: 3100, latMax: -34.5758, lngMax: -58.4218 },
  { patron: /\bdarreagueira\b/i, altMin: 2000, latMin: -34.5842, lngMin: -58.4312, altMax: 3000, latMax: -34.5765, lngMax: -58.4228 },
  { patron: /\bfitz\s+roy\b/i, altMin: 1200, latMin: -34.5905, lngMin: -58.4445, altMax: 2500, latMax: -34.5778, lngMax: -58.4305 },
  { patron: /\bbonpland\b/i, altMin: 1100, latMin: -34.5902, lngMin: -58.4458, altMax: 2500, latMax: -34.5772, lngMax: -58.4318 },
  { patron: /\bcarranza\b/i, altMin: 1200, latMin: -34.5892, lngMin: -58.4465, altMax: 2400, latMax: -34.5772, lngMax: -58.4332 },
  { patron: /\bravignani\b/i, altMin: 1200, latMin: -34.5882, lngMin: -58.4475, altMax: 2400, latMax: -34.5765, lngMax: -58.4345 },
  { patron: /\bar[eé]valo\b/i, altMin: 1300, latMin: -34.5868, lngMin: -58.4478, altMax: 2400, latMax: -34.5758, lngMax: -58.4358 },
  { patron: /\bdorrego\b/i, altMin: 800, latMin: -34.5895, lngMin: -58.4525, altMax: 2700, latMax: -34.5715, lngMax: -58.4315 },
  { patron: /\bcervi[ñn]o\b/i, altMin: 3200, latMin: -34.5825, lngMin: -58.4062, altMax: 4900, latMax: -34.5738, lngMax: -58.4245 },
  { patron: /\blafinur\b/i, altMin: 2900, latMin: -34.5835, lngMin: -58.4125, altMax: 3400, latMax: -34.5785, lngMax: -58.4075 },
  { patron: /\b(?:rep[uú]blica\s+[aá]rabe\s+)?siria\b/i, altMin: 2900, latMin: -34.5832, lngMin: -58.4148, altMax: 3400, latMax: -34.5778, lngMax: -58.4095 },
  { patron: /\bugarteche\b/i, altMin: 2800, latMin: -34.5855, lngMin: -58.4145, altMax: 3400, latMax: -34.5798, lngMax: -58.4085 },
  { patron: /\bsegu[ií]\b/i, altMin: 3400, latMin: -34.5825, lngMin: -58.4135, altMax: 4700, latMax: -34.5755, lngMax: -58.4235 },
  { patron: /\bsalguero\b/i, altMin: 1, latMin: -34.6105, lngMin: -58.4225, altMax: 3200, latMax: -34.5785, lngMax: -58.4035 },
  { patron: /\bbulnes\b/i, altMin: 1, latMin: -34.6102, lngMin: -58.4198, altMax: 3000, latMax: -34.5812, lngMax: -58.4055 },
  { patron: /\bvidt\b/i, altMin: 1600, latMin: -34.5932, lngMin: -58.4138, altMax: 2200, latMax: -34.5878, lngMax: -58.4092 },
  { patron: /\b(?:cnel\.?|coronel)\s+d[ií]az\b/i, altMin: 1400, latMin: -34.5952, lngMin: -58.4112, altMax: 2900, latMax: -34.5825, lngMax: -58.4018 },
  { patron: /\bar[aá]oz\b/i, altMin: 100, latMin: -34.6042, lngMin: -58.4355, altMax: 2900, latMax: -34.5828, lngMax: -58.4142 },
  { patron: /\bjuli[aá]n\s+[aá]lvarez\b/i, altMin: 100, latMin: -34.6052, lngMin: -58.4342, altMax: 2900, latMax: -34.5838, lngMax: -58.4128 },
  { patron: /\bbillinghurst\b/i, altMin: 1, latMin: -34.6095, lngMin: -58.4165, altMax: 2600, latMax: -34.5838, lngMax: -58.4018 },
  { patron: /\bs[aá]nchez\s+de\s+bustamante\b/i, altMin: 1, latMin: -34.6092, lngMin: -58.4145, altMax: 2600, latMax: -34.5835, lngMax: -58.4002 },
  { patron: /\bag[üu]ero\b/i, altMin: 1, latMin: -34.6088, lngMin: -58.4118, altMax: 2500, latMax: -34.5842, lngMax: -58.3982 },
  { patron: /\bgallo\b/i, altMin: 1, latMin: -34.6085, lngMin: -58.4102, altMax: 1700, latMax: -34.5922, lngMax: -58.4032 },
  { patron: /\bpueyrred[oó]n\b/i, altMin: 1, latMin: -34.6085, lngMin: -58.4062, altMax: 2600, latMax: -34.5838, lngMax: -58.3955 },
  { patron: /\blas\s+heras\b/i, altMin: 1600, latMin: -34.5915, lngMin: -58.3905, altMax: 4100, latMax: -34.5785, lngMax: -58.4185 },
  { patron: /\blibertador\b/i, altMin: 1000, latMin: -34.5865, lngMin: -58.3855, altMax: 8500, latMax: -34.5365, lngMax: -58.4655 },
  { patron: /\bb[aá]ez\b/i, altMin: 100, latMin: -34.5725, lngMin: -58.4315, altMax: 800, latMax: -34.5665, lngMax: -58.4375 },
  { patron: /\barce\b/i, altMin: 200, latMin: -34.5728, lngMin: -58.4328, altMax: 900, latMax: -34.5668, lngMax: -58.4392 },
  { patron: /\bmigueletes\b/i, altMin: 500, latMin: -34.5705, lngMin: -58.4335, altMax: 2400, latMax: -34.5545, lngMax: -58.4485 },
  { patron: /\b3\s+de\s+febrero\b/i, altMin: 700, latMin: -34.5715, lngMin: -58.4385, altMax: 4800, latMax: -34.5415, lngMax: -58.4695 },
  { patron: /\b11\s+de\s+septiembre\b/i, altMin: 700, latMin: -34.5708, lngMin: -58.4372, altMax: 4800, latMax: -34.5408, lngMax: -58.4682 },
  { patron: /\bo'?higgins\b/i, altMin: 1300, latMin: -34.5665, lngMin: -58.4445, altMax: 4800, latMax: -34.5418, lngMax: -58.4705 },
  { patron: /\barcos\b/i, altMin: 1300, latMin: -34.5672, lngMin: -58.4458, altMax: 4800, latMax: -34.5425, lngMax: -58.4718 },
  { patron: /\bcuba\b/i, altMin: 1700, latMin: -34.5648, lngMin: -58.4495, altMax: 4800, latMax: -34.5432, lngMax: -58.4728 },
  { patron: /\bvuelta\s+de\s+obligado\b/i, altMin: 1700, latMin: -34.5655, lngMin: -58.4508, altMax: 4800, latMax: -34.5438, lngMax: -58.4738 },
  { patron: /\bciudad\s+de\s+la\s+paz\b/i, altMin: 1, latMin: -34.5752, lngMin: -58.4382, altMax: 3900, latMax: -34.5465, lngMax: -58.4692 },
  { patron: /\bamen[aá]bar\b/i, altMin: 1, latMin: -34.5762, lngMin: -58.4395, altMax: 4100, latMax: -34.5455, lngMax: -58.4708 },
  { patron: /\bmoldes\b/i, altMin: 600, latMin: -34.5732, lngMin: -58.4452, altMax: 4100, latMax: -34.5462, lngMax: -58.4722 },
  { patron: /\bvidal\b/i, altMin: 1400, latMin: -34.5682, lngMin: -58.4525, altMax: 4800, latMax: -34.5435, lngMax: -58.4785 },
  { patron: /\bcr[aá]mer\b/i, altMin: 200, latMin: -34.5785, lngMin: -58.4425, altMax: 4800, latMax: -34.5445, lngMax: -58.4812 },
  { patron: /\bconesa\b/i, altMin: 600, latMin: -34.5755, lngMin: -58.4485, altMax: 4800, latMax: -34.5452, lngMax: -58.4825 },
  { patron: /\bzapiola\b/i, altMin: 600, latMin: -34.5762, lngMin: -58.4498, altMax: 4800, latMax: -34.5458, lngMax: -58.4838 },
  { patron: /\bconde\b/i, altMin: 600, latMin: -34.5768, lngMin: -58.4512, altMax: 4800, latMax: -34.5465, lngMax: -58.4852 },
  { patron: /\bfreire\b/i, altMin: 600, latMin: -34.5775, lngMin: -58.4525, altMax: 4800, latMax: -34.5472, lngMax: -58.4865 },
  { patron: /\blacroze\b/i, altMin: 1600, latMin: -34.5685, lngMin: -58.4365, altMax: 4200, latMax: -34.5855, lngMax: -58.4585 },
  { patron: /\b[aá]lvarez\s+thomas\b/i, altMin: 1, latMin: -34.5835, lngMin: -58.4465, altMax: 3600, latMax: -34.5685, lngMax: -58.4865 },
  { patron: /\btriunvirato\b/i, altMin: 2700, latMin: -34.5855, lngMin: -58.4635, altMax: 6000, latMax: -34.5655, lngMax: -58.4965 },
  { patron: /\bjuramento\b/i, altMin: 1500, latMin: -34.5585, lngMin: -58.4475, altMax: 5500, latMax: -34.5765, lngMax: -58.4865 },
  { patron: /\bmendoza\b/i, altMin: 1500, latMin: -34.5572, lngMin: -58.4462, altMax: 5500, latMax: -34.5752, lngMax: -58.4852 },
  { patron: /\bolaz[aá]bal\b/i, altMin: 1500, latMin: -34.5558, lngMin: -58.4448, altMax: 5500, latMax: -34.5738, lngMax: -58.4838 },
  { patron: /\bblanco\s+encalada\b/i, altMin: 1500, latMin: -34.5545, lngMin: -58.4435, altMax: 5500, latMax: -34.5725, lngMax: -58.4825 },
  { patron: /\bmonroe\b/i, altMin: 1500, latMin: -34.5532, lngMin: -58.4422, altMax: 5500, latMax: -34.5712, lngMax: -58.4812 },
  { patron: /\bcongreso\b/i, altMin: 1500, latMin: -34.5495, lngMin: -58.4525, altMax: 5800, latMax: -34.5675, lngMax: -58.4945 },
  { patron: /\bholmberg\b/i, altMin: 1800, latMin: -34.5715, lngMin: -58.4725, altMax: 4200, latMax: -34.5515, lngMax: -58.4865 },
  { patron: /\bcorrientes\b/i, altMin: 100, latMin: -34.6035, lngMin: -58.3695, altMax: 6500, latMax: -34.5915, lngMax: -58.4515 },
  { patron: /\brivadavia\b/i, altMin: 100, latMin: -34.6082, lngMin: -58.3712, altMax: 7500, latMax: -34.6285, lngMax: -58.4655 },
  { patron: /\bcallao\b/i, altMin: 1, latMin: -34.6092, lngMin: -58.3922, altMax: 2100, latMax: -34.5882, lngMax: -58.3895 },
  { patron: /\bbullrich\b/i, altMin: 1, latMin: -34.5825, lngMin: -58.4295, altMax: 600, latMax: -34.5745, lngMax: -58.4205 },
  { patron: /\bacu[ñn]a\s+de\s+figueroa\b/i, altMin: 100, latMin: -34.6065, lngMin: -58.4265, altMax: 1800, latMax: -34.5905, lngMax: -58.4195 },
  { patron: /\bmedrano\b/i, altMin: 100, latMin: -34.6075, lngMin: -58.4245, altMax: 2000, latMax: -34.5895, lngMax: -58.4165 },
  { patron: /\bmaure\b/i, altMin: 1500, latMin: -34.5675, lngMin: -58.4355, altMax: 4000, latMax: -34.5815, lngMax: -58.4555 },
  { patron: /\bgorostiaga\b/i, altMin: 1500, latMin: -34.5662, lngMin: -58.4368, altMax: 2500, latMax: -34.5725, lngMax: -58.4455 },
  { patron: /\bbesares\b/i, altMin: 1500, latMin: -34.5445, lngMin: -58.4615, altMax: 4800, latMax: -34.5555, lngMax: -58.4885 },
  { patron: /\biber[aá]\b/i, altMin: 1500, latMin: -34.5465, lngMin: -58.4595, altMax: 5500, latMax: -34.5605, lngMax: -58.4925 },
  { patron: /\bgarc[ií]a\s+del\s+r[ií]o\b/i, altMin: 2400, latMin: -34.5495, lngMin: -58.4695, altMax: 4800, latMax: -34.5565, lngMax: -58.4915 },
  { patron: /\bmeli[aá]n\b/i, altMin: 1800, latMin: -34.5695, lngMin: -58.4665, altMax: 4800, latMax: -34.5445, lngMax: -58.4885 },
  { patron: /\blarralde\b/i, altMin: 1500, latMin: -34.5455, lngMin: -58.4585, altMax: 5800, latMax: -34.5635, lngMax: -58.4965 },
  { patron: /\bbalb[ií]n\b/i, altMin: 2300, latMin: -34.5625, lngMin: -58.4625, altMax: 5000, latMax: -34.5485, lngMax: -58.4985 },
];

function interpolarCalleConAlturaCABA(limpio: string): { lat: number; lng: number } | null {
  const matchAltura = limpio.match(/\b(\d{2,4})\b/);
  if (!matchAltura) return null;
  const altura = parseInt(matchAltura[1], 10);
  for (const eje of EJES_CALLES_CABA) {
    if (eje.patron.test(limpio)) {
      const t = Math.max(0, Math.min(1, (altura - eje.altMin) / Math.max(1, eje.altMax - eje.altMin)));
      const lat = Number((eje.latMin + (eje.latMax - eje.latMin) * t).toFixed(5));
      const lng = Number((eje.lngMin + (eje.lngMax - eje.lngMin) * t).toFixed(5));
      return { lat, lng };
    }
  }
  return null;
}

function interpolarCruceCallesCABA(limpio: string): { lat: number; lng: number } | null {
  const limpioNorm = limpio.replace(/\bniceto\b(?!\s+vega)/gi, 'niceto vega');
  const matches = EJES_CALLES_CABA.filter((eje) => eje.patron.test(limpioNorm));
  if (matches.length < 2) return null;
  const e1 = matches[0];
  const e2 = matches[1];
  const x1 = e1.lngMin;
  const y1 = e1.latMin;
  const x2 = e1.lngMax;
  const y2 = e1.latMax;
  const x3 = e2.lngMin;
  const y3 = e2.latMin;
  const x4 = e2.lngMax;
  const y4 = e2.latMax;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) > 1e-9) {
    const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;
    const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;
    if (py >= -34.71 && py <= -34.52 && px >= -58.54 && px <= -58.34) {
      return { lat: Number(py.toFixed(5)), lng: Number(px.toFixed(5)) };
    }
  }
  return {
    lat: Number(((y1 + y2 + y3 + y4) / 4).toFixed(5)),
    lng: Number(((x1 + x2 + x3 + x4) / 4).toFixed(5)),
  };
}

export function geocodificarContactoLocal(
  calleOCruce: string,
  barrio: string,
  id: string = ''
): { lat: number; lng: number; exacta: boolean } {
  const limpio = limpiarDireccionPegadaMaps(calleOCruce || '')
    .toLowerCase()
    .replace(/\bsta\.?\s*fe\b/g, 'santa fe')
    .replace(/\bcnel\.?\b/g, 'coronel')
    .replace(/\bgral\.?\b/g, 'general')
    .trim();

  if (limpio && !esBarrioDeCABA(limpio)) {
    const cached = CACHE_GEOCODE_MAPS.get(limpio);
    if (cached) {
      return cached;
    }

    // 1. Ordenar de mayor a menor longitud de match para que "godoy cruz 3268" tenga prioridad sobre "godoy cruz"
    const ordenadas = [...COORDENADAS_DIRECCIONES_CABA].sort(
      (a, b) => b.match.length - a.match.length
    );
    for (const item of ordenadas) {
      if (limpio.includes(item.match) || (limpio.length >= 6 && item.match.includes(limpio))) {
        return { lat: item.lat, lng: item.lng, exacta: true };
      }
    }

    // 2. Interpolar altura real sobre los ejes de calles de CABA (ej: "Guatemala 5672", "Paraguay 4815", etc.)
    const interpolado = interpolarCalleConAlturaCABA(limpio);
    if (interpolado) {
      return { lat: interpolado.lat, lng: interpolado.lng, exacta: true };
    }

    // 3. Interpolar intersección de 2 calles de CABA (ej: "Fitz Roy y Santa Fe", "Honduras y Coronel Díaz")
    const cruce = interpolarCruceCallesCABA(limpio);
    if (cruce) {
      return { lat: cruce.lat, lng: cruce.lng, exacta: true };
    }
  }

  // Fallback alrededor del centro del barrio: NUNCA marcar exacta: true cuando es un fallback barrial,
  // para evitar triangulaciones falsas de Café HUB o tiempos de caminata inventados.
  const base = COORDENADAS_BARRIOS_CABA[barrio] || COORDENADAS_BARRIOS_CABA.Palermo;
  const numId = parseInt(String(id).replace(/\D/g, ''), 10) || 1;
  const angle = (numId * 137.5 * Math.PI) / 180;
  const radius = 0.002 + (numId % 7) * 0.0008;
  return {
    lat: Number((base.lat + Math.cos(angle) * radius).toFixed(5)),
    lng: Number((base.lng + Math.sin(angle) * radius).toFixed(5)),
    exacta: false,
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
  const barrioInferido = inferirBarrioDesdeDireccionOComentario(dirRaw, dirRaw) || 'Palermo';
  const geo = geocodificarContactoLocal(dirRaw, barrioInferido, '0');
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
  const cacheKey = `${lat1.toFixed(4)},${lng1.toFixed(4)}->${lat2.toFixed(4)},${lng2.toFixed(4)}`;
  const cachedWalking = CACHE_WALKING_MAPS.get(cacheKey);
  if (cachedWalking) {
    return {
      distanciaMetros: cachedWalking.distanciaMetros,
      cuadrasAprox: Math.max(1, Math.round(cachedWalking.distanciaMetros / 100)),
      minutosCaminando: cachedWalking.minutosCaminando,
    };
  }

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
      ? Math.round(lineal * 1.32)
      : Math.round(Math.max(lineal * 1.32, manhattanRotado * 1.06));
  const cuadrasAprox = Math.max(1, Math.round(metrosGrilla / 100));
  // Velocidad efectiva urbana de Google Maps a pie en CABA (~68 m/min incluyendo semáforos y cruces)
  const esperaCrucesMin = metrosGrilla > 900 ? 1.8 : metrosGrilla > 400 ? 1.0 : 0.4;
  const minutosCaminando = Math.max(
    1,
    Math.round((metrosGrilla / 68 + esperaCrucesMin) * 10) / 10
  );
  return { distanciaMetros: metrosGrilla, cuadrasAprox, minutosCaminando };
}


export function tienePuntoEncuentroODireccionDeterminada(input: {
  adhirio?: string;
  estadoFlujo?: EstadoFlujo;
  situacion?: SituacionContacto;
  calleOCruce?: string;
  diasEncuentro?: string;
  fechasMencionadas?: string[];
  retiroConfirmado?: boolean;
  tieneDireccionRealEnComentario?: boolean;
  comentario?: string;
}): boolean {
  const esRetiroFichasConFecha =
    (input.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' || input.situacion === 'RETIRO_FICHAS') &&
    Boolean(input.tieneDireccionRealEnComentario || (input.calleOCruce && input.calleOCruce.trim().length > 0)) &&
    (Boolean(input.retiroConfirmado) ||
      Boolean(input.fechasMencionadas && input.fechasMencionadas.length > 0) ||
      Boolean(input.diasEncuentro && input.diasEncuentro.trim().length > 0) ||
      /\b\d{1,2}\/\d{1,2}\b/.test(input.comentario || ''));

  if (esRetiroFichasConFecha) {
    return true;
  }

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

  // Quienes prefieren pasar por un Punto o Sede (3c) no quieren encuentro particular a domicilio
  // y no deben ser considerados en la planificación de ruta/visitas (salvo el bloque legacy de Chile 1408 sin estado explícito)
  if (
    input.situacion === 'PREFIERE_PUNTO' ||
    (input.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' && input.situacion !== 'EVENTO_CHILE_1408')
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
    input.situacion === 'VISITA_AGENDADA' ||
    input.situacion === 'EVENTO_CHILE_1408'
  ) {
    return true;
  }

  const com = (input.comentario || '').toLowerCase();
  return /\b(chile\s*1408|plaza|pza\.|estaci[oó]n|parque|pqe\.|reuni[oó]n\s*de\s*los\s*mi[eé]rcoles|visita)\b/i.test(
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

export function inferirBarrioDesdeTextoCABA(
  textoODireccion: string,
  barrioFallback = 'Palermo'
): string | null {
  return inferirBarrioDesdeDireccionOComentario(textoODireccion, barrioFallback);
}

export function geocodificarDireccionCABA(
  direccionOCalle: string,
  barrioHint = 'Palermo'
): { lat: number; lng: number; exacto: boolean } {
  const barrioEfectivo =
    inferirBarrioDesdeDireccionOComentario(direccionOCalle, barrioHint) ||
    normalizarBarrioCABA(barrioHint) ||
    'Palermo';
  const geo = geocodificarContactoLocal(direccionOCalle, barrioEfectivo);
  return { lat: geo.lat, lng: geo.lng, exacto: geo.exacta };
}



