export type FranjaHoraria =
  | 'Mañana'
  | 'Mediodía'
  | 'Tarde'
  | 'Vespertino'
  | 'Flexible'
  | 'Fin de Semana'
  | 'Sin definir';

export type EstadoFlujo =
  | 'SIN_CONTACTAR_1ER_MSJ'
  | 'FALTA_NOMBRE_Y_APELLIDO'
  | '1ER_MSJ_ENVIADO_SIN_RSP'
  | 'RESPONDIO_FALTA_DNI_O_ZONA'
  | 'PIDIO_MAS_INFO_ENVIADA'
  | 'PREFIERE_CAFE_HUB_O_SEDE'
  | 'PASO_DATOS_FALTA_CONFIRMAR'
  | 'ENCUENTRO_CONFIRMADO'
  | 'RECORDATORIO_DIA_ENVIADO'
  | 'YA_ADHIRIO_FIRMA_OK'
  | 'PENDIENTE_RETIRO_FICHAS'
  | 'POSTERGO_SALUD_O_VIAJE'
  | 'SIN_DNI_CABA_PEDIR_REFERIDOS'
  | 'DESCARTADO_O_BAJA';

export type SituacionContacto =
  | 'NUEVO_SIN_PRIMER_MENSAJE'
  | 'SEGUIMIENTO_CAMBIO_CHIP'
  | 'SEGUIMIENTO_SIN_RESPUESTA'
  | 'VISITA_AGENDADA'
  | 'PREFIERE_PUNTO'
  | 'EVENTO_CHILE_1408'
  | 'PIDIO_MAS_INFO'
  | 'SITUACION_SALUD'
  | 'RETIRO_FICHAS'
  | 'YA_ADHIRIO'
  | 'DESCARTADO_NO_CABA';

export type TipoPlantillaWA =
  | 'auto'
  | 'primer_contacto'
  | 'seguimiento_cambio_chip'
  | 'seguimiento_sin_respuesta'
  | 'seguimiento_24h_falta_dato'
  | 'seguimiento_24h_falta_confirmar'
  | 'baja_amable_sin_respuesta'
  | 'confirmacion_visita'
  | 'convocatoria_cafe_hub'
  | 'propuesta_bloque_agenda'
  | 'disculpas_y_reprogramacion'
  | 'recordatorio_maniana_encuentro'
  | 'esperado_no_estaba_reprogramar'
  | 'mas_info'
  | 'en_camino'
  | 'llegando'
  | 'demorado'
  | 'retiro_fichas'
  | 'agradecimiento_post_firma'
  | 'no_caba_referidos'
  | 'baja_respetuosa';

export type TipoAlertaPendienteVencido =
  | 'VISITA_O_FECHA_VENCIDA_SIN_ADHESION'
  | 'VISITA_SIN_CONFIRMAR_A_TIEMPO'
  | 'NO_RECIBIDO_EN_CAFE_HUB_O_SEDE'
  | 'ENCUENTRO_NO_CONCRETADO';

export interface AlertaPendienteVencido {
  activa: boolean;
  tipo: TipoAlertaPendienteVencido;
  titulo: string;
  motivo: string;
  fechaVencida?: string;
  propuestaReprogramacion: string;
  mensajeDisculpasReprogramacion: string;
}

export type TipoRespuestaPropuestaAgenda =
  | 'CONFIRMO_PROPUESTA'
  | 'DECLINO_CAFE_PASA_PUERTA_A_PUERTA'
  | 'PASA_A_CAFE_HUB'
  | 'REPROGRAMAR_DIA_HORA'
  | 'YA_ADHIRIO'
  | 'POSTERGO_O_BAJA';

export interface AnalisisNombre {
  original: string;
  sinNombre: boolean;
  vocativo: string;
  nombrePilaCompleto: string;
  apellidos: string;
  nombreCompletoOrdenado: string;
  ordenDetectado:
    | 'NOMBRE_APELLIDO'
    | 'APELLIDO_NOMBRE'
    | 'APELLIDO_COMA_NOMBRE'
    | 'SOLO_NOMBRE'
    | 'SIN_NOMBRE';
  correccionesAplicadas: string[];
  confianza: number; // 0 a 100
}

