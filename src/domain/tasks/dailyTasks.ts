import { CorteResultado, EstatusHabladoHoyItem, EtapaProcesoTerritorial, ModoSaludoMismoDia, TipoPlantillaWA, VoiceProfile } from '../../types';
import {
  Contact,
  ControlEnvioRegistro,
  EstatusReporteApp,
  PanelTareasDiariasResultado,
  RawContactRow,
  ResumenDiarioFormsYApps,
  ResumenKPIsPadron,
  TareaDiariaItem,
} from '../../types';
import {
  extraerFechasMencionadas,
  obtenerPartesFechaHoraBA,
} from '../calendar/availability';
import { extraerCalleOCruce } from '../geo/cabaLocations';
import { generarMensajeContextual } from '../messaging/messageTemplates';
import { DEFAULT_VOICE_PROFILE } from '../../data/estatusPopurriData';
import { aplicarReglaSaludoMismoDia, yaSeHabloConContactoHoy } from '../messaging/greetingsAndTone';
import { esContactoElegiblePrimerContactoAuto } from '../automation/antiBanLimits';

export function calcularResumenKPIsPadron(contacts: Contact[]): ResumenKPIsPadron {
  const total = contacts.length;
  const adheridos = contacts.filter(
    (c) => c.adhirio === 'Sí' || c.procesoCompletadoSinMensajes
  ).length;
  const archivadosSinDniCabaCount = contacts.filter(
    (c) => c.esCerradoOArchivadoSinDniCaba
  ).length;
  // Regla del usuario: los pendientes se determinan en función del estatus de la columna "F" ("Adhirió"),
  // excluyendo a los que ya adhirieron y a los casos Sin DNI en CABA / Baja que ya fueron respondidos y archivados.
  const pendientesActivos = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  ).length;
  const pendientesCabaActivos = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba &&
      c.situacion !== 'DESCARTADO_NO_CABA'
  ).length;

  const nuevosSinMensaje = contacts.filter(
    (c) =>
      c.situacion === 'NUEVO_SIN_PRIMER_MENSAJE' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  ).length;

  const cambioChip = contacts.filter(
    (c) =>
      c.esRspSiSinInfoColG &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  ).length;

  const sinRespuestaList = contacts.filter(
    (c) =>
      c.esSinRsp48h &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba
  );
  const sinRespuesta = sinRespuestaList.length;
  const sinRespuestaPuraCount = sinRespuestaList.filter(
    (c) => c.diagnostico48h?.subtipo === 'SIN_RSP_DESDE_1ER_MSJ'
  ).length;
  const datoInsuficienteColGCount = sinRespuestaList.filter(
    (c) => c.diagnostico48h?.subtipo !== 'SIN_RSP_DESDE_1ER_MSJ'
  ).length;

  const visitasConcretadasCount = contacts.filter(
    (c) => c.esVisitaConcretadaORetiro && c.situacion !== 'RETIRO_FICHAS'
  ).length;
  const retirosFichasCount = contacts.filter(
    (c) => c.situacion === 'RETIRO_FICHAS' || c.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS'
  ).length;
  const visitasYRetiros = contacts.filter((c) => c.esVisitaConcretadaORetiro).length;

  const conDireccionEnColG = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      c.tieneDireccionRealEnComentario
  ).length;
  const conPuntoEncuentro = contacts.filter(
    (c) =>
      c.adhirio !== 'Sí' &&
      !c.procesoCompletadoSinMensajes &&
      !c.esCerradoOArchivadoSinDniCaba &&
      c.situacion !== 'DESCARTADO_NO_CABA' &&
      c.tienePuntoEncuentroDeterminado
  ).length;
  const alertasVencidosCount = contacts.filter((c) => Boolean(c.alertaVencido?.activa)).length;
  const barriosAutocorregidos = contacts.filter((c) => c.barrioCorregidoPorDireccion).length;
  const sinNombreCount = contacts.filter((c) => c.sinNombre).length;

  return {
    total,
    nuevosSinMensaje,
    pendientesActivos,
    pendientesCabaActivos,
    archivadosSinDniCabaCount,
    cambioChip,
    sinRespuesta,
    sinRespuestaPuraCount,
    datoInsuficienteColGCount,
    visitasYRetiros,
    visitasConcretadasCount,
    retirosFichasCount,
    adheridos,
    conDireccionEnColG,
    conPuntoEncuentro,
    alertasVencidosCount,
    barriosAutocorregidos,
    sinNombreCount,
  };
}

