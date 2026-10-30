/**
 * FACHADA MODULAR PRINCIPAL (Zero Breaking Changes)
 * Reexporta todas las funciones de los módulos desacoplados de dominio:
 * - domain/contacts
 * - domain/geo
 * - domain/calendar
 * - domain/routing
 * - domain/messaging
 * - domain/sync
 * - domain/automation
 * - domain/tasks
 */

export * from '../domain/contacts/nameCorrection';
export * from '../domain/contacts/phoneUtils';
export * from '../domain/contacts/contactStatus';
export * from '../domain/contacts/pipelineStages';

export * from '../domain/geo/cabaLocations';
export * from '../domain/geo/cafesHub';

export * from '../domain/calendar/availability';
export * from '../domain/calendar/calendarEvents';

export * from '../domain/routing/clustering';
export * from '../domain/routing/routingEngine';

export * from '../domain/messaging/greetingsAndTone';
export * from '../domain/messaging/messageTemplates';

export * from '../domain/sync/dataParsing';
export * from '../domain/sync/dataMerging';

export * from '../domain/automation/antiBanLimits';
export * from '../domain/automation/scriptGenerator';

export * from '../domain/tasks/dailyTasks';
