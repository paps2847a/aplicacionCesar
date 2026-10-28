import type { Contact, EstadoFlujo } from '../../types';

export type MacroStageKey =
  | 'nuevos'
  | 'conversacion'
  | 'agendados'
  | 'pausa'
  | 'adheridos'
  | 'descartados';

export interface MacroStageDefinition {
  key: MacroStageKey;
  stepNumber: number;
  label: string;
  shortLabel: string;
  tagline: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardBorder: string;
  headerGradient: string;
  dotColor: string;
}

export const MACRO_STAGES: Record<MacroStageKey, MacroStageDefinition> = {
  nuevos: {
    key: 'nuevos',
    stepNumber: 1,
    label: '1. Nuevos por Contactar',
    shortLabel: 'Nuevos',
    tagline: 'Sin 1er mensaje aún',
    description: 'Ingresos recientes que necesitan el primer mensaje cálido rompehielo.',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-800',
    badgeBorder: 'border-sky-200',
    cardBorder: 'border-sky-200/60',
    headerGradient: 'from-sky-500 to-blue-600',
    dotColor: 'bg-sky-500',
  },
  conversacion: {
    key: 'conversacion',
    stepNumber: 2,
    label: '2. En Conversación & Filtro',
    shortLabel: 'Conversación',
    tagline: 'Esperando respuesta o datos',
    description: 'Vecinos con mensaje enviado, validando DNI en CABA o coordinando horarios.',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    cardBorder: 'border-amber-200/60',
    headerGradient: 'from-amber-500 to-orange-500',
    dotColor: 'bg-amber-500',
  },
  agendados: {
    key: 'agendados',
    stepNumber: 3,
    label: '3. Encuentro Agendado',
    shortLabel: 'Agendados',
    tagline: 'Día, hora y lugar fijados',
    description: 'Reunión confirmada en Café HUB de cercanía, Sede Chile 1408 o domicilio.',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
    cardBorder: 'border-emerald-200/60',
    headerGradient: 'from-emerald-500 to-teal-600',
    dotColor: 'bg-emerald-500',
  },
  pausa: {
    key: 'pausa',
    stepNumber: 4,
    label: '4. En Pausa Temporal',
    shortLabel: 'En Pausa',
    tagline: 'Salud, viaje o fichas extra',
    description: 'Contactos que postergaron temporalmente o tienen fichas familiares para retirar.',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-200',
    cardBorder: 'border-purple-200/60',
    headerGradient: 'from-purple-500 to-indigo-600',
    dotColor: 'bg-purple-500',
  },
  adheridos: {
    key: 'adheridos',
    stepNumber: 5,
    label: '5. Adhesión Exitosa',
    shortLabel: 'Firmaron',
    tagline: 'Ficha firmada oficialmente',
    description: '¡Objetivo cumplido! Ficha física completada y aval incorporado al padrón.',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-950',
    badgeBorder: 'border-emerald-300',
    cardBorder: 'border-emerald-300',
    headerGradient: 'from-emerald-600 to-teal-700',
    dotColor: 'bg-emerald-600',
  },
  descartados: {
    key: 'descartados',
    stepNumber: 6,
    label: '6. Sin DNI CABA / Baja',
    shortLabel: 'Bajas / Archivo',
    tagline: 'Agradecido o baja solicitada',
    description: 'No votan en CABA (se solicitaron referidos) o solicitaron no ser contactados.',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-600',
    badgeBorder: 'border-slate-200',
    cardBorder: 'border-slate-200',
    headerGradient: 'from-slate-400 to-slate-500',
    dotColor: 'bg-slate-400',
  },
};

export const MACRO_STAGES_ORDER: MacroStageKey[] = [
  'nuevos',
  'conversacion',
  'agendados',
  'pausa',
  'adheridos',
  'descartados',
];

/**
 * Clasifica a cualquier candidato/contacto de forma determinística en una de las 5 macro-etapas.
 */