/**
 * Clasifica y enriquece un contacto crudo de la planilla o recién agregado
 */

export function clasificarEstatusParaAppExterna(c: Contact): EstatusReporteApp {
  const com = (c.comentario || '').toLowerCase();
  if (c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') {
    return 'Adhirió';
  }
  if (
    /no\s+existe\s+en\s+whatsapp|n[uú]mero\s+inv[aá]lido|tel[eé]fono\s+incorrecto|equivocado/i.test(com)
  ) {
    return 'Número inválido / No existe WA';
  }
  if (
    /no\s+vive\s+en\s+caba|vive\s+en\s+provincia|se\s+mud[oó]|vive\s+afuera|interior|extranjero/i.test(com)
  ) {
    return 'No vive en CABA';
  }
  if (
    c.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    c.situacion === 'DESCARTADO_NO_CABA' ||
    /sin\s+dni\s+en\s+caba|dni\s+en\s+provincia|domicilio\s+en\s+pba|no\s+tiene\s+dni\s+caba/i.test(com)
  ) {
    return 'Sin DNI en CABA';
  }
  if (c.estadoFlujo === 'DESCARTADO_O_BAJA' || c.adhirio === 'No') {
    return 'Baja / No contactar';
  }
  if (
    c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    c.situacion === 'VISITA_AGENDADA'
  ) {
    return 'Encuentro Confirmado';
  }
  return 'En conversación (Falta dato/confirmar)';
}

/**
 * Motor del PANEL DE TAREAS DIARIAS + CIERRE DIARIO (Google Forms + App Adhesiones + App Estatus):
 * Procesa toda la información cargada en cada usuario y determina qué hay que hacer HOY
 * a lo largo de las 7 etapas del proceso territorial + los seguimientos temporales (24h, 48h y baja amable).
 */