export interface RawContactRow {
  id: string;
  nombre: string;
  vocativoOverride?: string;
  barrio: string;
  barrioOriginalSheet?: string;
  barrioCorregidoPorDireccion?: boolean;
  email?: string;
  telRaw: string;
  tel?: string;
  rsp: 'Sí' | 'No' | 'Nuevo';
  adhirio: 'Sí' | 'Pendiente' | 'No';
  comentario: string;
  estadoFlujo?: EstadoFlujo;
  estadoFlujoEtiqueta?: string;
  enSheets?: boolean;
  primerContactoEnviado?: boolean;
  fechaPrimerContacto?: string;
  fechaAgregado?: string;
  ultimoContacto?: string;
  intentos?: number;
  referidosCabaYaEnviado?: boolean;
  actualizadoEnAppAt?: string;
  ultimoMensajeCorteEnviadoAt?: string;
  alertaVencidoOcultaFecha?: string;
}

export interface SharedAppStateSnapshot {
  version: number;
  updatedAt: string;
  rawContacts?: RawContactRow[];
  controlEnvios?: ControlEnvioRegistro[];
  sentContactIds?: string[];
  alertaOcultaIds?: string[];
  respuestasConsolidadasLog?: Record<string, { etiqueta: string; hora: string }>;
  modalidadOverrideByBloque?: Record<string, ModalidadEncuentroAgenda>;
  cafeHubOverrideByBloque?: Record<string, { nombre: string; direccion: string }>;
  calendarEvents?: CalendarEventItem[];
  sheetUrlInput?: string;
  appsScriptUrlInput?: string;
  calendarIcalUrlInput?: string;
  profile?: VoiceProfile;
}

export type SubtipoSinRsp48h =
  | 'SIN_RSP_DESDE_1ER_MSJ'
  | 'DATO_INSUFICIENTE_SOLO_DIRECCION_FALTA_DIA'
  | 'DATO_INSUFICIENTE_DIRECCION_Y_FRANJA_FALTA_DIA'
  | 'DATO_INSUFICIENTE_SOLO_FECHA_FALTA_DIRECCION'
  | 'DATO_INSUFICIENTE_PREFIERE_PUNTO_FALTA_CONFIRMAR_HUB'
  | 'DATO_INSUFICIENTE_PIDIO_MAS_INFO_FALTA_COORDINAR'
  | 'DATO_INSUFICIENTE_POSTERGO_SALUD_O_VIAJE'
  | 'RSP_SI_SIN_AVANCE_48H';

export interface DiagnosticoSinRsp48h {
  aplica: boolean;
  subtipo: SubtipoSinRsp48h;
  etiquetaCorta: string;
  motivoDetallado: string;
  infoDisponibleResumen: string;
  datoFaltanteResumen: string;
  mensajePersonalizado48h: string;
}

export interface ResumenKPIsPadron {
  total: number;
  nuevosSinMensaje: number; // Card 1: SIN 1ER MSJ (nuevos ingresos en Google Sheets #167+ sin 1er contacto)
  pendientesActivos: number; // Card 2: PENDIENTES (según Columna F "Adhirió" !== "Sí" y excluyendo cerrados/archivados sin DNI en CABA)
  pendientesCabaActivos: number; // Pendientes con DNI/domicilio CABA activo
  cambioChip: number; // Card 3: RSP: SÍ (Col. E "RSP" = Sí, no adhirieron, sin info nueva en Col. G y sin confirmación enviada)
  sinRespuesta: number; // Card 4: SIN RSP +48H (marca temporal +48h sin respuesta o con dato insuficiente en Col. G para concretar encuentro/Café HUB)
  sinRespuestaPuraCount: number; // Sub-conteo: RSP = No tras +48h
  datoInsuficienteColGCount: number; // Sub-conteo: con algún dato en Col. G pero insuficiente para concretar visita/Café HUB
  visitasYRetiros: number; // Card 5: VISITAS / X2 (visitas ya concretadas con todos los datos necesarios + pendientes de retiro de fichas extras)
  visitasConcretadasCount: number; // Sub-conteo: visitas con dirección y día/horario concretos
  retirosFichasCount: number; // Sub-conteo: pendientes de retiro de fichas X1/X2/X3
  adheridos: number; // Card 6: FIRMADAS (según Columna F "Adhirió" = "Sí", excluidas del mapa activo)
  archivadosSinDniCabaCount: number; // Personas sin DNI en CABA / Baja ya respondidas (sacadas de pendientes y ocultas de listas activas)
  conDireccionEnColG: number;
  conPuntoEncuentro: number;
  alertasVencidosCount: number;
  barriosAutocorregidos: number;
  sinNombreCount: number;
}

