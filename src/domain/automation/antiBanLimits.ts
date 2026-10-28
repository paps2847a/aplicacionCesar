import { EstadoFlujo, RawContactRow, TipoPlantillaWA } from '../../types';
import {
  AutoFirstMessageCampaign,
  AutoFirstMessageConfig,
  AutoFirstMessageQueueItem,
  Contact,
  ModoColaAutomatizacionWA,
  NivelWarmupWA,
  ResultadoEnvioAuto,
  VoiceProfile,
} from '../../types';
import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';
import { esCeldaSinNombre, extraerPrimerNombre } from '../contacts/nameCorrection';
import { normalizarTelefonoWA } from '../contacts/phoneUtils';
import { obtenerPartesFechaHoraBA } from '../calendar/availability';
import { corregirPelonesDiaSemanaEnTexto } from '../messaging/greetingsAndTone';
import { obtenerEtiquetaEstadoFlujo, tieneNuevaInformacionEnColumnaG } from '../contacts/contactStatus';
import { generarMensajeContextual } from '../messaging/messageTemplates';
import { sincronizarBarrioConDireccionComentario } from '../geo/cabaLocations';

export const TOPE_MAXIMO_ANTI_BLOQUEO_WA = 44;

/**
 * Devuelve el rango recomendado de cupo diario según el nivel de calentamiento (Warm-up) de la línea.
 * Siempre garantiza un tope estrictamente menor a 45 mensajes.
 */
export function obtenerRangoWarmup(nivel: NivelWarmupWA): {
  minCupo: number;
  maxCupo: number;
  etiqueta: string;
  descripcion: string;
} {
  switch (nivel) {
    case 'DIA_1_MAX_10':
      return {
        minCupo: 7,
        maxCupo: 10,
        etiqueta: 'Día 1 (Calentamiento inicial: 7 a 10 msjs)',
        descripcion: 'Ideal si el número es nuevo o primera vez que automatizás.',
      };
    case 'DIA_2_MAX_15':
      return {
        minCupo: 11,
        maxCupo: 15,
        etiqueta: 'Día 2 (Calentamiento leve: 11 a 15 msjs)',
        descripcion: 'Segundo día de actividad progresiva sin despertar alertas.',
      };
    case 'DIA_3_MAX_25':
      return {
        minCupo: 18,
        maxCupo: 25,
        etiqueta: 'Día 3 (Calentamiento medio: 18 a 25 msjs)',
        descripcion: 'Tercer día de progresión gradual con pausas de café.',
      };
    case 'DIA_4_MAX_35':
      return {
        minCupo: 26,
        maxCupo: 35,
        etiqueta: 'Día 4 (Calentamiento avanzado: 26 a 35 msjs)',
        descripcion: 'Cuarto día con ritmo orgánico consolidado.',
      };
    case 'DIA_5_MADURO_MENOS_45':
    default:
      return {
        minCupo: 28,
        maxCupo: TOPE_MAXIMO_ANTI_BLOQUEO_WA,
        etiqueta: 'Día 5+ (Cuenta activa — Tope seguro < 45 msjs: 28 a 44)',
        descripcion: 'Número personal con historial activo, siempre por debajo de 45 mensajes.',
      };
  }
}

/**
 * Sortea un cupo aleatorio de mensajes estrictamente menor a 45 (entre minCupo y <= 44).
 */
export function sortearCupoSeguroAntiBloqueo(
  minCupo = 28,
  maxCupo = TOPE_MAXIMO_ANTI_BLOQUEO_WA,
  randomFn: () => number = Math.random,
  cupoActualParaEvitar?: number
): number {
  const maxSeguro = Math.min(TOPE_MAXIMO_ANTI_BLOQUEO_WA, Math.max(1, Math.floor(maxCupo)));
  const minSeguro = Math.min(maxSeguro, Math.max(1, Math.floor(minCupo)));
  let sorteado = Math.floor(randomFn() * (maxSeguro - minSeguro + 1)) + minSeguro;
  if (
    cupoActualParaEvitar !== undefined &&
    maxSeguro > minSeguro &&
    sorteado === cupoActualParaEvitar
  ) {
    sorteado = sorteado < maxSeguro ? sorteado + 1 : sorteado - 1;
  }
  return sorteado;
}

/**
 * Elimina cualquier URL o acortador (http, https, www, bit.ly, wa.me) del primer mensaje
 * para evitar disparar las alertas de phishing/spam de Meta en contactos que no te tienen agendado.
 */
export function limpiarUrlsDePrimerMensaje(texto: string): string {
  return texto
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\b(?:www\.|bit\.ly\/|wa\.me\/|t\.me\/)[^\s)]+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Calcula el tiempo de lectura/escritura humana proporcional a la longitud del mensaje
 * (1 segundo cada 15 a 20 caracteres, promedio ~17.5 caracteres/seg).
 */
export function calcularSegundosEscrituraHumana(
  texto: string,
  randomFn: () => number = Math.random
): number {
  const charsPorSegundo = 15 + randomFn() * 5; // entre 15 y 20 chars por segundo
  return Math.max(4, Math.round((texto || '').length / charsPorSegundo));
}