export function getMacroStageForContact(contact: Contact): MacroStageKey {
  // 1. Ya adhirió (Prioridad absoluta de éxito)
  if (contact.adhirio === 'Sí' || contact.estadoFlujo === 'YA_ADHIRIO_FIRMA_OK') {
    return 'adheridos';
  }

  // 2. Descartados o bajas
  if (
    contact.situacion === 'DESCARTADO_NO_CABA' ||
    contact.estadoFlujo === 'DESCARTADO_O_BAJA' ||
    contact.estadoFlujo === 'SIN_DNI_CABA_PEDIR_REFERIDOS' ||
    contact.esCerradoOArchivadoSinDniCaba
  ) {
    return 'descartados';
  }

  // 3. Pausa especial o retiro de fichas
  if (
    contact.estadoFlujo === 'POSTERGO_SALUD_O_VIAJE' ||
    contact.estadoFlujo === 'PENDIENTE_RETIRO_FICHAS' ||
    contact.situacion === 'SITUACION_SALUD' ||
    contact.situacion === 'RETIRO_FICHAS'
  ) {
    return 'pausa';
  }

  // 4. Agendados (Tienen fecha/horario y punto de encuentro)
  if (
    contact.estadoFlujo === 'ENCUENTRO_CONFIRMADO' ||
    contact.estadoFlujo === 'PREFIERE_CAFE_HUB_O_SEDE' ||
    contact.estadoFlujo === 'RECORDATORIO_DIA_ENVIADO' ||
    contact.situacion === 'VISITA_AGENDADA' ||
    contact.situacion === 'PREFIERE_PUNTO' ||
    contact.situacion === 'EVENTO_CHILE_1408'
  ) {
    return 'agendados';
  }

  // 5. Conversación activa o seguimiento
  if (
    contact.primerContactoEnviado ||
    contact.estadoFlujo === '1ER_MSJ_ENVIADO_SIN_RSP' ||
    contact.estadoFlujo === 'RESPONDIO_FALTA_DNI_O_ZONA' ||
    contact.estadoFlujo === 'PASO_DATOS_FALTA_CONFIRMAR' ||
    contact.estadoFlujo === 'PIDIO_MAS_INFO_ENVIADA' ||
    contact.rsp === 'Sí' ||
    contact.rsp === 'No'
  ) {
    return 'conversacion';
  }

  // 6. Nuevo sin primer mensaje
  return 'nuevos';
}

/**
 * Devuelve la acción contextual primaria sugerida para un candidato.
 */
export function getRecommendedActionForContact(contact: Contact): {
  label: string;
  shortLabel: string;
  hint: string;
  buttonClass: string;
  iconType: 'send' | 'check' | 'calendar' | 'mapPin' | 'userCheck';
} {
  const stage = getMacroStageForContact(contact);

  switch (stage) {
    case 'nuevos':
      return {
        label: 'Enviar 1er Mensaje de Presentación',
        shortLabel: '1er Mensaje',
        hint: 'Enviar rompehielo cálido sin enlaces ni spam',
        buttonClass: 'bg-sky-600 hover:bg-sky-500 text-white',
        iconType: 'send',
      };
    case 'conversacion':
      if (contact.rsp === 'Sí' && !contact.calleOCruce) {
        return {
          label: 'Pedir Esquina y Franja Horaria',
          shortLabel: 'Pedir Datos',
          hint: 'Confirmar DNI en CABA y consultar por qué zona anda',
          buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
          iconType: 'mapPin',
        };
      }
      if (contact.calleOCruce && contact.estadoFlujo !== 'ENCUENTRO_CONFIRMADO') {
        return {
          label: 'Proponer Café HUB o Visita',
          shortLabel: 'Proponer Cita',
          hint: 'Pasó dirección; proponer día y café de cercanía',
          buttonClass: 'bg-teal-600 hover:bg-teal-500 text-white',
          iconType: 'calendar',
        };
      }
      return {
        label: 'Enviar Seguimiento Suave (24h/48h)',
        shortLabel: 'Seguimiento',
        hint: 'Retomar conversación sin insistir de más',
        buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
        iconType: 'send',
      };
    case 'agendados':
      if (contact.alertaVencido?.activa) {
        return {
          label: 'Reprogramar Encuentro (Disculpas)',
          shortLabel: 'Reprogramar',
          hint: 'Asumir responsabilidad y proponer nuevo horario',
          buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white',
          iconType: 'calendar',
        };
      }
      return {
        label: 'Confirmar / Enviar "Estoy en camino"',
        shortLabel: 'En Camino',
        hint: 'Avisar hora exacta de llegada antes de salir',
        buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
        iconType: 'send',
      };
    case 'pausa':
      return {
        label: 'Reanudar contacto pactado',
        shortLabel: 'Retomar',
        hint: 'Consultar si ya regresó o coordinar retiro de fichas',
        buttonClass: 'bg-purple-600 hover:bg-purple-500 text-white',
        iconType: 'send',
      };
    case 'adheridos':
      return {
        label: 'Agradecer Adhesión + Pedir Referidos',
        shortLabel: 'Agradecer',
        hint: 'Ficha firmada. Enviar agradecimiento y pedir contactos en CABA',
        buttonClass: 'bg-emerald-700 hover:bg-emerald-600 text-white',
        iconType: 'userCheck',
      };
    case 'descartados':
      return {
        label: 'Baja Registrada (Sin acción requerida)',
        shortLabel: 'Archivado',
        hint: 'Caso cerrado respetuosamente',
        buttonClass: 'bg-slate-200 text-slate-500 cursor-not-allowed',
        iconType: 'check',
      };
  }
}