export interface Contact extends RawContactRow {
  sinNombre: boolean;
  primerNombre: string;
  nombreCompletoCorregido: string;
  analisisNombre: AnalisisNombre;
  estadoFlujo: EstadoFlujo;
  estadoFlujoEtiqueta: string;
  telWA: string;
  enSheets: boolean;
  primerContactoEnviado: boolean;
  fechaPrimerContacto?: string;
  fechaAgregado: string;
  ultimoContacto: string;
  horasDesdeUltimoContacto: number;
  intentos: number;
  calleOCruce: string;
  tieneDireccionRealEnComentario: boolean;
  tienePuntoEncuentroDeterminado: boolean;
  tieneNuevaInfoEnColumnaG: boolean;
  tieneDatoInsuficienteEnColG: boolean;
  esRspSiSinInfoColG: boolean;
  esSinRsp48h: boolean;
  esVisitaConcretadaORetiro: boolean;
  esCerradoOArchivadoSinDniCaba: boolean;
  procesoCompletadoSinMensajes: boolean;
  diagnostico48h?: DiagnosticoSinRsp48h;
  direccionMaps: string;
  franjaHoraria: FranjaHoraria;
  fechasMencionadas: string[];
  lat: number;
  lng: number;
  tieneCoordenadasExactas: boolean;
  situacion: SituacionContacto;
  modalidadSugerida: 'CAFE_HUB' | 'PUERTA_A_PUERTA' | 'PUNTO_ENCUENTRO' | 'REMOTO_O_BAJA';
  motivoEstrategico: string;
  prioridadCorte: number; // 1 (alta) a 5 (baja)
  tipoPlantillaSugerida: TipoPlantillaWA;
  mensajeSugerido: string;
  objetivoMensaje: string;
  alertaVencido?: AlertaPendienteVencido;
  seguimiento48h?: DiagnosticoSinRsp48h;
  enviadoEnSesion?: boolean;
}

export interface ControlEnvioRegistro {
  idRegistro: string;
  contactId: string;
  nombre: string;
  barrio: string;
  telRaw: string;
  tipoMensaje: string;
  estadoAnterior: string;
  estadoNuevo: EstadoFlujo;
  estadoNuevoEtiqueta: string;
  rspNuevo: 'Sí' | 'No' | 'Nuevo';
  adhirioNuevo: 'Sí' | 'Pendiente' | 'No';
  comentario: string;
  fechaHora: string;
  sincronizadoSheets: boolean;
}

export interface CafeHubInfo {
  barrio: string;
  nombre: string;
  direccion: string;
  esquina: string;
  lat: number;
  lng: number;
  horariosSugeridos: string;
  urlGoogleMaps?: string;
}

export interface VoiceProfile {
  nombrePromotor: string;
  apellidoPromotor: string;
  emailUsuario: string;
  espacioPolitico: string;
  partidoLegal: string;
  direccionPartida: string;
  latPartida: number;
  lngPartida: number;
  sedeCentral: string;
  modoBreve: boolean;
  usarVoseoRioplatense: boolean;
  incluirTranquilidadNoAfiliacion: boolean;
  recordarDniFisicoCaba: boolean;
  preguntarPorFamiliaresEnCasa: boolean;
  saludoPreferido: string;
  cierrePreferido: string;
  topeMensajesHora: number;
  topeMensajesDia: number;
  horasParaSeguimientoSinRespuesta: number;
  horasParaSeguimientoCambioChip: number;
  cafesPorBarrio: Record<string, CafeHubInfo>;
}

export interface MicroClusterMember {
  contact: Contact;
  minutosCaminando: number;
  cuadrasAprox: number;
  distanciaMetros: number;
}

export interface CafeHubCercanoCluster {
  id: string;
  nombre: string;
  direccion: string;
  barrio: string;
  urlGoogleMaps: string;
  lat: number;
  lng: number;
  distanciaMetros: number;
  minutosCaminando: number;
  cuadrasAprox: number;
}

export type ModalidadEncuentroAgenda =
  | 'CAFE_HUB'
  | 'PUERTA_A_PUERTA'
  | 'PUNTO_ADHESION'
  | 'SEGUIMIENTO_PUNTO_ADHESION'
  | 'EVENTO_SEDE'
  | 'ENCUENTRO_SEDE';