/**
 * Genera una variante polimórfica de PRIMER CONTACTO (Motor Spintax Rioplatense + Anti-Spam):
 * 1. Varía el saludo ("Hola Juan", "¿Qué tal Juan?", "Buen día Juan", "¡Buenas Juan!").
 * 2. Cambia el orden de las frases y alterna sutilmente el uso de emojis (ningún mensaje idéntico al anterior).
 * 3. Cero enlaces/URLs en el primer mensaje.
 * 4. Incluye pregunta sutil anti-desconfianza si falta el nombre en Google Sheets.
 * 5. Incluye frase amigable de Salida Fácil (Opt-Out: "respondé Baja") para evitar que toquen "Reportar spam".
 */
export function generarVariantePolimorficaPrimerContacto(
  contact: {
    sinNombre?: boolean;
    primerNombre: string;
    barrio: string;
    calleOCruce?: string;
  },
  indiceVariante: number,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  incluirOptOutBaja = false,
  modoRompehieloCorto = true
): { saludoUsado: string; texto: string; varianteIndice: number } {
  const esSinNombre = Boolean(contact.sinNombre) || !contact.primerNombre?.trim();
  const nombre = esSinNombre ? '' : contact.primerNombre.trim();
  const promotor = `${profile.nombrePromotor} ${profile.apellidoPromotor}`.trim();
  const espacio = profile.espacioPolitico || 'Hacemos Popurrí';
  const partido = profile.partidoLegal || 'Regeneración';
  const zona = contact.barrio || 'CABA';
  const v = Math.abs(indiceVariante) % 8;

  const saludosConNombre = [
    `Hola, ${nombre}, buen día. ¿Cómo te va?`,
    `Hola, ${nombre}, ¿cómo estás?`,
    `Hola, ${nombre}, buen día, ¿cómo andás?`,
    `Hola, ${nombre}, ¿qué tal? ¿Cómo va?`,
    `Hola, ${nombre}, buenas, ¿cómo estás?`,
    `Hola, ${nombre}, ¿cómo te va?`,
    `Hola, ${nombre}, ¿cómo andás?`,
    `Hola, ${nombre}, muy buen día, ¿cómo estás?`,
  ];

  const saludosSinNombre = [
    `Hola, muy buen día, ¿cómo te va?`,
    `Hola, ¿cómo estás?`,
    `Hola, buen día, ¿cómo andás?`,
    `Hola, ¿qué tal? ¿Cómo va?`,
    `Hola, buenas, ¿cómo estás?`,
    `Hola, ¿cómo te va?`,
    `Hola, ¿cómo andás?`,
    `Hola, buen día, ¿cómo estás?`,
  ];

  const saludoUsado = esSinNombre ? saludosSinNombre[v] : saludosConNombre[v];

  const clausulasOptOut = [
    `\n\n_(Si preferís no recibir más mensajes, respondé "Baja" con confianza)._`,
    `\n\n_(Cualquier cosa, si preferís que no te contacte por acá, respondé "Baja" y te retiro del listado)._`,
  ];
  const textoOptOut = incluirOptOutBaja ? clausulasOptOut[v % clausulasOptOut.length] : '';

  // MODO ROMPEHIELO CORTO CONVERSACIONAL (< 250 caracteres) CON LA VOZ REAL DE CÉSAR:
  // Sin emojis artificiales ni signos de exclamación forzados; tono directo, cálido y rioplatense.
  if (modoRompehieloCorto) {
    if (esSinNombre) {
      const cortosSinNombre = [
        `Soy ${profile.nombrePromotor}, de ${espacio}. Vi tu contacto en el formulario para apoyarnos con la firma de adhesión en ${zona} (no es afiliación). ¿Me recordarías tu nombre así coordinamos 2 min?`,
        `Soy ${profile.nombrePromotor}, del equipo de ${espacio}. Dejaste tu teléfono para acompañar con tu adhesión en ${zona} pero me quedó en blanco tu nombre en la planilla, ¿cómo te llamás así te agendo?`,
        `Te escribe ${profile.nombrePromotor}, de ${espacio} (${partido}). Estoy armando la recorrida por ${zona} para la firma de adhesión (son 2 min, no afiliación). ¿Me dirías tu nombre y apellido para agendarte?`,
        `Soy ${profile.nombrePromotor} de ${espacio}. Te escribo porque te anotaste en el formulario por ${zona} para sumar tu adhesión en papel (2 min). ¿Me recordarías tu nombre y si tenés DNI en CABA?`,
      ];
      return {
        saludoUsado,
        texto: corregirPelonesDiaSemanaEnTexto(
          limpiarUrlsDePrimerMensaje(
            `${saludoUsado} ${cortosSinNombre[v % cortosSinNombre.length]}${textoOptOut}`
          )
        ),
        varianteIndice: v + 1,
      };
    }

    const cortosConNombre = [
      `Soy ${profile.nombrePromotor}, del equipo de ${espacio}. Te escribo porque completaste el formulario para apoyarnos con tu adhesión en ${zona} (no es afiliación, toma 2 min). ¿Preferís que pase por tu cuadra o vernos en un café?`,
      `Soy ${profile.nombrePromotor}, de ${espacio} (${partido}). Esta semana voy a estar recorriendo ${zona} para juntar las firmas de adhesión en papel (son 2 min con DNI de CABA). ¿Qué día y horario te queda cómodo?`,
      `Te escribe ${profile.nombrePromotor}, del equipo de ${espacio}. Vimos que te anotaste para apoyar la creación del partido en ${zona} (es sólo adhesión, no afiliación). ¿Andás por ${zona} esta semana para coordinar 2 minutos?`,
      `Soy ${profile.nombrePromotor} de ${espacio}. Primero gracias por sumarte en el formulario desde ${zona}; lo que firmamos es sólo una adhesión en papel (2 min, no te afilia). ¿Por qué esquina o café de ${zona} te queda cómodo cruzarnos?`,
      `Soy ${profile.nombrePromotor}, del equipo de ${espacio} (${partido}). Estoy organizando la recorrida por ${zona} para las firmas de adhesión (lleva 2 min). ¿Tenés domicilio de CABA en el DNI y qué franja te viene bien?`,
      `Te habla ${profile.nombrePromotor}, de ${espacio}. Te contacto porque dejaste tus datos para acompañar con tu firma de adhesión por ${zona} (no es afiliación). ¿Preferís que pase 2 min por tu puerta o vernos en algún café?`,
      `Soy ${profile.nombrePromotor}, de ${espacio} en CABA. Estamos relevando por ${zona} las firmas de adhesión de quienes completaron el formulario (son 2 min con DNI físico de CABA). ¿Cómo venís de horarios esta semana?`,
      `Soy ${profile.nombrePromotor}, del equipo de ${espacio}. Te escribo para coordinar los 2 minutos de la firma de adhesión en ${zona} (es sólo un aval inicial, no afiliación). ¿Qué día y franja te resulta más práctico?`,
    ];
    return {
      saludoUsado,
      texto: corregirPelonesDiaSemanaEnTexto(
        limpiarUrlsDePrimerMensaje(`${saludoUsado} ${cortosConNombre[v]}${textoOptOut}`)
      ),
      varianteIndice: v + 1,
    };
  }

  if (esSinNombre) {
    const cuerposSinNombre = [
      `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Te escribo porque dejaste tu número en nuestro formulario para acompañar la conformación del partido en ${zona}.\n\nAntes que nada quería darte total tranquilidad: es únicamente una *adhesión* (no es afiliación) para que el espacio pueda presentarse.\n\nAl pasar los teléfonos a mi planilla me quedó en blanco la casilla de tu nombre: ¿me recordarías tu *nombre y apellido* y si tenés domicilio en CABA en el DNI? Así coordinamos 2 minutos por ${zona} cuando te quede cómodo.`,
      `Te escribe ${promotor}, del equipo de *${espacio}* (${partido}). Vi tu contacto registrado en nuestra planilla de vecinos de ${zona} que se anotaron para apoyar con su firma de adhesión.\n\nTe paso el dato rápido para que te quedes tranquilo/a: la firma es sólo una *adhesión ciudadana* (no implica afiliación) y toma apenas 2 minutos en papel.\n\nComo en la fila de la planilla me figuraba sólo tu celular sin el nombre cargado, ¿me dirías tu *nombre y apellido* para agendarte bien y vemos qué día andás por ${zona}?`,
      `Soy ${promotor} del equipo de *${espacio}* (${partido} en CABA). Te contacto a raíz del formulario que completaste para sumar tu firma de adhesión por la zona de ${zona}.\n\nSe hace en 2 minutos con DNI físico de CABA y es 100% una *adhesión* (no es afiliación política). Al descargar el listado se me borró el campo de tu nombre: ¿me contarías tu *nombre y apellido* así te agendo como corresponde y combinamos por ${zona}?`,
      `Soy ${promotor}, parte de *${espacio}* (${partido}). Me comunico porque te anotaste para dar una mano con la firma de la ficha de adhesión en ${zona}.\n\nRecién revisando la planilla noté que quedó tu teléfono cargado pero sin el nombre: ¿me pasarías tu *nombre y apellido* para actualizarlo? Te recuerdo que es sólo una *adhesión* en papel (no afiliación) y lleva 2 minutos con DNI en CABA.`,
    ];
    const cuerpo = cuerposSinNombre[v % cuerposSinNombre.length];
    return {
      saludoUsado,
      texto: corregirPelonesDiaSemanaEnTexto(
        limpiarUrlsDePrimerMensaje(`${saludoUsado} ${cuerpo}${textoOptOut}`)
      ),
      varianteIndice: v + 1,
    };
  }

  const cuerposConNombre = [
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Te escribo porque te anotaste en nuestro formulario para acompañar con tu firma de adhesión en ${zona}.\n\nEs un trámite de 2 minutos en papel (es sólo *adhesión*, no afiliación, y requiere tener domicilio de CABA en el DNI físico). ¿Por qué esquina o punto de ${zona} te queda cómodo que pasemos esta semana y en qué franja horaria?`,
    `Te habla ${promotor} de *${espacio}* (partido en formación *${partido}*). Te contacto porque dejaste tus datos para sumar tu firma de adhesión por ${zona}.\n\nPara tu tranquilidad, firmar la ficha no es afiliarse, sino únicamente avalar que el espacio pueda presentarse en CABA. Toma 2 minutos con DNI físico. ¿Qué día y horario te viene bien por ${zona} para acercarme?`,
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Estoy organizando el recorrido de esta semana por ${zona} para juntar las firmas de quienes completaron el formulario.\n\nLa firma es presencial en papel, lleva 2 minutos y es sólo una *adhesión* (no afiliación), con DNI de CABA. ¿Andás por ${zona} estos días como para coordinar un ratito?`,
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Primero que nada gracias por anotarte para apoyar la conformación del espacio en ${zona}.\n\nComo la Justicia Electoral pide la firma en ficha de papel (con DNI físico en CABA, siendo sólo *adhesión* y no afiliación), esta semana voy a estar pasando por ${zona}. ¿Qué franja horaria y qué calle o café céntrico te quedan más a mano?`,
    `Te escribo de parte de *${espacio}* (${partido}), mi nombre es ${promotor}. Vi que te sumaste en el formulario desde ${zona} para acompañar con tu adhesión.\n\nSon apenas 2 minutos para completar la ficha en papel (no es afiliación, sólo adhesión con DNI en CABA). ¿Cómo venís de horarios esta semana por ${zona} así me organizo y paso?`,
    `Soy ${promotor} de *${espacio}* (${partido}). Te contacto para coordinar los 2 minutos de la firma de adhesión que nos dejaste en el formulario por la zona de ${zona}.\n\nTe recuerdo que es únicamente una *adhesión* ciudadana (no implica afiliación) y necesitamos corroborar domicilio en CABA con el DNI físico. ¿Qué día te queda más cómodo que nos crucemos un minuto por ${zona}?`,
    `Soy ${promotor}, del equipo de *${espacio}* (${partido}). Esta semana vamos a estar relevando las firmas de adhesión pendientes en ${zona}.\n\nEs súper rápido (2 minutos en papel, sólo *adhesión* y no afiliación). ¿Contás con domicilio de CABA en tu DNI y qué franja horaria te resulta más práctica por ${zona}?`,
    `Te saluda ${promotor}, de *${espacio}* (${partido}). Te escribo a raíz de tu registro para acompañar con tu firma de adhesión en ${zona}.\n\nNo te quita más de 2 minutos (es *adhesión*, no afiliación, con DNI físico de CABA). ¿Preferís que pasemos por alguna esquina cerca de tu casa en ${zona} o encontrarnos en un café de la zona?`,
  ];

  const cuerpo = cuerposConNombre[v];
  return {
    saludoUsado,
    texto: corregirPelonesDiaSemanaEnTexto(
      limpiarUrlsDePrimerMensaje(`${saludoUsado} ${cuerpo}${textoOptOut}`)
    ),
    varianteIndice: v + 1,
  };
}

/**
 * Determina si un contacto procesado es elegible para el envío automatizado de PRIMER CONTACTO.
 * Regla estricta: SÓLO personas que aún NO recibieron el primer mensaje (y tienen un teléfono válido).
 */
export function esContactoElegiblePrimerContactoAuto(c: Contact): boolean {
  const telNorm = c.telWA || normalizarTelefonoWA(c.telRaw);
  if (!telNorm || telNorm.length < 8) return false;
  if (c.adhirio === 'Sí' || c.adhirio === 'No') return false;
  if (c.situacion === 'DESCARTADO_NO_CABA') return false;
  if (c.primerContactoEnviado === true) return false;
  return (
    c.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ' ||
    c.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
    c.situacion === 'NUEVO_SIN_PRIMER_MENSAJE' ||
    c.rsp === 'Nuevo'
  );
}

/**
 * Limpia notas de error falsas generadas cuando WhatsApp Web cerró la sesión vinculada
 * (ej. en contactos #168, #169, #170 tras el corte de sesión) para que queden limpios en "1. Sin contactar".
 */
export function limpiarErroresFalsosRestriccionWA(
  rows: RawContactRow[]
): { actualizados: RawContactRow[]; limpiadosCount: number } {
  let limpiadosCount = 0;
  const regexErrorFalso =
    /\[(?:Intento auto fallido|Reintentar envío WA)[^\]]*\]/gi;
  const actualizados = rows.map((r) => {
    const com = r.comentario || '';
    const etq = r.estadoFlujoEtiqueta || '';
    if (
      /\[(?:Intento auto fallido|Reintentar envío WA)[^\]]*\]/i.test(com) ||
      /Reintentar envío/i.test(etq)
    ) {
      limpiadosCount++;
      const limpio = com.replace(regexErrorFalso, '').trim();
      const sinNom = esCeldaSinNombre(r.nombre);
      const estado: EstadoFlujo = sinNom ? 'FALTA_NOMBRE_Y_APELLIDO' : 'SIN_CONTACTAR_1ER_MSJ';
      return {
        ...r,
        rsp: 'Nuevo' as const,
        primerContactoEnviado: false,
        comentario: limpio,
        estadoFlujo: estado,
        estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estado),
      };
    }
    return r;
  });
  return { actualizados, limpiadosCount };
}

export function hhmmASegundos(hhmm: string, fallbackHora = 10, fallbackMin = 30): number {
  const partes = (hhmm || '').split(':').map((n) => parseInt(n, 10));
  const h = Number.isFinite(partes[0]) ? partes[0] : fallbackHora;
  const m = Number.isFinite(partes[1]) ? partes[1] : fallbackMin;
  return h * 3600 + m * 60;
}

export function sumarSegundosAHoraHHMM(horaInicioHHMM: string, segundosTotales: number): string {
  const baseSeg = hhmmASegundos(horaInicioHHMM, 10, 30);
  const segDesdeMedianoche = (baseSeg + Math.max(0, Math.round(segundosTotales))) % 86400;
  const hh = Math.floor(segDesdeMedianoche / 3600);
  const mm = Math.floor((segDesdeMedianoche % 3600) / 60);
  const ss = segDesdeMedianoche % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Construye una campaña programada para el envío automatizado de PRIMEROS MENSAJES con las 8 capas Stealth v2.0:
 * 1. Navegación interna SPA sin page.goto() (evita recargar WhatsApp Web y desconectar el WebSocket en cada chat).
 * 2. Modo Rompehielo Corto (< 220 caracteres, sin frases de bot como "respondé Baja" que disparan el filtro ML de Meta).
 * 3. Filtro de seguridad para números internacionales (+34 España, etc.) en dispositivos vinculados.
 * 4. Intervalos humanos no lineales (65s–150s) + "Pausa de Café" de 12–22 min cada 8–12 mensajes.
 * 5. Límite diario estricto (< 45 mensajes) y niveles de Calentamiento (Warm-up Día 1 a Día 5+).
 * 6. Tiempo de escritura simulada proporcional + tipeo con cadencia variable.
 * 7. Ventana horaria diurna estricta (>= 09:30 a 19:00, prohibido enviar de madrugada como a las 05:30 AM).
 * 8. Circuit Breaker inmediato ante cierre de sesión o restricción + control SQLite idempotente.
 */
export function generarColaEnvioAutomaticoPrimerContacto(
  contacts: Contact[],
  configPartial?: Partial<AutoFirstMessageConfig> & { semillaSorteo?: number },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  randomFn: () => number = Math.random
): AutoFirstMessageCampaign {
  const nivelWarmup: NivelWarmupWA = configPartial?.nivelWarmup || 'DIA_1_MAX_10';
  const rangoWarmup = obtenerRangoWarmup(nivelWarmup);
  const semilla = configPartial?.semillaSorteo ?? 0;

  const minCupo = Math.min(
    TOPE_MAXIMO_ANTI_BLOQUEO_WA,
    Math.max(1, configPartial?.minCupo ?? rangoWarmup.minCupo)
  );
  const maxCupo = Math.min(
    TOPE_MAXIMO_ANTI_BLOQUEO_WA,
    Math.max(minCupo, configPartial?.maxCupo ?? rangoWarmup.maxCupo)
  );
  const cupoSorteado = Math.min(
    TOPE_MAXIMO_ANTI_BLOQUEO_WA,
    Math.max(
      1,
      configPartial?.cupoSorteado
        ? Math.min(TOPE_MAXIMO_ANTI_BLOQUEO_WA, configPartial.cupoSorteado)
        : sortearCupoSeguroAntiBloqueo(minCupo, maxCupo, randomFn)
    )
  );

  const minIntervaloSeg = Math.max(45, configPartial?.minIntervaloSeg ?? 65);
  const maxIntervaloSeg = Math.max(minIntervaloSeg + 15, configPartial?.maxIntervaloSeg ?? 145);
  const lotePausaCafeCada = Math.min(15, Math.max(6, configPartial?.lotePausaCafeCada ?? 8));
  const minPausaCafeMinutos = Math.max(8, configPartial?.minPausaCafeMinutos ?? 12);
  const maxPausaCafeMinutos = Math.max(
    minPausaCafeMinutos,
    configPartial?.maxPausaCafeMinutos ?? 22
  );
  const pausaExtraCada10Seg =
    configPartial?.pausaExtraCada10Seg ?? Math.round(((minPausaCafeMinutos + maxPausaCafeMinutos) / 2) * 60);

  const horaInicio = configPartial?.horaInicio || '10:30';
  const horaVentanaInicio = configPartial?.horaVentanaInicio || '09:30';
  const horaVentanaFin = configPartial?.horaVentanaFin || '19:00';
  // Por defecto desactivamos el pie "respondé Baja" y activamos el Rompehielo Corto (<220 chars)
  // porque en dispositivos vinculados de WhatsApp la frase "respondé Baja" + >500 caracteres activa el filtro anti-bot.
  const incluirOptOutBaja = configPartial?.incluirOptOutBaja ?? false;
  const modoRompehieloCorto = configPartial?.modoRompehieloCorto ?? true;
  const soloNumerosArgentina = configPartial?.soloNumerosArgentina ?? true;
  const usarVariabilidadIAGemini = configPartial?.usarVariabilidadIAGemini ?? true;
  const barrioFiltro = configPartial?.barrioFiltro || 'Todos';
  const modoCola: ModoColaAutomatizacionWA = configPartial?.modoCola || 'PRIMER_CONTACTO';

  const elegiblesBase = contacts.filter((c) => {
    const telNorm = c.telWA || normalizarTelefonoWA(c.telRaw);
    if (!telNorm || telNorm.length < 8) return false;
    if (barrioFiltro !== 'Todos' && c.barrio !== barrioFiltro) return false;
    if (soloNumerosArgentina && !telNorm.startsWith('54')) return false;

    if (modoCola === 'RECORDATORIO_MANIANA_HOY') {
      if (c.adhirio === 'Sí' || c.adhirio === 'No') return false;
      return (
        c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
        c.situacion === 'VISITA_AGENDADA' ||
        c.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE'
      );
    }

    if (modoCola === 'SEGUIMIENTO_24H_48H_BAJA') {
      if (c.adhirio === 'Sí' || c.adhirio === 'No') return false;
      if (c.situacion === 'DESCARTADO_NO_CABA' || c.estadoFlujo === 'DESCARTADO_O_BAJA') return false;
      return (
        c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ||
        c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
        c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
        Boolean(c.seguimiento48h?.aplica)
      );
    }

    if (modoCola === 'AGRADECIMIENTO_POST_FIRMA') {
      if (c.adhirio !== 'Sí') return false;
      return !/agradec|gracias enviada/i.test(c.comentario || '');
    }

    return esContactoElegiblePrimerContactoAuto(c);
  });

  // Si el usuario presionó "Sortear Nuevo Cupo Aleatorio" (`semilla > 0`), rotar la selección dentro de los grupos prioritarios
  let elegibles = elegiblesBase;
  if (semilla > 0 && elegiblesBase.length > 1) {
    const conNombre = elegiblesBase.filter((c) => !c.sinNombre);
    const sinNombre = elegiblesBase.filter((c) => c.sinNombre);
    const rotarGrupo = (arr: Contact[], offset: number): Contact[] => {
      if (arr.length <= 1) return arr;
      const shift = offset % arr.length;
      return [...arr.slice(shift), ...arr.slice(0, shift)];
    };
    elegibles = [
      ...rotarGrupo(conNombre, semilla),
      ...rotarGrupo(sinNombre, Math.max(1, Math.floor(semilla / 2))),
    ];
  }

  const seleccionados = elegibles.slice(0, cupoSorteado);
  let segundosAcumulados = 0;
  const segInicioBase = hhmmASegundos(horaInicio, 10, 30);
  const segVentanaFin = hhmmASegundos(horaVentanaFin, 19, 0);

  const items: AutoFirstMessageQueueItem[] = seleccionados.map((c, idx) => {
    let intervaloSeg = 0;
    let esPausaCafeAntes = false;

    if (idx > 0) {
      const u1 = randomFn();
      const u2 = randomFn();
      const factorNoLineal = (u1 + u2) / 2;
      const baseRandom =
        Math.floor(factorNoLineal * (maxIntervaloSeg - minIntervaloSeg + 1)) + minIntervaloSeg;

      if (idx % lotePausaCafeCada === 0) {
        esPausaCafeAntes = true;
        const pausaCafeSeg =
          Math.floor(
            randomFn() * ((maxPausaCafeMinutos - minPausaCafeMinutos) * 60 + 1)
          ) +
          minPausaCafeMinutos * 60;
        intervaloSeg = baseRandom + pausaCafeSeg;
      } else {
        intervaloSeg = baseRandom;
      }
      segundosAcumulados += intervaloSeg;
    }

    let textoMensajeCola = '';
    let saludoUsadoCola = '';
    let varianteIndiceCola = (idx % 8) + 1;

    if (modoCola === 'RECORDATORIO_MANIANA_HOY') {
      const gen = generarMensajeContextual(c, profile, 'recordatorio_maniana_encuentro');
      textoMensajeCola = gen.texto;
      saludoUsadoCola = 'Recordatorio Mañana (Conversación activa)';
    } else if (modoCola === 'SEGUIMIENTO_24H_48H_BAJA') {
      const plantillaSeg: TipoPlantillaWA =
        (c.intentos || 0) >= 2 && c.rsp === 'No'
          ? 'baja_amable_sin_respuesta'
          : c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP'
          ? 'seguimiento_sin_respuesta'
          : c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' && /\[Propuesta/i.test(c.comentario || '')
          ? 'seguimiento_24h_falta_confirmar'
          : 'seguimiento_24h_falta_dato';
      const gen = generarMensajeContextual(c, profile, plantillaSeg);
      textoMensajeCola = gen.texto;
      saludoUsadoCola = gen.asunto;
    } else if (modoCola === 'AGRADECIMIENTO_POST_FIRMA') {
      const gen = generarMensajeContextual(c, profile, 'agradecimiento_post_firma');
      textoMensajeCola = gen.texto;
      saludoUsadoCola = 'Agradecimiento Post-Adhesión';
    } else {
      const polimorfico = generarVariantePolimorficaPrimerContacto(
        c,
        idx + semilla,
        profile,
        incluirOptOutBaja,
        modoRompehieloCorto
      );
      textoMensajeCola = polimorfico.texto;
      saludoUsadoCola = polimorfico.saludoUsado;
      varianteIndiceCola = polimorfico.varianteIndice;
    }

    const segundosEscritura = calcularSegundosEscrituraHumana(textoMensajeCola, randomFn);
    segundosAcumulados += idx > 0 ? segundosEscritura : 0;

    const segAbsoluto = segInicioBase + segundosAcumulados;
    const fueraDeVentana = segAbsoluto > segVentanaFin;

    return {
      orden: idx + 1,
      contactId: c.id,
      nombre: c.nombreCompletoCorregido || c.nombre || `Sin nombre (${c.telRaw})`,
      primerNombre: c.primerNombre || '',
      sinNombre: Boolean(c.sinNombre),
      barrio: c.barrio,
      telRaw: c.telRaw,
      telefonoNorm: c.telWA || normalizarTelefonoWA(c.telRaw),
      mensajePrimerContacto: textoMensajeCola,
      saludoUsado: saludoUsadoCola,
      varianteIndice: varianteIndiceCola,
      intervaloSegundos: intervaloSeg,
      segundosEscrituraSimulada: segundosEscritura,
      esPausaCafeAntes,
      horaProgramada: sumarSegundosAHoraHHMM(horaInicio, segundosAcumulados),
      fueraDeVentanaHoraria: fueraDeVentana,
      resultado: 'PENDIENTE',
      detalleResultado: fueraDeVentana
        ? `Supera las ${horaVentanaFin} (se pausará y reanudará al día siguiente a las ${horaVentanaInicio})`
        : esPausaCafeAntes
        ? `Incluye Pausa de Café (${Math.round(intervaloSeg / 60)} min) antes de enviar`
        : 'En cola esperando hora programada (Stealth SPA sin recarga)',
      sincronizadoSheets: false,
    };
  });

  return {
    campaignId: `auto-1er-msj-${Date.now()}`,
    creadaEnISO: new Date().toISOString(),
    config: {
      horaInicio,
      horaVentanaInicio,
      horaVentanaFin,
      nivelWarmup,
      minCupo,
      maxCupo,
      cupoSorteado,
      minIntervaloSeg,
      maxIntervaloSeg,
      lotePausaCafeCada,
      minPausaCafeMinutos,
      maxPausaCafeMinutos,
      pausaExtraCada10Seg,
      incluirOptOutBaja,
      modoRompehieloCorto,
      soloNumerosArgentina,
      usarVariabilidadIAGemini,
      barrioFiltro,
      modoCola,
    },
    totalElegiblesEnBase: elegibles.length,
    items,
    estadoCampana: 'LISTA_PARA_EJECUTAR',
  };
}

/**
 * Actualiza automáticamente el contacto en la App y prepara su fila para Google Sheets
 * según el resultado real del envío automatizado (Enviado con éxito, Número inexistente en WhatsApp, o Error de envío).
 */
export function aplicarResultadoEnvioAutoAContacto(
  raw: RawContactRow,
  resultado: ResultadoEnvioAuto,
  detalle?: string,
  fechaHoraISO?: string
): RawContactRow {
  const ahora = fechaHoraISO ? new Date(fechaHoraISO) : new Date();
  const hoyBA = obtenerPartesFechaHoraBA(ahora.getTime());
  const selloFecha = `${hoyBA.ddmm} ${hoyBA.hhmm}`;
  const comentarioSinFallosPrevios = (raw.comentario || '')
    .replace(/\[Intento auto fallido[^\]]*\]/gi, '')
    .trim();

  // Si un envío reportó "Tiempo de espera agotado al abrir el chat" tras haber tipeado, tratarlo como ENVIADO_OK
  const resultadoEfectivo: ResultadoEnvioAuto =
    resultado === 'ERROR_ENVIO' &&
    /Tiempo de espera agotado al abrir el chat/i.test(detalle || '')
      ? 'ENVIADO_OK'
      : resultado;

  if (resultadoEfectivo === 'ENVIADO_OK') {
    const notaAuto = `[1er msj auto enviado ${selloFecha}]`;
    const nuevoComentario = comentarioSinFallosPrevios.includes('[1er msj')
      ? comentarioSinFallosPrevios
      : comentarioSinFallosPrevios
      ? `${comentarioSinFallosPrevios} ${notaAuto}`
      : notaAuto;

    return sincronizarBarrioConDireccionComentario({
      ...raw,
      rsp: raw.rsp === 'Sí' && tieneNuevaInformacionEnColumnaG(comentarioSinFallosPrevios) ? 'Sí' : 'No',
      adhirio: raw.adhirio === 'Sí' ? 'Sí' : 'Pendiente',
      primerContactoEnviado: true,
      fechaPrimerContacto: ahora.toISOString().slice(0, 10),
      ultimoContacto: ahora.toISOString().slice(0, 10),
      intentos: Math.max(1, (raw.intentos || 0) + 1),
      estadoFlujo: '1ER_MSJ_ENVIADO_SIN_RSP',
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP'),
      comentario: nuevoComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  }

  if (resultadoEfectivo === 'NUMERO_INEXISTENTE') {
    const notaInexistente = `No existe en WhatsApp (Detectado auto ${selloFecha})`;
    const nuevoComentario = comentarioSinFallosPrevios.toLowerCase().includes('no existe en whatsapp')
      ? comentarioSinFallosPrevios
      : comentarioSinFallosPrevios
      ? `${comentarioSinFallosPrevios} — ${notaInexistente}`
      : notaInexistente;

    return sincronizarBarrioConDireccionComentario({
      ...raw,
      rsp: 'No',
      adhirio: 'No',
      primerContactoEnviado: true,
      fechaPrimerContacto: ahora.toISOString().slice(0, 10),
      estadoFlujo: 'DESCARTADO_O_BAJA',
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo('DESCARTADO_O_BAJA'),
      comentario: nuevoComentario,
      actualizadoEnAppAt: ahora.toISOString(),
    });
  }

  if (resultadoEfectivo === 'ERROR_ENVIO' || resultadoEfectivo === 'SESION_RESTRINGIDA_ABORTAR') {
    const sinNom = esCeldaSinNombre(raw.nombre);
    const estadoInicial: EstadoFlujo = sinNom
      ? 'FALTA_NOMBRE_Y_APELLIDO'
      : 'SIN_CONTACTAR_1ER_MSJ';

    return sincronizarBarrioConDireccionComentario({
      ...raw,
      rsp: 'Nuevo',
      adhirio: 'Pendiente',
      primerContactoEnviado: false,
      estadoFlujo: estadoInicial,
      estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoInicial),
      comentario: comentarioSinFallosPrevios,
    });
  }

  return raw;
}

/**
 * Exporta el reporte de auditoría de una campaña de envío automático en CSV compatible con Excel.
 */
export function exportarReporteAuditoriaAutoWA(campaign: AutoFirstMessageCampaign): string {
  const header = [
    'Orden',
    '# ID',
    'Nombre',
    'Barrio',
    'Teléfono',
    'Variante Polimórfica',
    'Hora Programada',
    'Intervalo Aleatorio (seg)',
    'Tiempo Escritura Simulada (seg)',
    'Pausa de Café Previa',
    'Resultado del Envío',
    'Detalle / Diagnóstico WhatsApp',
    'Estado Actualizado en Sheets',
    'Fecha/Hora Real',
  ];
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = campaign.items.map((item) => {
    const etiquetaEstado =
      item.resultado === 'ENVIADO_OK'
        ? '2. 1er contacto enviado (Sin respuesta)'
        : item.resultado === 'NUMERO_INEXISTENTE'
        ? '10. Descartado / Baja / N° inexistente'
        : item.resultado === 'ERROR_ENVIO'
        ? '1. Sin contactar (Reintentar envío)'
        : 'En cola';
    return [
      item.orden,
      item.contactId,
      item.nombre,
      item.barrio,
      item.telRaw,
      `Variante #${item.varianteIndice || 1} (${item.saludoUsado || 'Saludo variado'})`,
      item.horaProgramada,
      item.intervaloSegundos,
      item.segundosEscrituraSimulada || 10,
      item.esPausaCafeAntes ? 'Sí (10-20 min)' : 'No',
      item.resultado,
      item.detalleResultado,
      etiquetaEstado,
      item.fechaHoraResultadoISO || '',
    ]
      .map(esc)
      .join(',');
  });
  return '\uFEFF' + [header.join(','), ...rows].join('\n');
}