export function generarPanelTareasDiarias(
  contacts: Contact[],
  corte: CorteResultado,
  controlEnvios: ControlEnvioRegistro[] = [],
  profile: VoiceProfile = DEFAULT_VOICE_PROFILE,
  ahoraMs: number = Date.now(),
  modoSaludo: ModoSaludoMismoDia = 'AUTO_MISMO_DIA'
): PanelTareasDiariasResultado {
  const hoyBA = obtenerPartesFechaHoraBA(ahoraMs);
  const conteoPorEtapa: Record<EtapaProcesoTerritorial, number> = {
    ETAPA_1_PRIMER_CONTACTO: 0,
    ETAPA_2_VALIDAR_DNI_CABA: 0,
    ETAPA_3_PEDIR_DIRECCION_Y_FRANJA: 0,
    ETAPA_4_PROPONER_ENCUENTRO_O_CAFE: 0,
    ETAPA_5_CONFIRMAR_ENCUENTRO: 0,
    ETAPA_6_TERRENO_HOY_Y_RECORDATORIO: 0,
    ETAPA_7_AGRADECIMIENTO_POST_FIRMA: 0,
    SEGUIMIENTO_48H_SIN_RSP: 0,
    SEGUIMIENTO_24H_FALTA_DATO: 0,
    SEGUIMIENTO_24H_FALTA_CONFIRMAR: 0,
    ULTIMO_MSJ_BAJA_AMABLE: 0,
  };

  // Identificar contactos que están hoy en la ruta / bloques de HOY
  const bloquesHoy = (corte?.agendaSugeridaDias || []).filter(
    (b) => b.fechaClave === hoyBA.ddmm || /^HOY\b/i.test(b.diaEtiqueta || '')
  );
  const idsEnRutaHoy = new Set<string>(
    bloquesHoy.flatMap((b) => (b.contactosIncluidos || []).map((c) => c.id))
  );

  const tareas: TareaDiariaItem[] = [];

  for (const c of contacts) {
    const habloHoy = yaSeHabloConContactoHoy(c, ahoraMs);
    const msUltimo = c.ultimoMensajeCorteEnviadoAt
      ? Date.parse(c.ultimoMensajeCorteEnviadoAt)
      : c.actualizadoEnAppAt
      ? Date.parse(c.actualizadoEnAppAt)
      : c.ultimoContacto
      ? Date.parse(`${c.ultimoContacto}T12:00:00-03:00`)
      : NaN;
    const horasDesdeUltimo = Number.isFinite(msUltimo)
      ? Math.max(0, Math.round((ahoraMs - msUltimo) / 3600000))
      : undefined;

    // ETAPA 7: Ya adhirió -> enviar agradecimiento post-firma si aún no se le agradeció
    if (c.adhirio === 'Sí' || c.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') {
      if (!/agradec|gracias enviada|\[agradecimiento/i.test(c.comentario || '')) {
        conteoPorEtapa.ETAPA_7_AGRADECIMIENTO_POST_FIRMA++;
        const gen = generarMensajeContextual(c, profile, 'agradecimiento_post_firma', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-7-${c.id}`,
          contact: c,
          etapaNumero: 7,
          etapaCodigo: 'ETAPA_7_AGRADECIMIENTO_POST_FIRMA',
          etapaTitulo: 'Etapa 7 · Agradecer adhesión y pedir referidos CABA',
          prioridad: 'CIERRE_O_BAJA',
          motivoTarea: 'Ya firmó su ficha de adhesión y falta enviarle el mensaje de agradecimiento.',
          accionConcreta: 'Enviar mensaje de agradecimiento por bancar el proyecto.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'agradecimiento_post_firma',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      }
      continue;
    }

    // Descartados o bajas ya cerradas no generan tarea pendiente
    if (
      c.adhirio === 'No' ||
      c.estadoFlujo === 'DESCARTADO_O_BAJA' ||
      c.situacion === 'DESCARTADO_NO_CABA' ||
      c.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS'
    ) {
      continue;
    }

    // ETAPA 6: Encuentro Hoy / Recordatorio de la Mañana antes de salir / Avisos en Terreno
    const tieneFechaHoy = (c.fechasMencionadas || []).includes(hoyBA.ddmm) || idsEnRutaHoy.has(c.id);
    if (
      c.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
      c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
      c.situacion === 'VISITA_AGENDADA' ||
      tieneFechaHoy
    ) {
      conteoPorEtapa.ETAPA_6_TERRENO_HOY_Y_RECORDATORIO++;
      const plantillaEtapa6: TipoPlantillaWA =
        c.alertaVencido?.activa
          ? 'disculpas_y_reprogramacion'
          : c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
          ? 'en_camino'
          : 'recordatorio_maniana_encuentro';
      const gen = generarMensajeContextual(c, profile, plantillaEtapa6, {
        modoSaludo,
        ahoraMs,
      });
      tareas.push({
        id: `tarea-6-${c.id}`,
        contact: c,
        etapaNumero: 6,
        etapaCodigo: 'ETAPA_6_TERRENO_HOY_Y_RECORDATORIO',
        etapaTitulo: 'Etapa 6 · Encuentro Hoy / Recordatorio de la Mañana y Terreno',
        prioridad: 'URGENTE_HOY',
        motivoTarea: c.alertaVencido?.activa
          ? `Horario vencido sin adherir (${c.alertaVencido.motivo}) — Reprogramar hoy.`
          : `Encuentro agendado (${c.calleOCruce || c.barrio} · ${c.fechasMencionadas[0] || hoyBA.ddmm}).`,
        accionConcreta:
          c.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO'
            ? 'Avisar "En camino", "En la puerta (2 min)" o marcar "¡Ya adhirió!"'
            : 'Enviar recordatorio de la mañana antes de salir al recorrido',
        horasDesdeUltimoContacto: horasDesdeUltimo,
        yaSeHabloHoy: habloHoy,
        tipoPlantillaSugerida: plantillaEtapa6,
        mensajeListo: gen.texto,
        automatizableSinRiesgo: true,
      });
      continue;
    }

    // ETAPA 1: Sin contactar (1er mensaje en frío)
    if (esContactoElegiblePrimerContactoAuto(c)) {
      conteoPorEtapa.ETAPA_1_PRIMER_CONTACTO++;
      const gen = generarMensajeContextual(c, profile, 'primer_contacto', {
        modoSaludo: 'SIEMPRE_SALUDAR',
        ahoraMs,
      });
      tareas.push({
        id: `tarea-1-${c.id}`,
        contact: c,
        etapaNumero: 1,
        etapaCodigo: 'ETAPA_1_PRIMER_CONTACTO',
        etapaTitulo: 'Etapa 1 · Enviar 1er Mensaje (Cupo diario seguro < 45)',
        prioridad: 'AVANCE_PROCESO',
        motivoTarea: c.sinNombre
          ? 'Teléfono nuevo sin nombre en planilla: enviar 1er mensaje consultando nombre y DNI CABA.'
          : 'Vecino nuevo sin primer contacto enviado.',
        accionConcreta: 'Enviar 1er mensaje (manual o con el Bot Stealth < 45/día).',
        yaSeHabloHoy: false,
        tipoPlantillaSugerida: 'primer_contacto',
        mensajeListo: gen.texto,
        automatizableSinRiesgo: true,
      });
      continue;
    }

    // SEGUIMIENTO 48H SIN RESPUESTA O ÚLTIMO MENSAJE DE BAJA AMABLE
    if (c.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' || c.rsp === 'No') {
      const intentos = c.intentos || 1;
      const supero48h =
        Boolean(c.seguimiento48h?.aplica) ||
        (horasDesdeUltimo !== undefined ? horasDesdeUltimo >= 48 : true);

      if (intentos >= 2 && supero48h) {
        conteoPorEtapa.ULTIMO_MSJ_BAJA_AMABLE++;
        const gen = generarMensajeContextual(c, profile, 'baja_amable_sin_respuesta', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-baja-${c.id}`,
          contact: c,
          etapaNumero: 2,
          etapaCodigo: 'ULTIMO_MSJ_BAJA_AMABLE',
          etapaTitulo: 'Cierre Amable · Sin respuesta tras seguimiento (Dar de baja)',
          prioridad: 'CIERRE_O_BAJA',
          motivoTarea: `Ya se le escribió ${intentos} veces sin respuesta (+48 hs).`,
          accionConcreta: 'Enviar último mensaje amable de baja para no molestar y marcar Baja.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'baja_amable_sin_respuesta',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      } else if (supero48h) {
        conteoPorEtapa.SEGUIMIENTO_48H_SIN_RSP++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_sin_respuesta', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-48h-${c.id}`,
          contact: c,
          etapaNumero: 2,
          etapaCodigo: 'SEGUIMIENTO_48H_SIN_RSP',
          etapaTitulo: 'Seguimiento +48 hs · No respondió al 1er mensaje',
          prioridad: 'SEGUIMIENTO_24H_48H',
          motivoTarea: 'Pasaron más de 48 hs desde el primer contacto sin respuesta.',
          accionConcreta: 'Enviar mensaje breve de seguimiento recordando quiénes somos.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_sin_respuesta',
          mensajeListo: c.seguimiento48h?.mensajePersonalizado48h
            ? aplicarReglaSaludoMismoDia(c.seguimiento48h.mensajePersonalizado48h, c, modoSaludo, ahoraMs)
            : gen.texto,
          automatizableSinRiesgo: true,
        });
      }
      continue;
    }

    // PERSONAS QUE RESPONDIERON (RSP === 'Sí'): Etapas 2, 3, 4, 5 y Seguimientos de 24h
    const tienePropuestaEnviada = /\[Propuesta/i.test(c.comentario || '');
    const tieneDireccion = Boolean(c.calleOCruce && c.calleOCruce.trim().length > 2);
    const tieneFranjaODia =
      (c.fechasMencionadas && c.fechasMencionadas.length > 0) ||
      (c.franjaHoraria && c.franjaHoraria !== 'Sin definir' && c.franjaHoraria !== 'Flexible');
    const paso24h = horasDesdeUltimo === undefined ? true : horasDesdeUltimo >= 24;

    if (tienePropuestaEnviada) {
      if (paso24h && !habloHoy) {
        conteoPorEtapa.SEGUIMIENTO_24H_FALTA_CONFIRMAR++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_24h_falta_confirmar', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-24conf-${c.id}`,
          contact: c,
          etapaNumero: 5,
          etapaCodigo: 'SEGUIMIENTO_24H_FALTA_CONFIRMAR',
          etapaTitulo: 'Seguimiento +24 hs · Falta confirmar propuesta de encuentro',
          prioridad: 'SEGUIMIENTO_24H_48H',
          motivoTarea: 'Ya le compartimos propuesta de día/franja hace +24 hs y aún no confirmó.',
          accionConcreta: 'Consultar si le queda bien el encuentro propuesto o prefiere otro horario.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_24h_falta_confirmar',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      } else {
        conteoPorEtapa.ETAPA_5_CONFIRMAR_ENCUENTRO++;
        const gen = generarMensajeContextual(c, profile, 'confirmacion_visita', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-5-${c.id}`,
          contact: c,
          etapaNumero: 5,
          etapaCodigo: 'ETAPA_5_CONFIRMAR_ENCUENTRO',
          etapaTitulo: 'Etapa 5 · Confirmar encuentro (Tipo, dirección, día y hora)',
          prioridad: 'URGENTE_HOY',
          motivoTarea: `Propuesta en curso en ${c.calleOCruce || c.barrio} — falta dejar cerrado el compromiso.`,
          accionConcreta: 'Confirmar día, hora y dirección/café o marcar Confirmado.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'confirmacion_visita',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: false,
        });
      }
      continue;
    }

    if (tieneDireccion && tieneFranjaODia) {
      conteoPorEtapa.ETAPA_4_PROPONER_ENCUENTRO_O_CAFE++;
      const gen = generarMensajeContextual(c, profile, 'propuesta_bloque_agenda', {
        modoSaludo,
        ahoraMs,
      });
      tareas.push({
        id: `tarea-4-${c.id}`,
        contact: c,
        etapaNumero: 4,
        etapaCodigo: 'ETAPA_4_PROPONER_ENCUENTRO_O_CAFE',
        etapaTitulo: 'Etapa 4 · Proponer encuentro con fecha/franja o Café HUB',
        prioridad: 'URGENTE_HOY',
        motivoTarea: `Ya tenemos dirección (*${c.calleOCruce}*) y disponibilidad (${c.fechasMencionadas[0] || c.franjaHoraria}).`,
        accionConcreta: 'Enviar propuesta concreta de día y horario (visita 2 min o Café cercano).',
        horasDesdeUltimoContacto: horasDesdeUltimo,
        yaSeHabloHoy: habloHoy,
        tipoPlantillaSugerida: 'propuesta_bloque_agenda',
        mensajeListo: gen.texto,
        automatizableSinRiesgo: false,
      });
      continue;
    }

    if (!tieneDireccion || !tieneFranjaODia) {
      if (paso24h && !habloHoy && c.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR') {
        conteoPorEtapa.SEGUIMIENTO_24H_FALTA_DATO++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_24h_falta_dato', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-24dato-${c.id}`,
          contact: c,
          etapaNumero: 3,
          etapaCodigo: 'SEGUIMIENTO_24H_FALTA_DATO',
          etapaTitulo: 'Seguimiento +24 hs · Falta dirección o franja horaria',
          prioridad: 'SEGUIMIENTO_24H_48H',
          motivoTarea: !tieneDireccion
            ? 'Respondió hace +24 hs pero aún no nos pasó esquina/dirección.'
            : 'Nos pasó dirección pero hace +24 hs falta definir día/franja horaria.',
          accionConcreta: 'Pedir el dato faltante para sumarlo a la hoja de ruta o Café HUB.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_24h_falta_dato',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: true,
        });
      } else if (c.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA') {
        conteoPorEtapa.ETAPA_2_VALIDAR_DNI_CABA++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_cambio_chip', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-2-${c.id}`,
          contact: c,
          etapaNumero: 2,
          etapaCodigo: 'ETAPA_2_VALIDAR_DNI_CABA',
          etapaTitulo: 'Etapa 2 · Confirmar DNI con domicilio en CABA y pedir esquina',
          prioridad: 'AVANCE_PROCESO',
          motivoTarea: 'Respondió al mensaje inicial: confirmar que su DNI físico tenga domicilio en CABA y pedir esquina/franja.',
          accionConcreta: 'Consultar DNI CABA + esquina o punto cómodo y franja horaria.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_cambio_chip',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: false,
        });
      } else {
        conteoPorEtapa.ETAPA_3_PEDIR_DIRECCION_Y_FRANJA++;
        const gen = generarMensajeContextual(c, profile, 'seguimiento_24h_falta_dato', {
          modoSaludo,
          ahoraMs,
        });
        tareas.push({
          id: `tarea-3-${c.id}`,
          contact: c,
          etapaNumero: 3,
          etapaCodigo: 'ETAPA_3_PEDIR_DIRECCION_Y_FRANJA',
          etapaTitulo: 'Etapa 3 · Obtener dirección/punto y días/franja (u ofrecer Café)',
          prioridad: 'AVANCE_PROCESO',
          motivoTarea: !tieneDireccion
            ? `Falta esquina o dirección en ${c.barrio} para ubicarlo en el recorrido.`
            : `Ya tenemos dirección (*${c.calleOCruce}*), falta acordar días y franja horaria.`,
          accionConcreta: 'Pedir esquina/dirección y franja o proponer Café céntrico del barrio.',
          horasDesdeUltimoContacto: horasDesdeUltimo,
          yaSeHabloHoy: habloHoy,
          tipoPlantillaSugerida: 'seguimiento_24h_falta_dato',
          mensajeListo: gen.texto,
          automatizableSinRiesgo: false,
        });
      }
    }
  }

  const ordenPrioridad: Record<TareaDiariaItem['prioridad'], number> = {
    URGENTE_HOY: 1,
    SEGUIMIENTO_24H_48H: 2,
    AVANCE_PROCESO: 3,
    CIERRE_O_BAJA: 4,
  };

  tareas.sort((a, b) => {
    const diffP = ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad];
    if (diffP !== 0) return diffP;
    if (a.yaSeHabloHoy !== b.yaSeHabloHoy) return a.yaSeHabloHoy ? 1 : -1;
    return b.etapaNumero - a.etapaNumero;
  });

  // CALCULAR RESUMEN DIARIO PARA GOOGLE FORMS + APP DE ADHESIONES + APP DE ESTATUS
  const idsContactadosHoy = new Set<string>();
  const mapaHoraPorContacto = new Map<string, string>();

  for (const reg of controlEnvios) {
    if (reg.fechaHora && reg.fechaHora.includes(hoyBA.ddmm)) {
      idsContactadosHoy.add(String(reg.contactId));
      mapaHoraPorContacto.set(String(reg.contactId), reg.fechaHora);
    }
  }

  for (const c of contacts) {
    if (yaSeHabloConContactoHoy(c, ahoraMs)) {
      idsContactadosHoy.add(c.id);
      if (!mapaHoraPorContacto.has(c.id)) {
        mapaHoraPorContacto.set(c.id, hoyBA.hhmm);
      }
    }
  }

  const adhesionesTotales = contacts.filter((c) => c.adhirio === 'Sí');
  const adhesionesHoy = adhesionesTotales.filter((c) => {
    if (idsContactadosHoy.has(c.id)) return true;
    const com = c.comentario || '';
    if (com.includes(hoyBA.ddmm) || com.includes(hoyBA.isoDate)) return true;
    if (c.actualizadoEnAppAt && c.actualizadoEnAppAt.startsWith(hoyBA.isoDate)) return true;
    return false;
  });

  const estatusPersonasHabladasHoy: EstatusHabladoHoyItem[] = [];
  const conteoPorEstatusHoy: Record<EstatusReporteApp, number> = {
    'Adhirió': 0,
    'Encuentro Confirmado': 0,
    'En conversación (Falta dato/confirmar)': 0,
    'Número inválido / No existe WA': 0,
    'Sin DNI en CABA': 0,
    'No vive en CABA': 0,
    'Baja / No contactar': 0,
  };

  for (const c of contacts) {
    const tocadoHoy =
      idsContactadosHoy.has(c.id) ||
      Boolean(c.actualizadoEnAppAt && c.actualizadoEnAppAt.startsWith(hoyBA.isoDate));
    if (!tocadoHoy) continue;

    const est = clasificarEstatusParaAppExterna(c);
    conteoPorEstatusHoy[est] = (conteoPorEstatusHoy[est] || 0) + 1;
    estatusPersonasHabladasHoy.push({
      contactId: c.id,
      nombre: c.nombreCompletoCorregido || c.nombre || `Sin nombre (${c.telRaw})`,
      telRaw: c.telRaw,
      barrio: c.barrio,
      direccion: c.calleOCruce || c.barrio,
      estatusApp: est,
      detalleComentario: c.comentario || c.estadoFlujoEtiqueta,
      horaAccion: mapaHoraPorContacto.get(c.id) || hoyBA.hhmm,
    });
  }

  const clustersActivos = (corte?.agendaSugeridaDias || []).filter(
    (b) => b.contactosIncluidos.length >= 2 && (b.cafesHubOpciones?.length || 0) > 0
  );
  const contactosEnClusters = clustersActivos.reduce(
    (acc, b) => acc + b.contactosIncluidos.length,
    0
  );
  const contactosPuertaAPuerta = (corte?.agendaSugeridaDias || [])
    .filter((b) => b.contactosIncluidos.length === 1 || (b.cafesHubOpciones?.length || 0) === 0)
    .reduce((acc, b) => acc + b.contactosIncluidos.length, 0);

  return {
    fechaReferenciaBA: `${hoyBA.nombreDia} ${hoyBA.ddmm} (${hoyBA.hhmm} hs)`,
    tareasPriorizadas: tareas,
    conteoPorEtapa,
    resumenFormsYApps: {
      fechaHoyEtiqueta: `${hoyBA.nombreDia} ${hoyBA.ddmm}`,
      personasContactadasHoy: idsContactadosHoy.size,
      adhesionesConseguidasHoy: adhesionesHoy.length,
      adhesionesTotalesAcumuladas: adhesionesTotales.length,
      adhesionesHoyDetalle: (adhesionesHoy.length > 0 ? adhesionesHoy : adhesionesTotales.slice(0, 8)).map(
        (c) => ({
          id: c.id,
          nombre: c.nombreCompletoCorregido || c.nombre,
          telRaw: c.telRaw,
          barrio: c.barrio,
          direccion: c.calleOCruce || c.barrio,
          comentario: c.comentario,
        })
      ),
      estatusPersonasHabladasHoy,
      conteoPorEstatusHoy,
    },
    recomendacionEstrategiaCafeHub: {
      titulo: 'Método Híbrido: Café Ancla (≥2 vecinos a ≤12 min) + Satélites Puerta a Puerta',
      explicacionCorta:
        'En lugar de esperar a juntar muchas direcciones (lo que enfría a quienes responden rápido), apenas 2 o más vecinos caen a ≤12 min a pie en la misma franja se activa un Café Ancla de tu lista oficial y se les ofrece la doble opción en el mismo mensaje: acercarse al Café en esa ventana de 90 min o que pases 2 minutos por su puerta al terminar el café.',
      clustersActivosHoy: clustersActivos.length,
      contactosEnClusters,
      contactosPuertaAPuerta,
    },
  };
}