export type ModoMensajeTerrenoRuta =
  | 'RECORDATORIO_MANIANA_ANTES_SALIR'
  | 'EN_CAMINO_HORA_CALC'
  | 'LLEGANDO_2_MIN'
  | 'YA_EN_CAFE_HUB'
  | 'DEMORADO_10_MIN'
  | 'DISCULPAS_CANCELACION_REPROGRAMAR'
  | 'NO_ESTABA_REPROGRAMAR'
  | 'CONFIRMACION_HOY';

export type ModoSaludoMismoDia = 'AUTO_MISMO_DIA' | 'SIEMPRE_SALUDAR' | 'SIN_SALUDO';

export type ModoColaAutomatizacionWA =
  | 'PRIMER_CONTACTO'
  | 'RECORDATORIO_MANIANA_HOY'
  | 'SEGUIMIENTO_24H_48H_BAJA'
  | 'AGRADECIMIENTO_POST_FIRMA';

export interface MicroCluster {
  id: string;
  numero: number;
  nombreNodo: string;
  barrioPrincipal: string;
  esquinaCentrica: string;
  cafeRecomendado: string;
  centroLat: number;
  centroLng: number;
  miembros: MicroClusterMember[];
  mediaMinutos: number;
  maxMinutos: number;
  convieneCafeHub: boolean;
  franjasCompatibles: string[];
  fechasAgrupadas?: string[];
  etiquetaFechaGrupo?: string;
  etiquetaFechasCluster?: string;
  diaAgendaSugerido?: string;
  fechaAgendaClave?: string;
  franjaAgendaSugerida?: string;
  modalidadAgendaSugerida?: ModalidadEncuentroAgenda;
  modalidadRecomendadaAgenda?: ModalidadEncuentroAgenda;
  esSugeridoProximosDias?: boolean;
  recomendacionAgendaTexto?: string;
  bloqueAgendaIdVinculado?: string;
  veredicto: string;
  explicacion: string;
  urlGoogleMapsCafe: string;
  cafesHubCercanos?: CafeHubCercanoCluster[];
}

export interface ParadaRuta {
  orden: number;
  contact: Contact;
  origenNombre: string;
  origenLat: number;
  origenLng: number;
  destinoNombre: string;
  destinoLat: number;
  destinoLng: number;
  modoTraslado: 'WALKING' | 'TRANSIT';
  distanciaMetros: number;
  cuadrasAprox: number;
  minutosViaje: number;
  minutosEncuentro: number;
  horaSalida: string;
  horaLlegada: string;
  horaFinVisita: string;
  detalleTransporte: string;
  conflictoCalendar?: string;
  alternativaOptimaSugerida?: string;
  mensajeReprogramacionCalendar?: string;
  mensajeNoEstabaReprogramar?: string;
  horaPactadaExplicita?: string;
  ventanaColumnaG?: string;
  notaHorarioConveniente?: string;
  cafeHubAsignado?: { nombre: string; direccion: string };
  confirmadoEnLista1a1?: boolean;
  vencidaSinAdherir?: boolean;
  motivoVencimiento?: string;
  mensajeDisculpasVencido?: string;
  urlGoogleMapsTramo: string;
  mensajeTerrenoSugerido?: string;
  mensajeWhatsappSugerido?: string;
}

export interface ItemColaCorte {
  contact: Contact;
  categoriaCorte: string;
  razonRecomendacion: string;
  tipoPlantilla: TipoPlantillaWA;
  mensajePersonalizado: string;
  mensajeSugerido?: string;
  alertaVencido?: AlertaPendienteVencido;
  seguimiento48h?: DiagnosticoSinRsp48h;
  enviado: boolean;
}