/**
 * Genera el script completo en Python 3 (`automatizador_wa_popurri.py` STEALTH v2.0) que corrige de raíz
 * las causas por las que WhatsApp restringió el dispositivo vinculado ("Your account on linked devices is restricted right now"):
 * 1. NAVEGACIÓN SPA SIN RECARGA (CERO page.goto por contacto):
 *    En lugar de llamar a `page.goto("https://web.whatsapp.com/send?phone=...")` (que recargaba toda la página,
 *    cortaba el WebSocket y disparaba la alerta de scraping de URLs de Meta), inyecta un enlace interno `<a href="https://wa.me/...">`
 *    dentro del DOM ya abierto para que el router interno de WhatsApp abra el chat en 0.2s SIN recargar la pestaña.
 * 2. STEALTH CHROME REAL (Oculta `navigator.webdriver` y `--enable-automation`):
 *    Usa el navegador Google Chrome real instalado en Windows (`channel="chrome"`) con `--disable-blink-features=AutomationControlled`
 *    y borra la huella `navigator.webdriver`.
 * 3. CIRCUIT BREAKER INMEDIATO (Freno de Emergencia):
 *    Si detecta desconexión, redirección a QR o cartel de restricción de dispositivo vinculado, ABORTA EN EL ACTO
 *    sin intentar los contactos siguientes (#168, #169, #170...) ni ensuciar Google Sheets.
 * 4. BLOQUEO DE MADRUGADA (< 09:00 AM), GUARDIA DE NÚMEROS INTERNACIONALES (+34) Y ENFRIAMIENTO POST-QR:
 *    Impide enviar en horarios de madrugada (como las 05:32 AM) y exige que la sesión vinculada tenga reposo.
 */

