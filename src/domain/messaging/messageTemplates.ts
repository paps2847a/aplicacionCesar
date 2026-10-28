import { analizarDisponibilidadColumnaG } from '../calendar/availability';
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
import {
  describirCafeConDistanciaDesdeContacto,
  OpcionesCafeMensaje,
} from '../geo/cafesHub';
import {
  corregirPelonesDiaSemanaEnTexto,
  postProcesarMensajeAntiPelonesYSaludo,
} from './greetingsAndTone';
import {
  obtenerPartesFechaHoraBA,
  sumarDiasAFechaBA,
} from '../calendar/availability';

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
  const fechaCitada = contact.fechasMencionadas[0] || 'esta semana';

  // Posdata sutil anti-fraude para cuando falta el nombre en cualquier mensaje de seguimiento
  const posdataSutilNombre = esSinNombre
    ? `\n\n_(De paso te hago una consulta cortita: al pasar los teléfonos del formulario a mi planilla me quedó en blanco la casilla de tu nombre; ¿me recordarías tu *nombre y apellido* así te agendo bien en mi celular?)_`
    : '';

  // Determinar qué plantilla aplicar cuando está en 'auto'
  let tipo: TipoPlantillaWA = plantillaOverride;
  if (tipo === 'auto') {
    if (contact.estadoFlujo === 'FALTA_NOMBRE_Y_APELLIDO') {
      tipo = 'primer_contacto';
    } else if (contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO') {
      tipo = 'en_camino';
    } else if (contact.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR') {
      tipo = 'confirmacion_visita';
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
      // CASO ESPECIAL ESTRATÉGICO: Teléfono en Google Sheets sin nombre registrado
      if (esSinNombre) {
        if (breve) {
          return {
            tipoUsado: 'primer_contacto',
            asunto: '1er Contacto para Teléfono Sin Nombre (Sutil y Anti-Desconfianza)',
            objetivo: 'Dar máxima confianza identificándose primero, aclarar que es adhesión (no afiliación) y consultar sutilmente nombre y apellido.',
            texto: `Hola, muy buen día, ¿cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque dejaste tu contacto en nuestro formulario para apoyarnos a constituir el partido (${profile.partidoLegal}) en CABA —antes que nada, quería darte la tranquilidad de que lo que firmamos es sólo una *adhesión* ciudadana y de ninguna manera es una _afiliación_—.\n\nComo al pasar los datos del formulario a mi planilla me quedó registrado tu número pero salió en blanco la casilla de tu nombre, ¿me dirías tu *nombre y apellido* así te agendo como corresponde? Y contame si esta semana preferís que pase 2 minutos por tu cuadra en ${contact.barrio || 'la zona'} o que nos crucemos en algún café del barrio. Muchas gracias.`,
          };
        }
        return {
          tipoUsado: 'primer_contacto',
          asunto: '1er Contacto Completo para Teléfono Sin Nombre (Sutil y Transparente)',
          objetivo: 'Generar confianza plena, explicar el motivo del mensaje y obtener nombre y apellido para actualizar Google Sheets.',
          texto: `Hola, muy buen día, ¿cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque vimos que dejaste tu teléfono en nuestro formulario para apoyarnos y ayudarnos a reconstruir lo común en CABA. Antes que nada, quiero darte la total tranquilidad de que lo que vamos a firmar es únicamente una *adhesión* para avalar la creación de nuestro partido (${profile.partidoLegal}), y de ninguna manera es una _afiliación_. Es un apoyo inicial que no te compromete a nada.\n\nTe hago una consulta muy cortita: al descargar la planilla del formulario me apareció tu número de WhatsApp pero quedó en blanco la casilla de tu nombre. Para poder agendarte bien acá en mi teléfono y organizar la hoja de ruta por ${contact.barrio || 'el barrio'} sin confundirme, ¿me recordarías tu *nombre y apellido*? Y de paso decime si preferís que pase dos minutos por tu puerta o que nos veamos en algún café de la zona. Muchas gracias.`,
        };
      }

      if (breve) {
        return {
          tipoUsado: 'primer_contacto',
          asunto: 'Primer Contacto (Breve y conversacional)',
          objetivo: 'Lograr primera respuesta aclarando que es adhesión (no afiliación) y ofrecer pasar 2 min.',
          texto: `Hola, ${nombre}, buen día. ¿Cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque completaste el formulario para apoyarnos a reconstruir lo común. Quería darte la tranquilidad de que lo que firmamos es sólo una *adhesión* para avalar la creación del partido (${profile.partidoLegal}) y de ninguna manera es una _afiliación_.\n\nEsta semana voy a estar recorriendo ${contact.barrio || 'la zona'} para juntar las firmas en papel (toma apenas dos minutos). ¿Preferís que pase un ratito por tu casa o que nos encontremos en algún café de ${contact.barrio || 'la zona'}? Muchas gracias.`,
        };
      }
      return {
        tipoUsado: 'primer_contacto',
        asunto: 'Primer Contacto (Completo)',
        objetivo: 'Presentación completa de Hacemos Popurrí y coordinación de firma presencial.',
        texto: `Hola, ${nombre}, buen día. ¿Cómo te va? Soy ${promotor}, del equipo de *${profile.espacioPolitico}*.\n\nTe escribo porque vimos que completaste el formulario para apoyarnos y ayudarnos a reconstruir lo común. Antes que nada, quiero darte la tranquilidad de que lo que vamos a firmar es únicamente una *adhesión* para avalar la creación de nuestro partido (${profile.partidoLegal}), y de ninguna manera es una _afiliación_. Es un apoyo inicial que no te compromete ni te afilia a nada, e incluso podés firmarlo sin problema aunque hoy estés afiliado/a a otro espacio.\n\nVivo y trabajo por la zona, así que esta semana voy a estar organizándome para hacer la recorrida casa por casa y juntar las firmas en papel (es un trámite que nos toma apenas dos minutos). Vos decime dónde te resulta más cómodo —si preferís que pase por tu casa o que nos encontremos en algún café de la zona—, en qué día y horario, y agendamos. Muchas gracias.`,
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
          texto: `${esSinNombre ? 'Genial, muchas gracias por responder.' : `Buenísimo, ${nombre}.`}\n\nAntes de armar el recorrido de esta semana por ${contact.barrio || 'tu barrio'}, te hago dos consultas cortitas:\n1. ¿La última dirección que figura impresa en el dorso de tu DNI físico es de CABA? (La Justicia Electoral exige que el domicilio del documento sea de Capital).\n2. Para ubicarte en el recorrido y ${opcionCafeSinDir}: ¿me pasarías una *esquina de referencia, cuadra aproximada o dirección* por ${contact.barrio || 'el barrio'}, y en qué *día y franja horaria* te queda más cómodo?\n\nCon esa referencia ya nos organizamos. Además, si en casa hay alguien más con DNI en CABA que quiera adherir, llevo fichas extra.${posdataSutilNombre}`,
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
        texto: `${esSinNombre ? 'Buenísimo.' : `Perfecto, ${nombre}.`} Ya te tengo ubicado/a por *${dir}* en ${contact.barrio}.\n\nPara organizar la recorrida de esta semana: ¿en qué *día y franja horaria* te queda más cómodo que pase 2 minutos por *${dir}*${alternativaCafeConDir}? Acordate sólo de tener a mano el DNI físico con domicilio en CABA.${posdataSutilNombre}`,
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
          texto: `${saludoConNombre}, ¿cómo estás? Vi que te sumás a la reunión del miércoles en *Chile 1408* (18:30 hs). Yo voy a estar ahí también, así que cuando llegues escribime por acá, nos buscamos y firmamos la ficha en dos minutos (acordate sólo de traer el DNI físico). Nos vemos el miércoles.${posdataSutilNombre}`,
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
        texto: `${esSinNombre ? 'Perfecto, muchas gracias.' : `Perfecto, ${nombre}.`} Ya dejamos agendado entonces para el ${fechaCitada} en *${dir}*.\n\nEse día te escribo un ratito antes cuando esté saliendo para allá, unos 10-15 minutos antes de llegar, así te doy tiempo.\n\nPara ese momento sólo te pido tener tu último DNI físico a mano, así copiamos los datos tal cual están impresos (toma apenas dos minutos). Si ahí con vos hay alguien más que tenga domicilio de CABA en el DNI y quiera sumar su firma, también lo hacemos en el momento.\n\nCualquier cosa que te surja de acá a ese día, avisame sin problema.${posdataSutilNombre}`,
      };
    }

    case 'convocatoria_cafe_hub': {
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
        asunto: 'Propuesta de Encuentro en Café del Barrio',
        objetivo: 'Agrupar firmas de vecinos ya contactados en un café cercano con dirección y tiempo de caminata.',
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
        texto: `${esSinNombre ? 'Hola, ya' : `${nombre}, ya`} estoy llegando, a 2 minutos de *${dir}*. Cuando puedas bajá tranquilo/a que te espero acá.`,
      };
    }

    case 'demorado': {
      return {
        tipoUsado: 'demorado',
        asunto: 'Aviso de Demora (+10 min)',
        objetivo: 'Cuidar el tiempo de la persona si el transporte o parada previa se atrasó.',
        texto: `${esSinNombre ? 'Hola, te' : `${nombre}, te`} aviso que vengo con unos 10 minutos de demora por el transporte, pero ya estoy yendo directo para *${dir}*. Disculpame la demora, nos vemos en un ratito.`,
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
        texto: `${saludoConNombre}, ¿cómo estás? Como te escribí un par de veces por la firma de adhesión de *${profile.espacioPolitico}* y no quiero ser pesado ni molestarte, te doy de baja de mi listado de recorridas así no te siguen llegando mensajes.\n\nSi en algún momento más adelante tenés un ratito y querés sumar tu firma en CABA, escribime por acá con total confianza. Muchas gracias igual y que tengas muy buena semana.`,
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
    lat?: number;
    lng?: number;
  },
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now(),
  opcionesCafe?: OpcionesCafeMensaje
): DiagnosticoSinRsp48h | undefined {
  const adh = (params.adhirio || '').toLowerCase().trim();
  if (
    !params.primerContactoEnviado ||
    adh === 'sí' ||
    adh === 'si' ||
    params.situacion === 'DESCARTADO_NO_CABA' ||
    params.situacion === 'NUEVO_SIN_PRIMER_MENSAJE' ||
    params.esVisitaConcretadaORetiro
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
  const lugar = contact.calleOCruce || contact.barrio || 'tu zona';
  const infoCafe = describirCafeConDistanciaDesdeContacto(contact, profile);
  const posdataNombre = contact.sinNombre
    ? '\n\n_(De paso, recordame por acá tu nombre y apellido así te agendo bien en la planilla)_.'
    : '';

  // 1) Si pide acortar en 2-3 líneas directas
  if (/acort[aá]r|m[aá]s\s+corto|2-3\s+l[ií]neas|2\s+oraciones|breves|resum/i.test(instruccion)) {
    if (contact.alertaVencido?.activa) {
      return `${saludo} Te pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}*. ¿Qué día y franja horaria de esta semana te queda cómodo para reprogramar esos 2 minutos con tu DNI físico de CABA?${posdataNombre}`;
    }
    if (contact.tienePuntoEncuentroDeterminado) {
      return infoCafe.incluirCafe
        ? `${saludo} Estoy organizando el recorrido por ${contact.barrio}: ¿te queda bien que pase 2 minutos por *${lugar}* o preferís que nos veamos en ${infoCafe.fraseCafe}? Recordá tener a mano el DNI físico de CABA.${posdataNombre}`
        : `${saludo} Estoy organizando el recorrido por ${contact.barrio}: ¿en qué día y horario te queda cómodo que pase 2 minutos por *${lugar}* para la firma de adhesión con tu DNI físico de CABA?${posdataNombre}`;
    }
    return `${saludo} Soy ${profile.nombrePromotor} (${profile.espacioPolitico}). Para coordinar los 2 minutos de tu firma de adhesión en ${contact.barrio} con DNI físico de CABA, ¿por qué calle/esquina y en qué franja horaria te queda más cómodo?${posdataNombre}`;
  }

  // 2) Analizar qué respondió o pidió la persona en `instruccion`
  const disp = analizarDisponibilidadColumnaG(instruccion);
  const fechasEncontradas = Array.from(
    new Set((instruccion.match(/\b(\d{1,2}\/\d{1,2})\b/g) || []).map((f) => f.trim()))
  );
  const mencionaManiana = /\bma[ñn]ana\b/i.test(instruccion);
  const mencionaJueves = /\bjueves\b/i.test(instruccion);
  const mencionaViernes = /\bviernes\b/i.test(instruccion);
  const mencionaSabado = /\bs[aá]bado\b/i.test(instruccion);
  const mencionaLunes = /\blunes\b/i.test(instruccion);
  const prefiereDomicilio = /\b(casa|domicilio|puerta|ac[aá]|edificio|timbre|pasar\s+por)\b/i.test(instruccion);
  const prefiereCafe = /\b(caf[eé]|bar|confiter[ií]a|punto\s+de\s+encuentro)\b/i.test(instruccion);
  const pideDisculpasCompromiso = /\b(disculp|responsabilidad|compromiso|no\s+pude|reprogram)\b/i.test(instruccion);

  const diaTexto =
    fechasEncontradas.length > 0
      ? `el *${fechasEncontradas[0]}*`
      : mencionaManiana
      ? '*mañana*'
      : mencionaJueves
      ? 'el *jueves*'
      : mencionaViernes
      ? 'el *viernes*'
      : mencionaSabado
      ? 'el *sábado*'
      : mencionaLunes
      ? 'el *lunes*'
      : 'en estos días';

  const horarioTexto = disp.horaPuntualPactada
    ? `alrededor de las *${disp.horaPuntualPactada} hs*`
    : disp.etiquetaVentana
    ? `dentro de la franja de *${disp.etiquetaVentana}*`
    : /\btarde\b/i.test(instruccion)
    ? 'por la *tarde*'
    : /\bma[ñn]ana\b/i.test(instruccion) && !mencionaManiana
    ? 'por la *mañana*'
    : /\bmediod[ií]a\b/i.test(instruccion)
    ? 'al *mediodía*'
    : '';

  if (pideDisculpasCompromiso) {
    return infoCafe.incluirCafe && !prefiereDomicilio
      ? `${saludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}* como teníamos previsto.\n\nPara adaptarme a tu disponibilidad, ¿te queda bien que lo reprogramemos para ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''} pasando 2 minutos por *${lugar}*, o preferís que nos encontremos en ${infoCafe.fraseCafe}? Gracias.${posdataNombre}`
      : `${saludo}\n\nTe pido disculpas porque no pude cumplir con nuestro compromiso de pasar por *${lugar}* como teníamos previsto.\n\nPara adaptarme a tu disponibilidad, ¿te queda bien que pase 2 minutos por *${lugar}* ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''}? Gracias.${posdataNombre}`;
  }

  if (prefiereCafe && infoCafe.incluirCafe) {
    return `${saludo}\n\nPerfecto, gracias por avisarme. Agendamos entonces para vernos ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''} en ${infoCafe.fraseCafe} (son sólo 2 minutos con tu DNI físico con domicilio en CABA). Te escribo un ratito antes de estar ahí. Gracias.${posdataNombre}`;
  }

  if (
    prefiereDomicilio ||
    disp.horaPuntualPactada ||
    disp.esVentanaAmplia ||
    fechasEncontradas.length > 0 ||
    mencionaManiana ||
    mencionaJueves ||
    mencionaViernes ||
    mencionaSabado ||
    mencionaLunes
  ) {
    return `${saludo}\n\nBuenísimo, gracias por confirmarme. Te agendo entonces para pasar 2 minutos por *${lugar}* ${diaTexto}${horarioTexto ? ` ${horarioTexto}` : ''} (acordate de tener a mano tu DNI físico con domicilio en CABA). Te aviso por acá un ratito antes de llegar. Gracias.${posdataNombre}`;
  }

  if (instruccion) {
    return `${saludo}\n\nGracias por responderme (${instruccion}). Te propongo entonces pasar 2 minutos por *${lugar}* en el día y horario que te quede más cómodo con tu DNI físico con domicilio en CABA${infoCafe.incluirCafe ? `, o bien vernos en ${infoCafe.fraseCafe}` : ''}. Avisame qué te resulta mejor y lo dejamos agendado.${posdataNombre}`;
  }

  return baseMsg;
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

