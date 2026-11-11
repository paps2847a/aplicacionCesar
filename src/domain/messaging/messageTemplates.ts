import {
  analizarDisponibilidadColumnaG,
  compararFechaDDMMConHoyBA,
  extraerFechasMencionadas,
  obtenerPartesFechaHoraBA,
  sumarDiasAFechaBA,
} from '../calendar/availability';
import { EstadoFlujo, FranjaHoraria, SituacionContacto } from '../../types';
import {
  Contact,
  DiagnosticoSinRsp48h,
  SubtipoSinRsp48h,
  TipoPlantillaWA,
  VoiceProfile,
} from '../../types';
import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';
import { extraerPrimerNombre } from '../contacts/nameCorrection';
import { extraerCalleOCruce } from '../geo/cabaLocations';
import {
  describirCafeConDistanciaDesdeContacto,
  OpcionesCafeMensaje,
} from '../geo/cafesHub';
import {
  aplicarReglaSaludoMismoDia,
  corregirPelonesDiaSemanaEnTexto,
  postProcesarMensajeAntiPelonesYSaludo,
} from './greetingsAndTone';

export function generarMensajeContextual(
  contact: {
    sinNombre?: boolean;
    primerNombre: string;
    barrio: string;
    calleOCruce: string;
    comentario: string;
    franjaHoraria: FranjaHoraria;
    fechasMencionadas: string[];
    situacion: SituacionContacto;
    estadoFlujo?: EstadoFlujo;
    ultimoContacto?: string;
    fechaPrimerContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    fechaEstadoPuntoSede?: string;
    requiereSeguimientoPuntoSede7d?: boolean;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  plantillaOverride: TipoPlantillaWA = 'auto',
  extra?: OpcionesCafeMensaje
): { tipoUsado: TipoPlantillaWA; asunto: string; texto: string; objetivo: string } {
  const esSinNombre = Boolean(contact.sinNombre) || !contact.primerNombre?.trim();
  const nombre = esSinNombre ? '' : contact.primerNombre.trim();
  const saludoConNombre = esSinNombre ? 'Hola' : `Hola, ${nombre}`;
  const promotor = `${profile.nombrePromotor} ${profile.apellidoPromotor}`.trim();

  const infoCafe = describirCafeConDistanciaDesdeContacto(contact, profile, extra);
  const { incluirCafe, fraseCafe, horarioCafe } = infoCafe;

  const dir = contact.calleOCruce || contact.barrio || 'tu zona';
  const hoyBA = obtenerPartesFechaHoraBA(extra?.ahoraMs ?? Date.now());
  const fechaVigente = contact.fechasMencionadas.find(
    (f) => compararFechaDDMMConHoyBA(f, hoyBA) >= 0
  );
  const fechaCitada =
    fechaVigente ||
    contact.fechasMencionadas[contact.fechasMencionadas.length - 1] ||
    'esta semana';

  // Posdata sutil anti-fraude para cuando falta el nombre en cualquier mensaje de seguimiento
  const posdataSutilNombre = esSinNombre
    ? `\n\n_(De paso te hago una consulta cortita: al pasar los teléfonos del formulario a mi planilla me quedó en blanco la casilla de tu nombre; ¿me recordarías tu *nombre y apellido* así te agendo bien en mi celular?)_`
    : '';

  // Determinar qué plantilla aplicar cuando está en 'auto' según el estado del contacto
  let tipo: TipoPlantillaWA = plantillaOverride;
  if (tipo === 'auto') {
    if (
      contact.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO' ||
      contact.estadoFlujo === 'SIN_CONTACTAR_1ER_MSJ'
    ) {
      tipo = 'primer_contacto';
    } else if (contact.estadoFlujo === 'SEGUNDO_SEGUIMIENTO_SIN_RSP') {
      tipo = 'baja_amable_sin_respuesta';
    } else if (contact.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP') {
      tipo = 'seguimiento_sin_respuesta';
    } else if (contact.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA') {
      tipo = 'seguimiento_cambio_chip';
    } else if (contact.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR') {
      tipo = 'confirmacion_visita';
    } else if (contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') {
      tipo = 'convocatoria_cafe_hub';
    } else if (contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO') {
      tipo = 'en_camino';
    } else if (contact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO') {
      tipo = 'llegando';
    } else if (contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS') {
      tipo = 'retiro_fichas';
    } else if (
      contact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
      contact.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO'
    ) {
      tipo = 'agradecimiento_post_firma';
    } else if (contact.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS') {
      tipo = 'no_caba_referidos';
    } else if (contact.estadoFlujo === 'DESCARTADO_O_BAJA') {
      tipo = 'baja_respetuosa';
    } else {
      switch (contact.situacion) {
        case 'NUEVO_SIN_PRIMER_MENSAJE':
          tipo = 'primer_contacto';
          break;
        case 'SEGUIMIENTO_CAMBIO_CHIP':
          tipo = 'seguimiento_cambio_chip';
          break;
        case 'SEGUIMIENTO_SIN_RESPUESTA':
          tipo = 'seguimiento_sin_respuesta';
          break;
        case 'VISITA_AGENDADA':
          tipo = 'confirmacion_visita';
          break;
        case 'PREFIERE_PUNTO':
          tipo = 'convocatoria_cafe_hub';
          break;
        case 'EVENTO_CHILE_1408':
          tipo = 'confirmacion_visita';
          break;
        case 'PIDIO_MAS_INFO':
          tipo = 'mas_info';
          break;
        case 'SITUACION_SALUD':
          tipo = 'seguimiento_cambio_chip';
          break;
        case 'RETIRO_FICHAS':
          tipo = 'retiro_fichas';
          break;
        case 'YA_ADHIRIO':
          tipo = 'agradecimiento_post_firma';
          break;
        case 'DESCARTADO_NO_CABA':
          tipo = 'no_caba_referidos';
          break;
        default:
          tipo = 'seguimiento_cambio_chip';
      }
    }
  }

  const breve = profile.modoBreve;

  const construirBase = (): {
    tipoUsado: TipoPlantillaWA;
    asunto: string;
    texto: string;
    objetivo: string;
  } => {
    switch (tipo) {
    case 'primer_contacto': {
      const promotorCompleto = /rinc[oó]n/i.test(promotor) ? promotor : `${promotor} Rincón`;
      // CASO ESPECIAL ESTRATÉGICO: Teléfono en Google Sheets sin nombre registrado
      if (esSinNombre) {
        if (breve) {
          return {
            tipoUsado: 'primer_contacto',
            asunto: '1er Contacto para Teléfono Sin Nombre (Sutil y Anti-Desconfianza)',
            objetivo: 'Dar máxima confianza identificándose primero, aclarar que es adhesión (no afiliación), validar DNI CABA y consultar sutilmente nombre, apellido y esquina/café.',
            texto: `Hola, muy buen día, ¿cómo te va? Soy ${promotorCompleto}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque dejaste tu contacto en nuestro formulario para apoyarnos con tu adhesión en CABA. Quería darte la tranquilidad de que lo que firmamos es únicamente una *adhesión* ciudadana para avalar la inscripción legal del partido (${profile.partidoLegal}) y de ninguna manera es una _afiliación_ (no te compromete ni te afilia a nada, e incluso podés firmarla aunque estés afiliado/a a otro espacio).\n\nComo al pasar los datos del formulario me quedó tu número pero salió en blanco la casilla del nombre, ¿me dirías tu *nombre y apellido*? Y contame si tenés *domicilio de CABA en tu DNI físico* y por qué esquina o café de *${contact.barrio || 'la zona'}* (y en qué franja horaria) te queda cómodo que nos crucemos 2 minutos esta semana. Muchas gracias.`,
          };
        }
        return {
          tipoUsado: 'primer_contacto',
          asunto: '1er Contacto Completo para Teléfono Sin Nombre (Sutil y Transparente)',
          objetivo: 'Generar confianza plena, explicar el motivo del mensaje, validar DNI CABA y obtener nombre, apellido y punto de encuentro.',
          texto: `Hola, muy buen día, ¿cómo te va? Soy ${promotorCompleto}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque vimos que dejaste tu teléfono en nuestro formulario para apoyarnos con tu adhesión y ayudarnos a reconstruir lo común en CABA. Antes que nada, quiero darte la total tranquilidad de que lo que vamos a firmar es únicamente una *adhesión* para avalar la creación de nuestro partido (${profile.partidoLegal}), y de ninguna manera es una _afiliación_. Es sólo un aval ciudadano inicial que no genera ningún vínculo partidario ni te compromete a nada.\n\nTe hago una consulta muy cortita: al descargar la planilla del formulario me apareció tu número de WhatsApp pero quedó en blanco la casilla de tu nombre. ¿Me recordarías tu *nombre y apellido* para agendarte bien? Y de paso confirmame por favor si tenés *domicilio de CABA en tu DNI físico* (requisito de la Justicia Electoral) y si preferís que pase dos minutos por tu cuadra en *${contact.barrio || 'el barrio'}* o vernos en un café de la zona. Muchas gracias.`,
        };
      }

      if (breve) {
        return {
          tipoUsado: 'primer_contacto',
          asunto: 'Primer Contacto (Breve y conversacional)',
          objetivo: 'Lograr primera respuesta con confianza, diferenciar adhesión de afiliación, validar DNI en CABA y obtener esquina/franja o café.',
          texto: `Hola, ${nombre}, buen día, ¿cómo estás? Soy ${promotorCompleto}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque completaste el formulario para apoyarnos con tu adhesión en *${contact.barrio || 'CABA'}*. Antes que nada, quería darte la tranquilidad de que lo que firmamos es únicamente una *adhesión* ciudadana para que nos permitan inscribir el partido (${profile.partidoLegal}) y de ninguna manera es una _afiliación_: no te afilia ni te compromete a nada, e incluso podés firmarla sin problema aunque estés afiliado/a a otro espacio.\n\nEsta semana voy a estar recorriendo *${contact.barrio || 'la zona'}* para juntar las firmas en papel (nos toma apenas un momento, unos 2 minutos). Como la Justicia Electoral pide tener *domicilio de CABA en el DNI físico*, ¿me confirmás si tenés DNI en CABA y me contás por qué *calle/esquina* y en qué *franja horaria* te queda cómodo que pase un ratito, o si preferís que nos crucemos en algún café del barrio? Muchas gracias.`,
        };
      }
      return {
        tipoUsado: 'primer_contacto',
        asunto: 'Primer Contacto (Completo)',
        objetivo: 'Presentación completa de Hacemos Popurrí, validación de DNI CABA y coordinación de firma presencial.',
        texto: `Hola, ${nombre}, buen día. ¿Cómo te va? Soy ${promotorCompleto}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque vimos que completaste el formulario para apoyarnos con tu adhesión en *${contact.barrio || 'CABA'}*. Antes que nada, quiero darte la tranquilidad de que lo que vamos a firmar es únicamente una *adhesión* para avalar la creación de nuestro partido (${profile.partidoLegal}), y de ninguna manera es una _afiliación_. Es un apoyo inicial que no te compromete ni te afilia a nada, e incluso podés firmarlo sin problema aunque hoy estés afiliado/a a otro espacio.\n\nEsta semana voy a estar recorriendo *${contact.barrio || 'la zona'}* para juntar las firmas en papel (es un trámite que nos toma apenas un momento, unos dos minutos). Como es requisito excluyente contar con *domicilio de CABA en el DNI físico*, ¿me confirmás si tenés DNI en CABA y me decís por qué *calle/esquina* (y en qué día y franja horaria) preferís que pase un ratito, o si te queda más cómodo que nos encontremos en un café de la zona? Muchas gracias.`,
      };
    }

    case 'seguimiento_cambio_chip': {
      if (contact.situacion === 'SITUACION_SALUD' || /enferm|salud/i.test(contact.comentario)) {
        return {
          tipoUsado: 'seguimiento_cambio_chip',
          asunto: 'Seguimiento Empático (Salud familiar)',
          objetivo: 'Acompañar sin presionar y dejar abierta la puerta para cuando estén mejor.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito antes que nada para saber cómo siguen en casa de salud y ojalá esté todo mucho mejor.\n\nCero apuro con lo nuestro: cuando estés más aliviada/o y te quede cómodo, avisame y me acerco dos minutos por ${contact.barrio || 'tu casa'} cuando te venga bien.${posdataSutilNombre}`,
        };
      }

      const faltaUbicacionTerritorial =
        !contact.calleOCruce ||
        !(contact as { tienePuntoEncuentroDeterminado?: boolean }).tienePuntoEncuentroDeterminado;

      if (faltaUbicacionTerritorial) {
        const opcionCafeSinDir = incluirCafe
          ? `ver si nos queda cómodo cruzarnos en ${fraseCafe} o que pase 2 minutos por tu puerta`
          : `pasar 2 minutos por tu puerta`;
        if (breve) {
          return {
            tipoUsado: 'seguimiento_cambio_chip',
            asunto: 'Seguimiento Estratégico: Obtener Esquina / Punto de Referencia para Mapa (Breve)',
            objetivo: 'Obtener esquina de referencia o dirección en su barrio + días/franja horaria para ubicarlo en el mapa.',
            texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito para organizarnos con tu firma de adhesión en ${contact.barrio || 'la zona'} (recordá que el domicilio impreso en tu DNI físico debe ser de CABA).\n\nPara sumarte al recorrido de esta semana y ${opcionCafeSinDir}: ¿me pasarías una *esquina de referencia o dirección* en ${contact.barrio || 'el barrio'} y en qué *días y franja horaria* solés estar? Gracias.${posdataSutilNombre}`,
          };
        }

        return {
          tipoUsado: 'seguimiento_cambio_chip',
          asunto: 'Seguimiento Estratégico: Obtener Punto de Encuentro o Referencia Territorial (Completo)',
          objetivo: 'Corroborar DNI en CABA y obtener una esquina, referencia o dirección + franja horaria para geolocalizar en el mapa.',
          texto: `${saludoConNombre}, ¿cómo estás? Buenísimo.\n\nAntes de armar el recorrido de esta semana por ${contact.barrio || 'tu barrio'}, te hago dos consultas cortitas:\n1. ¿La última dirección que figura impresa en el dorso de tu DNI físico es de CABA? (La Justicia Electoral exige que el domicilio del documento sea de Capital).\n2. Para ubicarte en el recorrido y ${opcionCafeSinDir}: ¿me pasarías una *esquina de referencia, cuadra aproximada o dirección* por ${contact.barrio || 'el barrio'}, y en qué *día y franja horaria* te queda más cómodo?\n\nCon esa referencia ya nos organizamos. Además, si en casa hay alguien más con DNI en CABA que quiera adherir, llevo fichas extra.${posdataSutilNombre}`,
        };
      }

      const alternativaCafeConDir = incluirCafe
        ? `, o si preferís que nos encontremos en ${fraseCafe}`
        : '';

      if (breve) {
        return {
          tipoUsado: 'seguimiento_cambio_chip',
          asunto: 'Seguimiento "Cambió el chip" (Ya tiene ubicación)',
          objetivo: 'Confirmar día y horario aprovechando la ubicación ya cargada.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito para dejar coordinada tu firma de adhesión en ${contact.barrio || 'la zona'}. ¿Qué día y franja horaria de esta semana te queda más cómodo que pase 2 minutos por *${dir}*${alternativaCafeConDir}? Gracias.${posdataSutilNombre}`,
        };
      }

      return {
        tipoUsado: 'seguimiento_cambio_chip',
        asunto: 'Seguimiento "Cambió el chip" (Confirmar Horario en su Dirección o Café)',
        objetivo: 'Cerrar día y franja horaria sobre el punto de referencia ya detectado.',
        texto: `${saludoConNombre}, ¿cómo estás? Ya te tengo ubicado/a por *${dir}* en ${contact.barrio}.\n\nPara organizar la recorrida de esta semana: ¿en qué *día y franja horaria* te queda más cómodo que pase 2 minutos por *${dir}*${alternativaCafeConDir}? Acordate sólo de tener a mano el DNI físico con domicilio en CABA.${posdataSutilNombre}`,
      };
    }

    case 'seguimiento_sin_respuesta': {
      const mencCafeSinRsp = incluirCafe
        ? `tanto pasando por ${fraseCafe} (${horarioCafe}) como haciendo recorridas rápidas de 2 minutos por domicilio`
        : `haciendo recorridas rápidas de 2 minutos por domicilio`;
      if (breve) {
        return {
          tipoUsado: 'seguimiento_sin_respuesta',
          asunto: 'Seguimiento Suave (+48h sin respuesta al 1er mensaje)',
          objetivo: 'Reactivar contacto identificándose nuevamente porque no respondió al primer mensaje.',
          texto: `${saludoConNombre}, ¿cómo estás? Soy ${profile.nombrePromotor}, de *${profile.espacioPolitico}*.\n\nTe escribo muy cortito para no molestar: como estos días estoy armando el recorrido por ${contact.barrio || 'el barrio'}${incluirCafe ? ` (y también vamos a estar un rato en ${fraseCafe})` : ''}, ¿me dirías qué *esquina de referencia o dirección en ${contact.barrio || 'la zona'}* te queda a mano y en qué horario, así vemos qué opción te resulta más cómoda?\n\nSi esta semana estás complicado/a, avisame sin problema.${posdataSutilNombre}`,
        };
      }
      return {
        tipoUsado: 'seguimiento_sin_respuesta',
        asunto: 'Seguimiento +48h (Obtener Esquina de Referencia Territorial)',
        objetivo: 'Reactivar contacto que no respondió al primer mensaje pidiendo una esquina o proponiendo el café del grupo.',
        texto: `${saludoConNombre}, ¿cómo estás? Espero que estés bien. Soy ${promotor}, de *${profile.espacioPolitico}*.\n\nTe escribo cortito por el mensaje que te dejé hace unos días sobre la firma de adhesión para constituir el partido (${profile.partidoLegal}). Para organizarnos de la forma más práctica para vos en ${contact.barrio}, esta semana vamos a estar ${mencCafeSinRsp}.\n\n¿Me contarías qué *esquina de referencia o dirección de ${contact.barrio}* te queda más cómoda y en qué *días o franja horaria* solés estar? Así coordinamos lo que te quede más a mano. Muchas gracias.${posdataSutilNombre}`,
      };
    }

    case 'confirmacion_visita': {
      if (
        contact.situacion === 'EVENTO_CHILE_1408' ||
        /chile 1408|reuni[oó]n\s+de\s+los\s+mi[eé]rcoles/i.test(contact.comentario)
      ) {
        return {
          tipoUsado: 'confirmacion_visita',
          asunto: 'Confirmación Encuentro de los Miércoles en Chile 1408',
          objetivo: 'Confirmar cruce el miércoles en sede central (Chile 1408) y recordar DNI físico.',
          texto: `${saludoConNombre}, ¿cómo estás? Vi que te sumás a la reunión del miércoles en *Chile 1408* (de 18:30 a 20:00 hs). Yo voy a estar ahí también, así que cuando llegues escribime por acá, nos buscamos y firmamos la ficha en dos minutos (acordate sólo de traer el DNI físico). Nos vemos el miércoles.${posdataSutilNombre}`,
        };
      }

      if (breve) {
        return {
          tipoUsado: 'confirmacion_visita',
          asunto: 'Confirmación de Visita (Breve)',
          objetivo: 'Dejar cerrado el horario/dirección y recordar DNI en mano.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo para dejar confirmado nuestro encuentro (${fechaCitada}) por *${dir}*.\n\nEse día te mando un mensaje unos 10-15 minutos antes de llegar. Cuando nos veamos, acordate por favor de tener el DNI físico a mano (y si en casa hay alguien más con DNI en CABA que quiera firmar, lo sumamos en ese ratito).\n\nNos vemos, muchas gracias.${posdataSutilNombre}`,
        };
      }

      return {
        tipoUsado: 'confirmacion_visita',
        asunto: 'Confirmación de Visita (Completa)',
        objetivo: 'Confirmación detallada con recordatorio de DNI y familiares.',
        texto: `${saludoConNombre}, ¿cómo estás? Perfecto, ya dejamos agendado entonces para el ${fechaCitada} en *${dir}*.\n\nEse día te escribo un ratito antes cuando esté saliendo para allá, unos 10-15 minutos antes de llegar, así te doy tiempo.\n\nPara ese momento sólo te pido tener tu último DNI físico a mano, así copiamos los datos tal cual están impresos (toma apenas dos minutos). Si ahí con vos hay alguien más que tenga domicilio de CABA en el DNI y quiera sumar su firma, también lo hacemos en el momento.\n\nCualquier cosa que te surja de acá a ese día, avisame sin problema.${posdataSutilNombre}`,
      };
    }

    case 'convocatoria_cafe_hub': {
      if (
        contact.situacion === 'EVENTO_CHILE_1408' ||
        /chile\s*1408|reuni[oó]n\s+de\s+los\s+mi[eé]rcoles|reuni[oó]n\s+del\s+partido/i.test(contact.comentario)
      ) {
        return {
          tipoUsado: 'convocatoria_cafe_hub',
          asunto: 'Seguimiento Sede Semanal de los Miércoles en Chile 1408',
          objetivo: 'Invitar/confirmar cruce el miércoles de 18:30 a 20:00 hs en la sede de Chile 1408 (Monserrat) y recordar DNI físico.',
          texto: `${saludoConNombre}, ¿cómo estás? Como me habías comentado que te quedaba cómodo acercarte a nuestra sede de *Chile 1408* (Monserrat), te escribo para contarte que nos reunimos todos los miércoles de *18:30 a 20:00 hs*.\n\n¿Te queda bien pasar este miércoles en esa franja así nos conocemos y firmamos la ficha de adhesión en 2 minutos (acordate sólo de traer tu DNI físico con domicilio en CABA)?${posdataSutilNombre}`,
        };
      }
      if (contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE') {
        return {
          tipoUsado: 'convocatoria_cafe_hub',
          asunto: 'Seguimiento Semanal: Prefiere Pasar por Punto o Sede',
          objetivo: 'Hacer seguimiento a la semana de actualizado a Prefiere Punto / Sede para coordinar punto o pasada rápida.',
          texto: `${saludoConNombre}, ¿cómo estás? Como hace unos días me comentaste que preferías pasar por un punto de encuentro o por la sede, te escribo cortito para contarte las opciones de esta semana:\n\n• En nuestra sede de *Chile 1408* (Monserrat) estamos todos los miércoles de *18:30 a 20:00 hs*.\n• O si esta semana estás por *${contact.barrio || 'el barrio'}* y te resulta más práctico, decime por qué esquina andás y me acerco yo 2 minutos.\n\n¿Qué opción te queda más cómoda (acordate sólo de tener a mano tu DNI físico con domicilio en CABA)?${posdataSutilNombre}`,
        };
      }
      if (!incluirCafe) {
        return {
          tipoUsado: 'convocatoria_cafe_hub',
          asunto: 'Coordinación de Encuentro en el Barrio',
          objetivo: 'Coordinar pasada rápida de 2 minutos por el punto sugerido.',
          texto: `${saludoConNombre}, ¿cómo estás? Te escribo para coordinar los 2 minutos de la firma de adhesión por *${dir}*.\n\n¿En qué día y franja horaria de esta semana te queda más cómodo que pase un ratito (acordate sólo de tener el DNI físico con domicilio en CABA)? Gracias.${posdataSutilNombre}`,
        };
      }
      return {
        tipoUsado: 'convocatoria_cafe_hub',
        asunto: 'Propuesta de Encuentro en Punto del Barrio',
        objetivo: 'Agrupar firmas de vecinos ya contactados en un punto cercano con dirección y tiempo de caminata.',
        texto: `${saludoConNombre}, ¿cómo estás? Como esta semana vamos a vernos con varios vecinos de la zona, quería proponerte encontrarnos unos minutos en ${fraseCafe} durante la franja de *${horarioCafe}* para firmar la ficha de adhesión.\n\nPodés pasar en cualquier momento dentro de esa ventana (toma apenas 2 minutos y sólo hace falta llevar el DNI físico con domicilio en CABA). ¿Te queda cómodo pasar por ahí o preferís que me acerque yo un minuto por *${dir}*?${posdataSutilNombre}`,
      };
    }

    case 'mas_info': {
      if (breve) {
        return {
          tipoUsado: 'mas_info',
          asunto: 'Más Información de Popurrí (Breve y al pie)',
          objetivo: 'Explicar los 5 ejes de Popurrí en CABA y cerrar encuentro de 2 min.',
          texto: `${saludoConNombre}, claro, te cuento un poco más.\n\n*Popurrí* es un espacio nuevo y colectivo con el que buscamos renovar la política desde lo concreto y reconstruir la vida en comunidad. En CABA estamos trabajando en 5 prioridades cotidianas: acceso a la vivienda y alquiler, no perder horas viajando en transporte público, recuperar el encuentro barrial y cultural, apoyar a quienes cuidan a familiares, y sacarle trabas a quienes emprenden y generan trabajo.\n\nPara inscribir legalmente el partido (*${profile.partidoLegal}*), la ley nos pide juntar 4.000 firmas de adhesión en papel (es sólo un aval inicial y no te afilia a nada). Cuando nos crucemos esos 2 minutos para firmar te cuento más —o también podés acercarte a las reuniones de los miércoles en Chile 1408—. ¿Por dónde andás y en qué horario te queda cómodo que nos veamos?${posdataSutilNombre}`,
        };
      }
      return {
        tipoUsado: 'mas_info',
        asunto: 'Más Información de Popurrí (Explicación completa 5 ejes)',
        objetivo: 'Presentar visión humanista, los 5 ejes de CABA y coordinar firma.',
        texto: `${saludoConNombre}, qué bueno que quieras conocer un poco más.\n\nTe cuento brevemente: *Popurrí* es un proyecto colectivo y humanista que nació para reconstruir lo común y volver a hacer que la política funcione. Creemos que antes que el Estado o el mercado está la comunidad, y que la discusión hoy es tener un Estado moderno que resuelva y no estorbe.\n\nEstamos construyendo propuestas concretas a partir de cinco ejes prioritarios para CABA:\n• _Un lugar donde vivir_: que alquilar no sea un privilegio.\n• _Que no pierdas tiempo viajando_: transporte más ágil y confiable.\n• _Recuperar el encuentro_: clubes de barrio, vereda y cultura frente a la soledad.\n• _Poder cuidarnos_: red de apoyo a quienes cuidan hijos, mayores o personas con discapacidad.\n• _Economía de impacto_: menos trabas para emprender y exportar talento.\n\nAhora estamos juntando las firmas de adhesión para constituir el partido (*${profile.partidoLegal}*), que sólo sirven como aval ciudadano y no son una afiliación. ¿Qué día y horario te resulta más cómodo que nos veamos 2 minutos?${posdataSutilNombre}`,
      };
    }

    case 'en_camino': {
      return {
        tipoUsado: 'en_camino',
        asunto: 'Recordatorio del Día / Estoy en Camino (10-15 min antes)',
        objetivo: 'Avisar llegada inminente el día de la visita y recordar DNI físico.',
        texto: `${saludoConNombre}, ¿cómo va? Te aviso que ya estoy en camino para *${dir}*. Calculo estar ahí en unos 10-15 minutos. Cuando bajes, acordate por favor de tener el DNI físico a mano. Nos vemos en un ratito.`,
      };
    }

    case 'llegando': {
      return {
        tipoUsado: 'llegando',
        asunto: 'Estoy Llegando (2 min)',
        objetivo: 'Avisar que ya estás en la esquina/puerta.',
        texto: `${saludoConNombre}. Ya estoy llegando, a 2 minutos de *${dir}*. Cuando puedas bajá tranquilo/a que te espero acá.`,
      };
    }

    case 'demorado': {
      return {
        tipoUsado: 'demorado',
        asunto: 'Aviso de Demora (+10 min)',
        objetivo: 'Cuidar el tiempo de la persona si el transporte o parada previa se atrasó.',
        texto: `${saludoConNombre}. Te aviso que vengo con unos 10 minutos de demora por el transporte, pero ya estoy yendo directo para *${dir}*. Disculpame la demora, nos vemos en un ratito.`,
      };
    }

    case 'retiro_fichas': {
      return {
        tipoUsado: 'retiro_fichas',
        asunto: 'Coordinar Retiro de Fichas Extra (X1/X2/X3)',
        objetivo: 'Retirar fichas firmadas por familiares/amigos en el domicilio.',
        texto: `${saludoConNombre}, ¿cómo estás? Muchas gracias de nuevo por habernos dado una mano juntando fichas.\n\nEsta semana voy a estar recorriendo ${contact.barrio || 'el barrio'} cerca de *${dir}*. ¿Ya tenés listas las fichas para que pase un ratito a retirarlas o qué día te queda más cómodo?`,
      };
    }

    case 'agradecimiento_post_firma': {
      return {
        tipoUsado: 'agradecimiento_post_firma',
        asunto: 'Agradecimiento Post-Firma + Referidos CABA',
        objetivo: 'Cerrar el vínculo con calidez y abrir referidos con DNI en CABA.',
        texto: `${esSinNombre ? 'Hola, quería' : `Hola, ${nombre}. Quería`} escribirte para agradecerte por recibirme y por sumar tu adhesión a *${profile.espacioPolitico}*.\n\nSi en estos días algún familiar, amigo o vecino con DNI en CABA se quiere sumar a firmar, avisame y me acerco en un ratito. Muchas gracias.`,
      };
    }

    case 'no_caba_referidos': {
      return {
        tipoUsado: 'no_caba_referidos',
        asunto: 'Sin DNI en CABA (Pedido amable de referidos)',
        objetivo: 'Agradecer la buena onda y consultar si conoce a alguien con DNI en CABA.',
        texto: `${esSinNombre ? 'Qué lástima.' : `Qué lástima, ${nombre}.`} La Justicia Electoral nos exige que el último domicilio impreso en el DNI físico sea en CABA.\n\nDe todas formas, si conocés a algún amigo, familiar o compañero de trabajo por la zona con DNI en CABA que le interese apoyarnos para constituir el partido (${profile.partidoLegal}), me podés pasar su contacto o darle mi número para que me acerque. Muchas gracias igual por la buena predisposición.`,
      };
    }

    case 'baja_respetuosa': {
      return {
        tipoUsado: 'baja_respetuosa',
        asunto: 'Confirmación de Baja Respetuosa',
        objetivo: 'Dar tranquilidad inmediata de baja definitiva de la lista.',
        texto: `${esSinNombre ? 'No te preocupes.' : `No te preocupes, ${nombre}.`} Te agradezco igual por el tiempo y por avisarme; ya mismo lo dejo anotado acá para no volver a molestarte con este tema. Que tengas muy buen día.`,
      };
    }

    case 'recordatorio_maniana_encuentro': {
      const lugarRec =
        contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' && incluirCafe
          ? fraseCafe
          : `*${dir}*`;
      const resRec = {
        tipoUsado: 'recordatorio_maniana_encuentro' as const,
        asunto: 'Recordatorio a la Mañana antes de Salir (Etapa 6)',
        objetivo: 'Recordar por la mañana que hoy se realiza el encuentro y avisar que le escribirás al estar en camino.',
        texto: `${saludoConNombre}, buen día, ¿cómo estás? Te escribo antes de arrancar el recorrido de hoy por ${contact.barrio || 'la zona'} para recordarte que hoy nos vemos por ${lugarRec} (${fechaCitada}) para los 2 minutos de la firma de adhesión.\n\nTe voy avisando por acá cuando ya esté en camino o a 2 minutos de llegar (acordate por favor de tener a mano el DNI físico con domicilio en CABA). Nos vemos más tarde.${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resRec, contact, tipo, extra);
    }

    case 'esperado_no_estaba_reprogramar': {
      const alternativaCafeNoEstaba = incluirCafe
        ? ` o que nos encontremos unos minutos en ${fraseCafe}`
        : '';
      const resNoEstaba = {
        tipoUsado: 'esperado_no_estaba_reprogramar' as const,
        asunto: 'Esperé un Rato en el Lugar y No Estaba (Reprogramar)',
        objetivo: 'Avisar con amabilidad que estuvimos esperando unos minutos en el punto acordado y proponer reprogramar.',
        texto: `${saludoConNombre}, ¿cómo estás? Recién pasé por *${dir}* y aguardé unos minutos para hacer la firma de adhesión, pero imagino que se te complicó o no llegaste a ver el teléfono.\n\nNo te hagas problema: ¿en qué otro día y franja horaria te queda cómodo que volvamos a coordinar los 2 minutos por *${dir}*${alternativaCafeNoEstaba}?${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resNoEstaba, contact, tipo, extra);
    }

    case 'seguimiento_24h_falta_dato': {
      const faltaDir = !contact.calleOCruce;
      const pedidoPuntual = faltaDir
        ? `una *esquina de referencia o dirección* por ${contact.barrio || 'tu zona'} y en qué *días y franja horaria* te queda más cómodo`
        : `en qué *día y franja horaria* te queda más cómodo que pase 2 minutos por *${dir}*${incluirCafe ? ` (o si preferís acercarte a ${fraseCafe})` : ''}`;
      const res24Dato = {
        tipoUsado: 'seguimiento_24h_falta_dato' as const,
        asunto: 'Seguimiento +24h: Falta Dirección o Franja Horaria',
        objetivo: 'Retomar conversación cuando pasaron 24h sin que la persona comparta dirección o franja horaria.',
        texto: `${saludoConNombre}, ¿cómo estás? Te escribo cortito para poder sumarte al recorrido de esta semana por ${contact.barrio || 'el barrio'}: ¿me pasarías ${pedidoPuntual}? Así ya lo dejo organizado (son 2 minutos con DNI físico de CABA). Gracias.${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(res24Dato, contact, tipo, extra);
    }

    case 'seguimiento_24h_falta_confirmar': {
      const lugarProp = contact.calleOCruce
        ? `pasar 2 minutos por *${contact.calleOCruce}*${incluirCafe ? ` o vernos en ${fraseCafe}` : ''}`
        : incluirCafe
        ? `encontrarnos 2 minutos en ${fraseCafe}`
        : `pasar 2 minutos por *${dir}*`;
      const res24Conf = {
        tipoUsado: 'seguimiento_24h_falta_confirmar' as const,
        asunto: 'Seguimiento +24h: Falta Confirmar Propuesta de Encuentro',
        objetivo: 'Confirmar si a la persona le queda bien el día/franja propuestos hace más de 24 horas.',
        texto: `${saludoConNombre}, ¿cómo va? Te consulto cortito por la propuesta que te dejé ayer para ${lugarProp} (${fechaCitada}): ¿me confirmás si te viene bien ese horario o si preferís que lo pasemos a otro día/franja? Gracias.${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(res24Conf, contact, tipo, extra);
    }

    case 'baja_amable_sin_respuesta': {
      const resBajaAmable = {
        tipoUsado: 'baja_amable_sin_respuesta' as const,
        asunto: 'Último Mensaje Amable: Baja de la Base para No Molestar',
        objetivo: 'Cerrar el seguimiento con total respeto avisando que damos de baja el número para no incomodar.',
        texto: `${saludoConNombre}, ¿cómo estás? Soy ${profile.nombrePromotor}, de *${profile.espacioPolitico}*. Como te escribí un par de veces por la firma de adhesión y no quiero ser pesado ni molestarte, te doy de baja de mi listado de recorridas así no te siguen llegando mensajes.\n\nSi en algún momento más adelante tenés un ratito y querés sumar tu firma en CABA, escribime por acá con total confianza. Muchas gracias igual y que tengas muy buena semana.`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resBajaAmable, contact, tipo, extra);
    }

    case 'disculpas_y_reprogramacion': {
      const lugarSugerido = contact.calleOCruce
        ? `pasar 2 minutos por *${contact.calleOCruce}* (${contact.barrio})`
        : incluirCafe
        ? `encontrarnos 2 minutos en ${fraseCafe}`
        : `pasar 2 minutos por tu cuadra en ${contact.barrio}`;
      const alternativaCafe =
        contact.calleOCruce && incluirCafe
          ? `, o bien encontrarnos unos minutos en ${fraseCafe}`
          : '';
      const resDisc = {
        tipoUsado: 'disculpas_y_reprogramacion' as const,
        asunto: 'Disculpas por Compromiso Pendiente + Propuesta para Reprogramar',
        objetivo: 'Asumir la responsabilidad por no haber podido cumplir con el compromiso previsto y proponer reprogramarlo con naturalidad.',
        texto: `${saludoConNombre}, ¿cómo estás? Te pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${dir}* como habíamos quedado para los 2 minutos de tu firma de adhesión.\n\nQuería proponerte reprogramarlo para los próximos días en ${contact.barrio || 'el barrio'}, pudiendo ${lugarSugerido}${alternativaCafe}. ¿Qué día y franja horaria te queda más cómodo?${posdataSutilNombre}`,
      };
      return postProcesarMensajeAntiPelonesYSaludo(resDisc, contact, tipo, extra);
    }

    case 'propuesta_bloque_agenda':
    default: {
      const lugarPropuesta = contact.calleOCruce
        ? `pasar 2 minutos por *${contact.calleOCruce}* (${contact.barrio})${
            incluirCafe ? ` o encontrarnos en ${fraseCafe}` : ''
          }`
        : incluirCafe
        ? `encontrarnos 2 minutos en ${fraseCafe}`
        : `pasar 2 minutos por tu cuadra en *${contact.barrio || 'el barrio'}*`;
      const resProp = {
        tipoUsado: 'propuesta_bloque_agenda' as const,
        asunto: 'Propuesta de Encuentro de Agenda + Pedido de Confirmación',
        objetivo: 'Compartir propuesta concreta de lugar/horario y pedir confirmación para consolidar la agenda diaria.',
        texto: `${saludoConNombre}, ¿cómo estás? Estoy cerrando el recorrido por *${contact.barrio || 'el barrio'}* y quería proponerte ${lugarPropuesta} para sumar tu firma de adhesión en papel (acordate sólo de tener el DNI físico de CABA a mano).\n\n¿Me confirmás si te queda bien o en qué horario te resulta más cómodo?${posdataSutilNombre}`,
      };
      return resProp;
    }
    }
  };

  return postProcesarMensajeAntiPelonesYSaludo(construirBase(), contact, tipo, extra);
}

export const DIAS_SEMANA_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export const DIAS_SEMANA_MINUSCULA_ES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/**
 * Validador "Anti-Pelones" de Fechas:
 * Detecta en cualquier mensaje expresiones del tipo "<día_de_la_semana> <dd>/<mm>" (ej. "miércoles 23/10" o "Jueves 21/10")
 * y verifica contra el calendario real (por defecto 2026) qué día de la semana cae realmente esa fecha.
 * Si el día de la semana no coincide con la fecha (ej. dice "miércoles 23/10" cuando el 23/10/2026 es viernes),
 * lo corrige automáticamente a "viernes 23/10" conservando mayúsculas/minúsculas.
 */

export function diagnosticarYGenerarMensajeSeguimiento48h(
  params: {
    sinNombre: boolean;
    primerNombre: string;
    barrio: string;
    rsp: 'Sí' | 'No' | 'Nuevo';
    adhirio: 'Sí' | 'Pendiente' | 'No';
    comentario: string;
    calleOCruce: string;
    franjaHoraria: FranjaHoraria;
    fechasMencionadas: string[];
    primerContactoEnviado: boolean;
    horasDesdeUltimoContacto: number;
    intentos: number;
    situacion: SituacionContacto;
    estadoFlujo: EstadoFlujo;
    esVisitaConcretadaORetiro: boolean;
    tieneNuevaInfoEnColumnaG: boolean;
    ultimoContacto?: string;
    fechaPrimerContacto?: string;
    ultimoMensajeCorteEnviadoAt?: string;
    actualizadoEnAppAt?: string;
    enviadoEnSesion?: boolean;
    fechaEstadoPuntoSede?: string;
    requiereSeguimientoPuntoSede7d?: boolean;
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now(),
  opcionesCafe?: OpcionesCafeMensaje
): DiagnosticoSinRsp48h | undefined {
  const wrapDiag = (res: DiagnosticoSinRsp48h | undefined): DiagnosticoSinRsp48h | undefined => {
    if (!res) return undefined;
    return {
      ...res,
      mensajePersonalizado48h: aplicarReglaSaludoMismoDia(
        res.mensajePersonalizado48h,
        params,
        'AUTO_MISMO_DIA',
        ahoraMs
      ),
    };
  };
  const inner = (): DiagnosticoSinRsp48h | undefined => {
  const adh = (params.adhirio || '').toLowerCase().trim();
  if (
    !params.primerContactoEnviado ||
    adh === 'sí' ||
    adh === 'si' ||
    params.situacion === 'DESCARTADO_NO_CABA' ||
    params.situacion === 'NUEVO_SIN_PRIMER_MENSAJE' ||
    params.esVisitaConcretadaORetiro ||
    params.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
    params.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    params.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    params.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
    params.estadoFlujo === 'POSTERGO_SALUD_O_VIAJE' ||
    params.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK' ||
    params.estadoFlujo === 'YA_ADHIRIO_AGRADECIMIENTO_ENVIADO' ||
    params.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    params.estadoFlujo === 'DESCARTADO_O_BAJA'
  ) {
    return undefined;
  }

  const saludo = params.sinNombre ? 'Hola' : `Hola, ${params.primerNombre}`;
  const posdataNombre = params.sinNombre
    ? `\n\n_(De paso te consulto: como al pasar la planilla me quedó en blanco la casilla de tu nombre, ¿me recordarías tu *nombre y apellido* para agendarte bien?)_`
    : '';
  const manianaBA = sumarDiasAFechaBA(ahoraMs, 1);
  const pasadoBA = sumarDiasAFechaBA(ahoraMs, 2);

  const infoCafe = describirCafeConDistanciaDesdeContacto(
    {
      barrio: params.barrio,
      calleOCruce: params.calleOCruce,
      lat: params.lat,
      lng: params.lng,
    },
    profile,
    opcionesCafe
  );
  const { incluirCafe, fraseCafe } = infoCafe;
  const horarioCafe =
    opcionesCafe?.horarioTexto ||
    profile.cafesPorBarrio[params.barrio]?.horariosSugeridos ||
    `${manianaBA.nombreDia} ${manianaBA.ddmm} o ${pasadoBA.nombreDia} ${pasadoBA.ddmm} de 15:00 a 18:00 hs`;

  const comLow = (params.comentario || '').toLowerCase().trim();
  const tieneDir = Boolean(params.calleOCruce && params.calleOCruce.trim().length > 0);
  const tieneFechas = params.fechasMencionadas.length > 0;
  const tieneFranja = params.franjaHoraria !== 'Flexible';

  // 1. CASO: Se agregó algún dato en la Columna G ("Comentario"), pero es INSUFICIENTE para concretar encuentro
  // (En todos estos subcasos ya hubo conversación previa con la persona, por lo que NO se vuelve a decir "Soy César...")
  if (params.tieneNuevaInfoEnColumnaG) {
    // 1S. Si el comentario menciona Chile 1408 o la reunión de los miércoles, invitar a la Sede Central en Monserrat (y nunca a un café barrial)
    if (/chile\s*1408|reuni[oó]n\s+de\s+los\s+mi[eé]rcoles|reuni[oó]n\s+del\s+partido/i.test(comLow)) {
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_PREFIERE_PUNTO_FALTA_CONFIRMAR_HUB',
        etiquetaCorta: 'Sede Chile 1408: confirmar miércoles 18:30 hs',
        motivoDetallado: `En Columna G figura "${params.comentario}", indicando interés en acercarse a la sede de Chile 1408 (Monserrat).`,
        infoDisponibleResumen: `Sede Central: Chile 1408 (Monserrat) · Miércoles 18:30 a 20:00 hs`,
        datoFaltanteResumen: 'Confirmar asistencia este miércoles a Chile 1408',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Como tenía anotado que te interesaba acercarte a nuestra sede en *Chile 1408* (Monserrat), te escribo para contarte que nos reunimos todos los miércoles de *18:30 a 20:00 hs*.\n\n¿Te queda bien venir este miércoles en ese horario así nos conocemos y firmamos tu ficha de adhesión en 2 minutos (acordate sólo de traer tu DNI físico con domicilio en CABA)?${posdataNombre}`,
      };
    }

    // 1A. Tiene dirección y franja horaria en Col. G (ej: "Visita cualquier día luego de las 18:00 (Caracas 5581)" o "CONFIRMAR Visita..."), pero falta confirmar el día exacto
    if (tieneDir && (tieneFranja || /cualquier\s+d[ií]a|confirmar/i.test(comLow)) && !tieneFechas) {
      const textoFranja =
        params.franjaHoraria === 'Vespertino'
          ? 'después de las 18:00 hs'
          : params.franjaHoraria === 'Mañana'
          ? 'por la mañana (entre 10:00 y 12:30 hs)'
          : params.franjaHoraria === 'Mediodía'
          ? 'al mediodía (entre 12:30 y 14:30 hs)'
          : params.franjaHoraria === 'Tarde'
          ? 'por la tarde (entre 15:00 y 18:00 hs)'
          : 'en el horario que te quede más cómodo';
      const altCafe1A = incluirCafe ? `, o si preferís que nos encontremos en ${fraseCafe}` : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_DIRECCION_Y_FRANJA_FALTA_DIA',
        etiquetaCorta: 'Col. G incompleta: falta confirmar día exacto',
        motivoDetallado: `En Columna G figura ubicación (${params.calleOCruce}) y disponibilidad (${params.franjaHoraria}), pero sin día puntual confirmado.`,
        infoDisponibleResumen: `Dirección: ${params.calleOCruce} (${params.barrio}) · Franja: ${params.franjaHoraria}`,
        datoFaltanteResumen: 'Confirmar día exacto del encuentro (ej. mañana o pasado)',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo porque tenía anotado que podías recibirnos por *${params.calleOCruce}* (${params.barrio}) *${textoFranja}*, pero nos faltó dejar confirmado qué día puntual.\n\n¿Te queda cómodo que pase mañana *${manianaBA.nombreDia} ${manianaBA.ddmm}* o el *${pasadoBA.nombreDia} ${pasadoBA.ddmm}* en esa franja de ${textoFranja} (son apenas 2 minutos con tu DNI físico de CABA)${altCafe1A}?${posdataNombre}`,
      };
    }

    // 1B. Tiene sólo dirección o punto en Col. G (ej: "(El Salvador 5778)", "(Ecoparque)", "(Santiago del Estero 453)"), pero falta día y franja horaria
    if (tieneDir && !tieneFechas && !tieneFranja) {
      const altCafe1B = incluirCafe
        ? `, o preferís que nos encontremos unos minutos en ${fraseCafe}`
        : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_SOLO_DIRECCION_FALTA_DIA',
        etiquetaCorta: 'Col. G incompleta: tiene dirección, falta día/hora',
        motivoDetallado: `En Columna G figura "${params.calleOCruce}" (${params.barrio}), pero falta acordar el día y la franja horaria para concretar el encuentro.`,
        infoDisponibleResumen: `Ubicación en Col. G: ${params.calleOCruce} (${params.barrio})`,
        datoFaltanteResumen: 'Día y franja horaria (o confirmar café cercano)',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo cortito porque tengo agendada tu ubicación por *${params.calleOCruce}* (${params.barrio}) para sumar tu firma de adhesión en papel, pero nos quedó pendiente definir qué día y horario te viene bien.\n\n¿Te queda cómodo que pase 2 minutos por *${params.calleOCruce}* mañana *${manianaBA.nombreDia} ${manianaBA.ddmm}* o el *${pasadoBA.nombreDia} ${pasadoBA.ddmm}* (y en qué horario)${altCafe1B}?${posdataNombre}`,
      };
    }

    // 1C. Tiene fecha o mención de día en Col. G (ej: "Visita 22/10" o "Pidió que le escribiera el lunes 19/10"), pero FALTA la dirección o punto de encuentro
    if (!tieneDir && (tieneFechas || /visita|escribiera|semana/i.test(comLow))) {
      const refFecha = params.fechasMencionadas[0]
        ? `para el *${params.fechasMencionadas[0]}*`
        : 'para esta semana';
      const altCafe1C = incluirCafe
        ? ` O si preferís no esperar en casa, también podemos vernos en ${fraseCafe} (${horarioCafe}).`
        : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_SOLO_FECHA_FALTA_DIRECCION',
        etiquetaCorta: 'Col. G incompleta: tiene fecha, falta dirección/café',
        motivoDetallado: `En Columna G figura "${params.comentario}", pero no hay calle/altura ni café confirmado en ${params.barrio}.`,
        infoDisponibleResumen: `Nota temporal en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Calle/esquina en el barrio o confirmar encuentro en café',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo tal cual habíamos quedado (${refFecha}) para coordinar los 2 minutos de tu firma de adhesión en *${params.barrio}*.\n\nPara armar el recorrido, ¿me pasarías por qué *calle/altura o esquina* de ${params.barrio} te queda cómodo que pase y en qué horario?${altCafe1C}${posdataNombre}`,
      };
    }

    // 1D. Expresó preferencia por ir a un punto / fds / reunión de los miércoles, pero aún no confirmó a qué café ni en qué día/horario
    if (/punto|fds|fin de semana|mi[eé]rcoles|plaza/i.test(comLow)) {
      const mencionaMiercoles = /mi[eé]rcoles/i.test(comLow);
      const altCafe1D = incluirCafe
        ? `en ${fraseCafe}`
        : `pasando 2 minutos por tu cuadra en *${params.barrio}*`;
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_PREFIERE_PUNTO_FALTA_CONFIRMAR_HUB',
        etiquetaCorta: 'Col. G incompleta: falta confirmar punto / horario',
        motivoDetallado: `En Columna G figura "${params.comentario}", pero aún no se cerró el punto de encuentro ni el horario concreto.`,
        infoDisponibleResumen: `Preferencia en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Confirmar asistencia al café / Sede o pasar por domicilio',
        mensajePersonalizado48h: mencionaMiercoles
          ? `${saludo}, ¿cómo estás? Como me habías comentado que te interesaba acercarte a la reunión de los miércoles en *${profile.sedeCentral}*, te escribo para consultarte si este miércoles a las 18:30 hs te queda bien venir (así aprovechamos y firmamos tu ficha de adhesión en 2 minutos con el DNI físico), o si preferís que nos veamos en *${params.barrio}* (${altCafe1D}). ¿Qué te queda más cómodo?${posdataNombre}`
          : `${saludo}, ¿cómo estás? Como tenía anotado que preferías acercarte a un punto de encuentro por *${params.barrio}*, te cuento que vamos a estar juntándonos con varios vecinos de la zona ${
              incluirCafe ? `en ${fraseCafe} durante la franja de *${horarioCafe}*` : `por *${params.barrio}* (${horarioCafe})`
            }.\n\n¿Me confirmás si te queda cómodo pasar 2 minutos en esa ventana (acordate sólo de traer tu DNI físico con domicilio en CABA), o si preferís que pase yo un ratito por tu cuadra?${posdataNombre}`,
      };
    }

    // 1E. Pidió más información en Col. G ("Pidió más info. Se la compartí"), falta confirmar DNI CABA y encuentro
    if (/pidi[oó]\s+m[aá]s\s+info|mas\s+info/i.test(comLow)) {
      const opcionLugar1E = incluirCafe
        ? `¿preferís que nos crucemos un ratito en ${fraseCafe} o me pasás tu calle/esquina en *${params.barrio}* y paso yo 2 minutos?`
        : `¿me pasás tu calle o esquina en *${params.barrio}* y en qué horario te queda cómodo que pase 2 minutos?`;
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_PIDIO_MAS_INFO_FALTA_COORDINAR',
        etiquetaCorta: 'Col. G incompleta: recibió info, falta coordinar encuentro',
        motivoDetallado: `En Columna G figura "${params.comentario}", pero aún no confirmó dirección ni punto para firmar.`,
        infoDisponibleResumen: `Estado en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Verificar DNI CABA y definir dirección o café',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo cortito para saber si pudiste ver la información que te compartí sobre los 5 ejes de Popurrí en CABA y para ver si esta semana podemos coordinar los 2 minutos de tu firma de adhesión (recordá que es sólo un aval para constituir el partido *${profile.partidoLegal}* y no afilia a nada).\n\nSi el domicilio impreso en tu DNI es de CABA, ${opcionLugar1E}${posdataNombre}`,
      };
    }

    // 1F. Situación de salud o postergación en Col. G ("Su hija está enferma")
    if (/enferm|salud/i.test(comLow)) {
      const altCafe1F = incluirCafe ? ` o si te queda cómodo cruzarnos en ${fraseCafe}` : '';
      return {
        aplica: true,
        subtipo: 'DATO_INSUFICIENTE_POSTERGO_SALUD_O_VIAJE',
        etiquetaCorta: 'Col. G en espera: seguimiento empático (salud)',
        motivoDetallado: `En Columna G figura "${params.comentario}". Requiere seguimiento empático para saber cómo siguen y reprogramar sin presión.`,
        infoDisponibleResumen: `Nota en Col. G: "${params.comentario}" (${params.barrio})`,
        datoFaltanteResumen: 'Consultar cómo siguen en casa y coordinar cuando les quede cómodo',
        mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo muy cortito antes que nada para saber cómo siguen en casa de salud y ojalá esté todo mucho mejor.\n\nCero apuro con la firma: cuando estés más aliviado/a, avisame si preferís que pase 2 minutos por tu puerta en *${params.barrio}*${altCafe1F}.${posdataNombre}`,
      };
    }

    // Cualquier otro dato parcial en Col. G que no completó visita
    const altCafe1G = incluirCafe
      ? ` —ya sea encontrándonos en ${fraseCafe} o pasando por tu cuadra—`
      : ` pasando 2 minutos por tu cuadra`;
    return {
      aplica: true,
      subtipo: 'DATO_INSUFICIENTE_SOLO_DIRECCION_FALTA_DIA',
      etiquetaCorta: 'Col. G con dato parcial: falta cerrar lugar/horario',
      motivoDetallado: `Tiene nota en Columna G ("${params.comentario}") pero aún es insuficiente para concretar la visita o encuentro.`,
      infoDisponibleResumen: `Comentario en Col. G: "${params.comentario}" (${params.barrio})`,
      datoFaltanteResumen: 'Confirmar dirección/café y franja horaria',
      mensajePersonalizado48h: `${saludo}, ¿cómo estás? Estaba revisando las notas para organizar la recorrida por *${params.barrio}* y quería consultarte qué día y horario te queda más cómodo esta semana para que nos veamos 2 minutos${altCafe1G} y sumemos tu firma de adhesión con el DNI físico.${posdataNombre}`,
    };
  }

  // 2. CASO: No tiene datos en Columna G y RSP sigue en "No" tras +48h desde que se le escribió por primera vez
  // (AQUÍ SÍ se incluye quién soy: "Soy César, de Hacemos Popurrí", porque la persona no respondió al primer mensaje)
  if (params.rsp === 'No' && params.horasDesdeUltimoContacto >= 48) {
    const propuestaLugarSinRsp = incluirCafe
      ? `tanto encontrándonos con vecinos de la zona en ${fraseCafe} (${horarioCafe}) como haciendo pasadas rápidas de 2 minutos por domicilio`
      : `haciendo pasadas rápidas de 2 minutos por domicilio`;
    const preguntaFinalSinRsp = incluirCafe
      ? `¿Te queda bien pasar un ratito por el café o preferís que pase yo 2 minutos por tu cuadra?`
      : `¿Por qué esquina o cuadra de *${params.barrio}* te queda cómodo que pase 2 minutos y en qué horario?`;
    return {
      aplica: true,
      subtipo: 'SIN_RSP_DESDE_1ER_MSJ',
      etiquetaCorta: `Sin respuesta al 1er msj (+${params.horasDesdeUltimoContacto}h)`,
      motivoDetallado: `Se le envió el 1er mensaje hace ${params.horasDesdeUltimoContacto}h, la Columna E ("RSP") sigue en "No" y la Columna G está vacía.`,
      infoDisponibleResumen: `Barrio: ${params.barrio} · Col. E (RSP): No · Sin datos en Col. G`,
      datoFaltanteResumen: 'Respuesta inicial: coordinar encuentro en café del grupo o pasada de 2 min en puerta',
      mensajePersonalizado48h: `${saludo}, ¿cómo estás? Espero que estés bien. Soy ${profile.nombrePromotor}, de *${profile.espacioPolitico}*.\n\nTe escribo muy cortito por el mensaje que te dejé hace unos días sobre la firma de adhesión para constituir el partido (*${profile.partidoLegal}*). Para que sea práctico y no tengas que esperar en casa, esta semana vamos a estar en *${params.barrio}* ${propuestaLugarSinRsp}.\n\n${preguntaFinalSinRsp} Cualquier cosa avisame sin compromiso.${posdataNombre}`,
    };
  }

  // 3. CASO: Cambió RSP a "Sí", ya se le hizo un seguimiento (intentos >= 2) y pasaron +48h sin cargar datos en Columna G
  // (Ya respondió previamente, por lo que NO se vuelve a presentar con "Soy César...")
  if (params.rsp === 'Sí' && params.intentos >= 2 && params.horasDesdeUltimoContacto >= 48) {
    const preguntaRspSi = incluirCafe
      ? `¿te queda más cómodo acercarte 2 minutos a ${fraseCafe} o me pasás tu calle/esquina y qué horario te viene bien para que pase?`
      : `¿me pasás tu calle o esquina de referencia y qué horario te viene bien para que pase 2 minutos?`;
    return {
      aplica: true,
      subtipo: 'RSP_SI_SIN_AVANCE_48H',
      etiquetaCorta: `RSP: Sí sin datos en Col. G (+${params.horasDesdeUltimoContacto}h)`,
      motivoDetallado: `Respondió "Sí" en Columna E, pero tras ${params.horasDesdeUltimoContacto}h del seguimiento aún no pasó dirección ni horario para Columna G.`,
      infoDisponibleResumen: `Barrio: ${params.barrio} · Col. E (RSP): Sí · Col. G vacía`,
      datoFaltanteResumen: 'Confirmar DNI CABA y calle/esquina o café',
      mensajePersonalizado48h: `${saludo}, ¿cómo estás? Te escribo cortito para retomar lo que charlamos y organizarnos por *${params.barrio}*: si el último domicilio impreso en tu DNI es de CABA, ${preguntaRspSi}${posdataNombre}`,
    };
  }

  return undefined;
  };
  return wrapDiag(inner());
}

/**
 * Calcula automáticamente el resumen de las 6 tarjetas operativas en base a la información
 * sincronizada de Google Sheets y los datos ingresados a través de la app:
 * 1. SIN 1ER MSJ (`nuevosSinMensaje`): nuevos ingresos en Google Sheets (#167+ o filas nuevas) sin 1er mensaje enviado.
 * 2. PENDIENTES (`pendientesActivos`): personas en el Google Sheets que NO han adherido según la Columna "F" ("Adhirió" !== "Sí").
 * 3. RSP: SÍ (`cambioChip`): personas que respondieron según la Columna "E" ("RSP" = "Sí"), que NO han adherido aún,
 *    que NO tienen todavía ninguna nueva información cargada en la Columna "G" ("Comentario") y que NO se les ha enviado confirmación de encuentro.
 * 4. SIN RSP +48H (`sinRespuesta`): personas determinadas por marca temporal (+48h desde el 1er mensaje sin cambio en RSP,
 *    o con algún dato en la Columna "G" "Comentario" que es insuficiente para concretar un encuentro o convocarlo a un Café HUB).
 * 5. VISITAS / X2 (`visitasYRetiros`): visitas ya concretadas con todos los datos necesarios para hacerlas + pendientes para el retiro de fichas extras (X1/X2/X3).
 * 6. FIRMADAS (`adheridos`): cantidad determinada por el estatus "Sí" de la Columna "F" ("Adhirió"), sosteniendo su exclusión del mapa activo.
 */

export function adaptarMensajeConRespuestaVecinoLocal(
  contact: Contact,
  respuestaVecinoOInstruccion: string,
  mensajeActual?: string,
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE
): string {
  const instruccion = (respuestaVecinoOInstruccion || '').trim();
  const baseMsg = (mensajeActual || contact.mensajeSugerido || '').trim();
  const saludo = contact.sinNombre
    ? 'Hola, ¿cómo estás?'
    : `Hola, ${contact.primerNombre}, ¿cómo estás?`;
  const calleExistente = (contact.calleOCruce || '').trim();
  const calleExtraidaDeRespuesta = extraerCalleOCruce(instruccion);
  const calleEfectiva = calleExtraidaDeRespuesta || calleExistente;
  const tieneCalleReal = Boolean(calleEfectiva && calleEfectiva.length > 0);
  const lugar = calleEfectiva || contact.barrio || 'tu zona';
  const infoCafe = describirCafeConDistanciaDesdeContacto(contact, profile);
  const posdataNombre = contact.sinNombre
    ? '\n\n_(De paso, recordame por acá tu nombre y apellido así te agendo bien en la planilla)_.'
    : '';
  const finalizar = (txt: string) => aplicarReglaSaludoMismoDia(txt, contact, 'AUTO_MISMO_DIA');

  if (!instruccion) {
    return finalizar(baseMsg);
  }

  // 1) Si pide acortar en 2-3 líneas directas
  if (/acort[aá]r|m[aá]s\s+corto|2-3\s+l[ií]neas|2\s+oraciones|breves|resum/i.test(instruccion)) {
    if (contact.alertaVencido?.activa) {
      return finalizar(
        `${saludo} Te pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}*. ¿Qué día y franja horaria de esta semana te queda cómodo para reprogramar esos 2 minutos con tu DNI físico de CABA?${posdataNombre}`
      );
    }
    if (tieneCalleReal || contact.tienePuntoEncuentroDeterminado) {
      return finalizar(
        infoCafe.incluirCafe
          ? `${saludo} Estoy organizando el recorrido por ${contact.barrio}: ¿te queda bien que pase 2 minutos por *${lugar}* o preferís que nos veamos en ${infoCafe.fraseCafe}? Recordá tener a mano el DNI físico de CABA.${posdataNombre}`
          : `${saludo} Estoy organizando el recorrido por ${contact.barrio}: ¿en qué día y horario te queda cómodo que pase 2 minutos por *${lugar}* para la firma de adhesión con tu DNI físico de CABA?${posdataNombre}`
      );
    }
    return finalizar(
      `${saludo} Soy ${profile.nombrePromotor} (${profile.espacioPolitico}). Para coordinar los 2 minutos de tu firma de adhesión en ${contact.barrio} con DNI físico de CABA, ¿por qué calle/esquina y en qué franja horaria te queda más cómodo?${posdataNombre}`
    );
  }

  // 2) Consulta por firma online / digital / virtual / PDF (con o sin viaje)
  const preguntaFirmaOnline =
    /\b(firm[aáo]\s+online|firma\s+digital|firmar\s+digital|virtual|por\s+internet|por\s+mail|pdf|a\s+distancia|remoto)\b/i.test(
      instruccion
    );
  const mencionaViajeOAfuera =
    /\b(de\s+viaje|viajando|por\s+el\s+mundo|exterior|afuera|costa\s+rica|espa[ñn]a|europa|estados\s+unidos|ee\.?uu|brasil|uruguay|no\s+vuelvo|hasta\s+(?:el\s+)?202[789]|no\s+estoy\s+en\s+(?:argentina|buenos\s+aires|caba|capital))\b/i.test(
      instruccion
    );
  const esViajeLargo =
    /\b(no\s+vuelvo\s+hasta|202[789]|por\s+el\s+mundo|vivo\s+en\s+el\s+exterior|me\s+mud[eé]|radicad[oa]\s+en)\b/i.test(
      instruccion
    );

  if (preguntaFirmaOnline) {
    if (mencionaViajeOAfuera || esViajeLargo) {
      return finalizar(
        `${saludo}\n\n¡Qué buen plan ese viaje, que lo disfrutes muchísimo! Te agradezco de corazón la voluntad de sumarte. Lamentablemente para esta etapa la Justicia Electoral nos exige que la firma sea presencial en la planilla de papel y con el DNI físico de CABA en mano (no nos toman firma online ni digital).\n\nSi tenés algún familiar, amigo o vecino acá en CABA que creas que se pueda copar en apoyarnos con su firma, pasame su contacto o mi número y me acerco. ¡Muchas gracias igual por la buena onda y muy buen viaje!${posdataNombre}`
      );
    }
    return finalizar(
      `${saludo}\n\nMuchas gracias por la predisposición. Te cuento que para este paso la Justicia Electoral nos exige la firma ológrafa en la ficha de papel con el DNI físico de CABA (todavía no habilitan firma online/digital para adhesiones).\n\nJustamente para que no tengas que trasladarte ni perder tiempo, yo me acerco 2 minutos por la esquina o puerta que te quede más cómoda en *${contact.barrio || 'tu zona'}*${infoCafe.incluirCafe ? ` (o nos vemos en ${infoCafe.fraseCafe})` : ''}. ¿Qué día y horario te viene bien?${posdataNombre}`
    );
  }

  // 3) Está de viaje o fuera de CABA temporalmente (sin preguntar por firma online)
  if (mencionaViajeOAfuera || /\b(vuelvo\s+el|regreso\s+el|reci[eé]n\s+vuelvo|vuelvo\s+la\s+semana)\b/i.test(instruccion)) {
    if (esViajeLargo) {
      return finalizar(
        `${saludo}\n\n¡Qué lindo viaje, que lo disfrutes un montón! Como la firma de adhesión tiene que hacerse en papel acá en CABA con DNI físico, te dejo liberado/a por ahora.\n\nSi tenés algún familiar o amigo con DNI en CABA que le interese sumarse, avisame y lo contacto. ¡Muchas gracias por responderme y muy buen viaje!${posdataNombre}`
      );
    }
    const fechasRegreso = extraerFechasMencionadas(instruccion);
    const matchDiaRegreso = instruccion.match(
      /\b(?:vuelvo|regreso|estoy\s+de\s+vuelta)\s+(?:el\s+|reci[eé]n\s+el\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|la\s+semana\s+que\s+viene|en\s+[a-záéíóúñ]+(?:\s+de\s+\d{4})?)/i
    );
    const refRegreso = fechasRegreso.length > 0
      ? `después del *${fechasRegreso[fechasRegreso.length - 1]}*`
      : matchDiaRegreso
      ? `cuando vuelvas (*${matchDiaRegreso[1]}*)`
      : 'cuando estés de vuelta por CABA';
    return finalizar(
      `${saludo}\n\nBuenísimo, gracias por avisarme y que tengas muy buen viaje. Cero apuro: ya mismo me anoto acá para volver a escribirte ${refRegreso} así coordinamos esos 2 minutos por *${lugar}* cuando ya estés instalado/a. ¡Que disfrutes!${posdataNombre}`
    );
  }

  // 4) Situación de salud / familiar / postergación
  if (/\b(enferm[oa]|internad[oa]|operaci[oó]n|m[eé]dico|salud| Gripe|fiebre|cuidando\s+a)\b/i.test(instruccion)) {
    return finalizar(
      `${saludo}\n\nNo te preocupes para nada, primero está la salud y la familia. Ojalá se recuperen muy pronto.\n\nLo dejamos en pausa sin ningún apuro y más adelante, cuando estés más tranquilo/a, me avisás y me acerco 2 minutos por *${lugar}*. ¡Te mando un abrazo!${posdataNombre}`
    );
  }

  // 5) No tiene DNI en CABA / vive en Provincia u otro municipio
  if (
    /\b(no\s+tengo\s+(?:dni|domicilio)\s+en\s+caba|tengo\s+(?:dni|domicilio)\s+en\s+provincia|soy\s+de\s+provincia|vivo\s+en\s+provincia|no\s+voto\s+en\s+caba|domicilio\s+fuera\s+de\s+caba|cambi[eé]\s+el\s+domicilio)\b/i.test(
      instruccion
    )
  ) {
    return finalizar(
      `${saludo}\n\n¡Qué lástima! Para esta etapa la Justicia Electoral nos exige que el último domicilio impreso en el DNI físico sea de CABA.\n\nDe todas formas, si tenés algún familiar, amigo o compañero de trabajo con DNI en CABA que quiera darnos una mano firmando la adhesión para constituir el partido (*${profile.partidoLegal}*), pasame su contacto o dale mi número. ¡Muchas gracias igual por la buena predisposición!${posdataNombre}`
    );
  }

  // 6) Solicita baja / no quiere firmar / número equivocado
  if (
    /\b(no\s+me\s+interesa|dame\s+de\s+baja|no\s+quiero\s+firmar|no\s+voy\s+a\s+firmar|n[uú]mero\s+equivocado|no\s+complet[eé]|no\s+me\s+escribas)\b/i.test(
      instruccion
    )
  ) {
    return finalizar(
      `${saludo}\n\nNo te hagas ningún problema, te agradezco por avisarme. Ya mismo te doy de baja de mi listado para no volver a molestarte. ¡Que tengas muy buena semana!`
    );
  }

  // 7) Menciona que firma con una amiga / pareja / familiar o que ya quedó con alguien
  if (/\b(amig[oa]|pareja|marido|espos[oa]|hermano|hermana|vecin[oa]|somos\s+dos|dos\s+personas|qued[eé]\s+con\s+ella)\b/i.test(instruccion)) {
    const dispAmiga = analizarDisponibilidadColumnaG(instruccion);
    const fechasAmiga = extraerFechasMencionadas(instruccion);
    const mDiaSem = instruccion.match(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i);
    const refDia = fechasAmiga.length > 0
      ? `el *${fechasAmiga[0]}*`
      : mDiaSem
      ? `este *${mDiaSem[1].toLowerCase()}*`
      : 'en el día que les quede cómodo';
    const refHora = dispAmiga.horaPuntualPactada
      ? ` a las *${dispAmiga.horaPuntualPactada} hs*`
      : dispAmiga.etiquetaVentana
      ? ` (${dispAmiga.etiquetaVentana})`
      : '';
    return finalizar(
      tieneCalleReal
        ? `${saludo}\n\n¡Qué alegría que se sumen juntos/as! Llevo fichas extra entonces para que puedan firmar los dos en el momento (acordate sólo de que ambos tengan su DNI físico con domicilio en CABA).\n\n¿Les queda bien que pase 2 minutos por *${calleEfectiva}* ${refDia}${refHora} o en qué horario les resulta más cómodo?${posdataNombre}`
        : `${saludo}\n\n¡Qué bueno que se sume tu amiga también! Llevo fichas extra así firman las dos en 2 minutos (sólo hace falta que ambas tengan el DNI físico con domicilio en CABA).\n\n¿Por qué *calle y altura o esquina* de *${contact.barrio || 'la zona'}* y en qué *horario* de ${refDia} les queda cómodo que me acerque?${posdataNombre}`
    );
  }

  // 8) Pide más información / consulta de qué se trata Popurrí
  if (
    /\b(m[aá]s\s+info|informaci[oó]n|de\s+qu[eé]\s+se\s+trata|qui[eé]nes\s+son|qu[eé]\s+proponen|propuestas|no\s+recuerdo|recordame)\b/i.test(
      instruccion
    )
  ) {
    const msgInfo = generarMensajeContextual(contact, profile, 'mas_info');
    return msgInfo.texto;
  }

  // 9) Pregunta por oficinas / sede / ir a un punto / qué dirección en el barrio
  if (
    /\b(oficinas?|sede|chile\s*1408|ir\s+a\s+firmar|pasar\s+a\s+firmar|qu[eé]\s+direcci[oó]n\s+de|d[oó]nde\s+est[aá]n|punto\s+de\s+encuentro)\b/i.test(
      instruccion
    )
  ) {
    const mencionaOficinaOSede = /\b(oficinas?|sede|chile\s*1408|centro)\b/i.test(instruccion);
    return finalizar(
      mencionaOficinaOSede
        ? `${saludo}\n\n¡Buenísimo! Nuestra sede central está en *Chile 1408* (Monserrat, donde nos reunimos los miércoles de 18:30 a 20:00 hs), pero como esta semana voy a estar recorriendo *${contact.barrio || 'tu barrio'}*, si te resulta más práctico me acerco yo 2 minutos por tu cuadra o nos vemos en ${infoCafe.incluirCafe ? infoCafe.fraseCafe : `una esquina de *${contact.barrio}*`}.\n\n¿Por qué *calle/altura o esquina* de *${contact.barrio || 'la zona'}* y en qué *día y franja horaria* te queda más cómodo? (Acordate sólo de tener el DNI físico de CABA).${posdataNombre}`
        : `${saludo}\n\nPara que te sea súper cómodo y no tengas que trasladarte lejos, organizo el recorrido por *${contact.barrio || 'el barrio'}* acercándome 2 minutos a la puerta o esquina que te quede más a mano${infoCafe.incluirCafe ? ` (o si preferís un punto fijo, también nos encontramos en ${infoCafe.fraseCafe})` : ''}.\n\n¿Por qué *calle/altura o esquina* andás y qué *día y franja horaria* te viene mejor esta semana?${posdataNombre}`
    );
  }

  // 10) Analizar disponibilidad (día, horario, calle/esquina) pasada por la persona
  const disp = analizarDisponibilidadColumnaG(instruccion);
  const fechasEncontradas = extraerFechasMencionadas(instruccion);
  const mencionaManiana = /\bma[ñn]ana\b/i.test(instruccion) && !/\bpor\s+la\s+ma[ñn]ana\b/i.test(instruccion);
  const matchDiaSemana = instruccion.match(
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i
  );
  const prefiereDomicilio = /\b(casa|domicilio|puerta|ac[aá]|edificio|timbre|pasar\s+por)\b/i.test(
    instruccion
  );
  const prefiereCafe = /\b(caf[eé]|bar|confiter[ií]a)\b/i.test(instruccion);
  const pideDisculpasCompromiso = /\b(disculp|responsabilidad|compromiso|no\s+pude|reprogram)\b/i.test(
    instruccion
  );

  const tieneDiaEnRespuesta =
    fechasEncontradas.length > 0 || mencionaManiana || Boolean(matchDiaSemana);
  const tieneHorarioEnRespuesta =
    Boolean(disp.horaPuntualPactada) ||
    Boolean(disp.esVentanaAmplia) ||
    /\b(tarde|ma[ñn]ana|mediod[ií]a|\d{1,2}\s*hs)\b/i.test(instruccion);

  const diaTexto =
    fechasEncontradas.length > 1
      ? `entre el *${fechasEncontradas[0]}* y el *${fechasEncontradas[fechasEncontradas.length - 1]}*`
      : fechasEncontradas.length === 1
      ? `el *${fechasEncontradas[0]}*`
      : mencionaManiana
      ? '*mañana*'
      : matchDiaSemana
      ? `el *${matchDiaSemana[1].toLowerCase()}*`
      : contact.diasEncuentro
      ? `el *${contact.diasEncuentro}*`
      : '';

  const horarioTexto = disp.horaPuntualPactada
    ? `alrededor de las *${disp.horaPuntualPactada} hs*`
    : disp.etiquetaVentana
    ? `en la franja de *${disp.etiquetaVentana}*`
    : /\btarde\b/i.test(instruccion)
    ? 'por la *tarde*'
    : /\bpor\s+la\s+ma[ñn]ana\b/i.test(instruccion)
    ? 'por la *mañana*'
    : /\bmediod[ií]a\b/i.test(instruccion)
    ? 'al *mediodía*'
    : contact.horarioEncuentro
    ? `en el horario de *${contact.horarioEncuentro}*`
    : '';

  if (pideDisculpasCompromiso) {
    return finalizar(
      infoCafe.incluirCafe && !prefiereDomicilio
        ? `${saludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}* como teníamos previsto.\n\nPara adaptarme a tu disponibilidad, ¿te queda bien que lo reprogramemos${diaTexto ? ` para ${diaTexto}` : ''}${horarioTexto ? ` ${horarioTexto}` : ''} pasando 2 minutos por *${lugar}*, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.${posdataNombre}`
        : `${saludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}* como teníamos previsto.\n\nPara adaptarme a tu disponibilidad, ¿te queda bien que pase 2 minutos por *${lugar}*${diaTexto ? ` ${diaTexto}` : ''}${horarioTexto ? ` ${horarioTexto}` : ''}? Gracias.${posdataNombre}`
    );
  }

  if (prefiereCafe && infoCafe.incluirCafe) {
    return finalizar(
      `${saludo}\n\nPerfecto, gracias por avisarme. Agendamos entonces para vernos${diaTexto ? ` ${diaTexto}` : ''}${horarioTexto ? ` ${horarioTexto}` : ''} en ${infoCafe.fraseCafe} (son sólo 2 minutos con tu DNI físico con domicilio en CABA). Te escribo un ratito antes de estar ahí. Gracias.${posdataNombre}`
    );
  }

  // Caso A: Pasó horario o día, pero AÚN NO tenemos calle/altura ni esquina concreta (ej. "disponible a partir de las 18hs por Palermo o Saavedra")
  if (!tieneCalleReal && (tieneHorarioEnRespuesta || tieneDiaEnRespuesta)) {
    const resumenDisponibilidad = [diaTexto, horarioTexto].filter(Boolean).join(' ');
    return finalizar(
      `${saludo}\n\n¡Buenísimo, gracias por responderme! Me anoto tu disponibilidad ${resumenDisponibilidad || `por *${contact.barrio || 'la zona'}*`}.\n\nPara poder armar el recorrido y acercarme esos 2 minutos (acordate de tener el DNI físico con domicilio en CABA): ¿por qué *calle y altura o esquina de referencia* de *${contact.barrio || 'tu zona'}*${!diaTexto ? ' y qué *día de esta semana*' : ''} te queda más cómodo que pase?${posdataNombre}`
    );
  }

  // Caso B: Tiene calle/esquina real (en ficha o recién extraída) + algún dato de día/horario
  if (
    tieneCalleReal &&
    (prefiereDomicilio || tieneHorarioEnRespuesta || tieneDiaEnRespuesta)
  ) {
    if (!diaTexto) {
      return finalizar(
        `${saludo}\n\n¡Excelente, gracias por el dato! Ya me agendé *${calleEfectiva}*${horarioTexto ? ` (${horarioTexto})` : ''}.\n\n¿Qué *día de esta semana* te queda más cómodo que pase 2 minutos con la planilla (recordá tener a mano el DNI físico de CABA)?${posdataNombre}`
      );
    }
    if (!horarioTexto) {
      return finalizar(
        `${saludo}\n\n¡Buenísimo, gracias! Para pasar 2 minutos por *${calleEfectiva}* ${diaTexto} con la ficha de adhesión, ¿en qué *horario o franja horaria* te queda más cómodo encontrarme?${posdataNombre}`
      );
    }
    return finalizar(
      `${saludo}\n\n¡Buenísimo, muchas gracias! Te agendo entonces para pasar 2 minutos por *${calleEfectiva}* ${diaTexto} ${horarioTexto} (acordate de tener a mano tu DNI físico con domicilio en CABA). Ese día te aviso por acá unos 10-15 minutos antes de llegar.${posdataNombre}`
    );
  }

  // Caso C: Confirmó que tiene DNI en CABA ("Sí tengo DNI en CABA", "Hola, sí puedo") pero aún no dio ni calle ni horario
  return finalizar(
    tieneCalleReal
      ? `${saludo}\n\n¡Muchas gracias por responderme! Para organizarnos por *${calleEfectiva}* (${contact.barrio || 'CABA'}) y que te lleve apenas 2 minutos firmar la ficha con tu DNI físico: ¿qué *día y franja horaria* de esta semana te queda más cómodo que pase${infoCafe.incluirCafe ? `, o preferís que nos crucemos en ${infoCafe.fraseCafe}` : ''}?${posdataNombre}`
      : `${saludo}\n\n¡Muchas gracias por responderme! Para sumarte al recorrido de esta semana por *${contact.barrio || 'tu barrio'}* (son apenas 2 minutos con tu DNI físico con domicilio en CABA): ¿me pasarías una *calle y altura o esquina de referencia* y en qué *día y franja horaria* te queda más cómodo que pase${infoCafe.incluirCafe ? ` (o si preferís vernos en ${infoCafe.fraseCafe})` : ''}?${posdataNombre}`
  );
}

/**
 * Al sincronizar o importar desde Google Sheets:
 * 1. Toda persona del #167 en adelante o toda persona NUEVA que se haya incluido en el Google Sheets
 *    y que no figure en el registro de control de primer contacto queda marcada automáticamente
 *    como pendiente de 1er mensaje (`SIN_CONTACTAR_1ER_MSJ` o `FALTA_NOMBRE_Y_APELLIDO`).
 * 2. Toda persona cuyo estatus, comentario o envío ya fue actualizado en la app conserva sus cambios
 *    sin ser pisada por datos más viejos del Google Sheets de sólo lectura.
 * 3. Si la dirección en Columna G ("Comentario") no coincide con el barrio del Sheet, se corrige automáticamente al barrio real.
 */