export interface BloqueAgendaRecomendado {
  id: string;
  clusterIdVinculado?: string;
  diaEtiqueta: string;
  fechaClave: string;
  fechaISO?: string;
  franjaHoraria: string;
  resumenOperativoRuta?: string;
  franjaBase?: FranjaHoraria;
  horaInicioCalculada?: string;
  horaFinCalculada?: string;
  duracionTotalMinutos?: number;
  duracionEstimadaMin?: number;
  modalidad: ModalidadEncuentroAgenda;
  modalidadElegidaUsuario?: ModalidadEncuentroAgenda;
  cafeElegidoUsuario?: string;
  barrio: string;
  puntoEncuentroODireccion: string;
  puntoCentricoResumen?: string;
  franjaCompartidaResumen?: string;
  mediaMinutosAlCafe?: number;
  motivoClaro: string;
  trasladoCalendarNota?: string;
  esSeguimientoVencidos?: boolean;
  alertasIncluidasCount?: number;
  cafesHubOpciones?: CafeHubCercanoCluster[];
  cafesCandidatosCurados?: {
    nombre: string;
    direccion: string;
    barrio: string;
    distanciaPromedioMetros: number;
    coincidenciaFranjaYDia: string;
    urlGoogleMaps?: string;
  }[];
  paradasRutaSugerida?: ParadaRuta[];
  contactosIncluidos: Contact[];
}

export interface CorteResultado {
  timestamp: string;
  fechaHoraActualEtiqueta: string;
  totalAnalizados: number;
  resumenEjecutivo: string;
  metricas: {
    nuevosPrimerContacto: number;
    cambioChipSinConcretar: number;
    sinRespuestaSeguimiento: number;
    visitasAgendadas: number;
    retirosPendientes: number;
    adheridosTotales: number;
    alertasVencidasReprogramar: number;
    conPuntoEncuentroDeterminado: number;
  };
  alertasPendientesVencidos: Contact[];
  agendaSugeridaDias: BloqueAgendaRecomendado[];
  recomendacionesBarrio: {
    barrio: string;
    pendientes: number;
    conRespuestaSi: number;
    sinRespuesta: number;
    estrategia: string;
    cafeHubSugerido: string;
  }[];
  colaMensajes: ItemColaCorte[];
  analisisIA?: string;
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  location?: string;
  fecha?: string;    // Ej: '20/10', '21/10', '22/10', '23/10'
  fechaISO?: string; // Ej: '2026-10-21'
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  startIso?: string;
  endIso?: string;
  lat?: number;
  lng?: number;
  calendarName?: string;
  source?: 'demo' | 'ical' | 'apps_script' | 'oauth' | 'manual';
}

export type ResultadoEnvioAuto =
  | 'PENDIENTE'
  | 'ENVIANDO'
  | 'ENVIADO_OK'
  | 'NUMERO_INEXISTENTE'
  | 'ERROR_ENVIO'
  | 'OMITIDO_YA_CONTACTADO'
  | 'SESION_RESTRINGIDA_ABORTAR';

export type NivelWarmupWA =
  | 'DIA_1_MAX_10'
  | 'DIA_2_MAX_15'
  | 'DIA_3_MAX_25'
  | 'DIA_4_MAX_35'
  | 'DIA_5_MADURO_MENOS_45';

export interface AutoFirstMessageQueueItem {
  orden: number;
  contactId: string;
  nombre: string;
  primerNombre: string;
  sinNombre: boolean;
  barrio: string;
  telRaw: string;
  telefonoNorm: string;
  mensajePrimerContacto: string;
  saludoUsado: string;
  varianteIndice: number;
  intervaloSegundos: number;
  segundosEscrituraSimulada: number;
  esPausaCafeAntes: boolean;
  horaProgramada: string;
  fueraDeVentanaHoraria?: boolean;
  resultado: ResultadoEnvioAuto;
  detalleResultado: string;
  fechaHoraResultadoISO?: string;
  estadoFlujoResultante?: EstadoFlujo;
  sincronizadoSheets?: boolean;
}

export interface AutoFirstMessageConfig {
  horaInicio: string; // HH:mm (ej. '10:30')
  horaVentanaInicio: string; // HH:mm (ej. '09:00')
  horaVentanaFin: string; // HH:mm (ej. '19:00')
  nivelWarmup: NivelWarmupWA;
  minCupo: number;    // Ej. 24
  maxCupo: number;    // Estricto <= 44 (siempre menor a 45)
  cupoSorteado: number; // Estricto < 45
  minIntervaloSeg: number; // Ej. 45s
  maxIntervaloSeg: number; // Ej. 120s
  lotePausaCafeCada: number; // Ej. cada 12 mensajes (entre 10 y 15)
  minPausaCafeMinutos: number; // Ej. 10 min
  maxPausaCafeMinutos: number; // Ej. 20 min
  pausaExtraCada10Seg: number; // Segundos equivalentes de pausa de café
  incluirOptOutBaja: boolean; // Frase amigable de salida ("respondé Baja")
  usarVariabilidadIAGemini: boolean; // Reescritura polimórfica con Gemini + Spintax
  barrioFiltro: string;
  modoRompehieloCorto?: boolean; // Mensaje corto conversacional (< 220 chars) que no activa heurística de spam en dispositivos vinculados
  soloNumerosArgentina?: boolean; // Excluir números internacionales (+34, etc.) del lote automático en frío
  modoCola?: ModoColaAutomatizacionWA; // Etapa del proceso a automatizar
}

export interface AutoFirstMessageCampaign {
  campaignId: string;
  creadaEnISO: string;
  config: AutoFirstMessageConfig;
  totalElegiblesEnBase: number;
  totalElegiblesEnPadron?: number;
  items: AutoFirstMessageQueueItem[];
  estadoCampana:
    | 'LISTA_PARA_EJECUTAR'
    | 'ESPERANDO_HORA_INICIO'
    | 'EN_EJECUCION'
    | 'PAUSADA'
    | 'FINALIZADA';
}

export type EtapaProcesoTerritorial =
  | 'ETAPA_1_PRIMER_CONTACTO'
  | 'ETAPA_2_VALIDAR_DNI_CABA'
  | 'ETAPA_3_PEDIR_DIRECCION_Y_FRANJA'
  | 'ETAPA_4_PROPONER_ENCUENTRO_O_CAFE'
  | 'ETAPA_5_CONFIRMAR_ENCUENTRO'
  | 'ETAPA_6_TERRENO_HOY_Y_RECORDATORIO'
  | 'ETAPA_7_AGRADECIMIENTO_POST_FIRMA'
  | 'SEGUIMIENTO_48H_SIN_RSP'
  | 'SEGUIMIENTO_24H_FALTA_DATO'
  | 'SEGUIMIENTO_24H_FALTA_CONFIRMAR'
  | 'ULTIMO_MSJ_BAJA_AMABLE';

export interface TareaDiariaItem {
  id: string;
  contact: Contact;
  etapaNumero: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  etapaCodigo: EtapaProcesoTerritorial;
  etapaTitulo: string;
  prioridad: 'URGENTE_HOY' | 'SEGUIMIENTO_24H_48H' | 'AVANCE_PROCESO' | 'CIERRE_O_BAJA';
  motivoTarea: string;
  accionConcreta: string;
  horasDesdeUltimoContacto?: number;
  yaSeHabloHoy: boolean;
  tipoPlantillaSugerida: TipoPlantillaWA;
  mensajeListo: string;
  automatizableSinRiesgo: boolean;
}

export type EstatusReporteApp =
  | 'Adhirió'
  | 'Encuentro Confirmado'
  | 'En conversación (Falta dato/confirmar)'
  | 'Número inválido / No existe WA'
  | 'Sin DNI en CABA'
  | 'No vive en CABA'
  | 'Baja / No contactar';

export interface EstatusHabladoHoyItem {
  contactId: string;
  nombre: string;
  telRaw: string;
  barrio: string;
  direccion: string;
  estatusApp: EstatusReporteApp;
  detalleComentario: string;
  horaAccion: string;
}

export interface ResumenDiarioFormsYApps {
  fechaHoyEtiqueta: string;
  personasContactadasHoy: number;
  adhesionesConseguidasHoy: number;
  adhesionesTotalesAcumuladas: number;
  adhesionesHoyDetalle: {
    id: string;
    nombre: string;
    telRaw: string;
    barrio: string;
    direccion: string;
    comentario: string;
  }[];
  estatusPersonasHabladasHoy: EstatusHabladoHoyItem[];
  conteoPorEstatusHoy: Record<EstatusReporteApp, number>;
}

export interface PanelTareasDiariasResultado {
  fechaReferenciaBA: string;
  tareasPriorizadas: TareaDiariaItem[];
  conteoPorEtapa: Record<EtapaProcesoTerritorial, number>;
  resumenFormsYApps: ResumenDiarioFormsYApps;
  recomendacionEstrategiaCafeHub: {
    titulo: string;
    explicacionCorta: string;
    clustersActivosHoy: number;
    contactosEnClusters: number;
    contactosPuertaAPuerta: number;
  };
}


