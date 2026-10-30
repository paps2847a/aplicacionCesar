import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

import type {
  CalendarEventItem,
  ControlEnvioRegistro,
  EstadoFlujo,
  RawContactRow,
  SharedAppStateSnapshot,
} from './src/types';
import { getDatabase } from './server/db';
import { apiRouter } from './server/contactRoutes';
import { whatsappRouter } from './server/routes/whatsappRoutes';
import {
  getAllContacts,
  bulkUpsertContacts,
} from './server/repositories/contactRepository';
import {
  getRecentEnvios,
  bulkRecordEnvios,
} from './server/repositories/controlEnvioRepository';
import {
  getCalendarEvents,
  replaceCalendarEvents,
  upsertCalendarEvent,
  deleteCalendarEvent,
} from './server/repositories/calendarRepository';
import {
  getSetting,
  setSetting,
  getAllSettings,
} from './server/repositories/settingsRepository';
import {
  getEmbeddedAsset,
  getEmbeddedIndexHtml,
  hasEmbeddedFrontend,
} from './server/embeddedAssets';

import { INITIAL_CALENDAR_EVENTS } from './src/data/estatusPopurriData';
import {
  deduplicarEventosCalendar,
  fusionarContactosMultiDispositivo,
  migrarContactosDesde167SinPrimerContacto,
  normalizarTelefonoWA,
  obtenerEtiquetaEstadoFlujo,
  obtenerPartesFechaHoraBA,
  adaptarMensajeConRespuestaVecinoLocal,
} from './src/utils/logic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = fs.existsSync(path.join(__dirname, 'data'))
  ? path.join(__dirname, 'data')
  : path.join(process.cwd(), 'data');
const SHARED_STATE_PATH = path.join(DATA_DIR, 'popurri_shared_state.json');
const TMP_SHARED_STATE_PATH = path.join(os.tmpdir(), 'popurri_shared_state.json');

function sanitizeSnapshot(snapshot: SharedAppStateSnapshot): SharedAppStateSnapshot {
  const controlKeys = new Set<string>();
  for (const reg of snapshot.controlEnvios || []) {
    if (reg?.contactId) controlKeys.add(`id:${String(reg.contactId).trim()}`);
  }
  const sanitizedContacts = Array.isArray(snapshot.rawContacts)
    ? migrarContactosDesde167SinPrimerContacto(snapshot.rawContacts, controlKeys)
    : snapshot.rawContacts;

  const cleanedCal = deduplicarEventosCalendar(snapshot.calendarEvents || []);
  const sanitizedCalendar = cleanedCal.filter((e) => {
    const sNorm = String(e.summary || '').toLowerCase();
    const idNorm = String(e.id || '').toLowerCase();
    return (
      !sNorm.includes('dentista') &&
      !sNorm.includes('reunión virtual') &&
      !sNorm.includes('reunion virtual') &&
      !sNorm.includes('almuerzo con frima') &&
      !idNorm.includes('dentista') &&
      !idNorm.includes('reunion-virtual') &&
      !idNorm.includes('almuerzo-frima')
    );
  });

  return {
    ...snapshot,
    rawContacts: sanitizedContacts,
    calendarEvents: sanitizedCalendar,
  };
}

function loadSharedStateFromDiskFallback(): SharedAppStateSnapshot | null {
  for (const candidatePath of [SHARED_STATE_PATH, TMP_SHARED_STATE_PATH]) {
    try {
      if (!fs.existsSync(candidatePath)) continue;
      const raw = fs.readFileSync(candidatePath, 'utf-8');
      if (!raw.trim()) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const sanitized = sanitizeSnapshot(parsed as SharedAppStateSnapshot);
        return sanitized;
      }
    } catch (err) {
      console.error('Error leyendo estado compartido desde disco:', err);
    }
  }
  return null;
}

function loadSharedState(): SharedAppStateSnapshot {
  try {
    getDatabase(); // Inicializa SQLite y migra automáticamente si está vacía
    const contactsRes = getAllContacts();
    const envios = getRecentEnvios(150);
    const calendar = getCalendarEvents();
    const settings = getAllSettings();

    if (contactsRes.contacts.length > 0) {
      return sanitizeSnapshot({
        version: typeof settings.version === 'number' ? settings.version : 1,
        updatedAt: new Date().toISOString(),
        rawContacts: contactsRes.contacts,
        controlEnvios: envios,
        calendarEvents: calendar,
        sentContactIds: Array.isArray(settings.sentContactIds) ? settings.sentContactIds : [],
        alertaOcultaIds: Array.isArray(settings.alertaOcultaIds) ? settings.alertaOcultaIds : [],
        respuestasConsolidadasLog: settings.respuestasConsolidadasLog || {},
        modalidadOverrideByBloque: settings.modalidadOverrideByBloque || {},
        cafeHubOverrideByBloque: settings.cafeHubOverrideByBloque || {},
        sheetUrlInput: settings.sheetUrlInput,
        appsScriptUrlInput: settings.appsScriptUrlInput,
        calendarIcalUrlInput: settings.calendarIcalUrlInput,
        profile: settings.profile,
      });
    }
  } catch (err) {
    console.error('[SQLite] Error cargando estado desde SQLite, fallback a JSON:', err);
  }

  const fallback = loadSharedStateFromDiskFallback();
  if (fallback) return fallback;

  return sanitizeSnapshot({
    version: 1,
    updatedAt: new Date().toISOString(),
    rawContacts: [],
    controlEnvios: [],
    calendarEvents: [],
  });
}

function saveSharedStateToDiskBackup(snapshot: SharedAppStateSnapshot): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${SHARED_STATE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    fs.renameSync(tmpPath, SHARED_STATE_PATH);
    return;
  } catch {
    try {
      fs.writeFileSync(TMP_SHARED_STATE_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error guardando respaldo JSON en disco:', err);
    }
  }
}

function saveSharedState(snapshot: SharedAppStateSnapshot): void {
  try {
    getDatabase();
    if (Array.isArray(snapshot.rawContacts) && snapshot.rawContacts.length > 0) {
      bulkUpsertContacts(snapshot.rawContacts);
    }
    if (Array.isArray(snapshot.controlEnvios) && snapshot.controlEnvios.length > 0) {
      bulkRecordEnvios(snapshot.controlEnvios);
    }
    if (Array.isArray(snapshot.calendarEvents) && snapshot.calendarEvents.length > 0) {
      replaceCalendarEvents(snapshot.calendarEvents, 'state_sync');
    }
    if (snapshot.version !== undefined) setSetting('version', snapshot.version);
    if (snapshot.profile !== undefined) setSetting('profile', snapshot.profile);
    if (snapshot.sheetUrlInput !== undefined) setSetting('sheetUrlInput', snapshot.sheetUrlInput);
    if (snapshot.appsScriptUrlInput !== undefined) setSetting('appsScriptUrlInput', snapshot.appsScriptUrlInput);
    if (snapshot.calendarIcalUrlInput !== undefined) setSetting('calendarIcalUrlInput', snapshot.calendarIcalUrlInput);
    if (snapshot.modalidadOverrideByBloque !== undefined) setSetting('modalidadOverrideByBloque', snapshot.modalidadOverrideByBloque);
    if (snapshot.cafeHubOverrideByBloque !== undefined) setSetting('cafeHubOverrideByBloque', snapshot.cafeHubOverrideByBloque);
    if (snapshot.respuestasConsolidadasLog !== undefined) setSetting('respuestasConsolidadasLog', snapshot.respuestasConsolidadasLog);
    if (snapshot.sentContactIds !== undefined) setSetting('sentContactIds', snapshot.sentContactIds);
    if (snapshot.alertaOcultaIds !== undefined) setSetting('alertaOcultaIds', snapshot.alertaOcultaIds);
  } catch (err) {
    console.error('[SQLite] Error guardando estado en SQLite:', err);
  }

  // Guardar también copia JSON como backup secundario
  saveSharedStateToDiskBackup(snapshot);
}

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada en el entorno del servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Registrar Rutas CRUD de Contactos, Eventos y Trazabilidad en SQLite
  app.use('/api', apiRouter);

  // Registrar Rutas de Automatización Directa WhatsApp Web.js
  app.use('/api/whatsapp', whatsappRouter);

  // 1. Ruta de Análisis de Corte con High Thinking (gemini-4-argon con fallback automático a gemini-3.8-flash)
  app.post('/api/gemini/corte', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        resumenMetricas,
        contactosMuestra,
        barrioFiltro,
        perfilVoz,
        fechaHoraActual,
        alertasVencidas,
        eventosCalendarActivos,
      } = req.body;

      const systemPrompt = `Sos el estratega logístico y redactor jefe de campaña de "${perfilVoz?.espacioPolitico || 'Hacemos Popurrí'}" (partido en formación: ${perfilVoz?.partidoLegal || 'Regeneración'}) en la Ciudad Autónoma de Buenos Aires, trabajando mano a mano con ${perfilVoz?.nombrePromotor || 'César'} ${perfilVoz?.apellidoPromotor || 'Rincón'}.
Tu objetivo es analizar el "corte" actual de contactos NO adheridos con dirección o punto de encuentro determinado en la planilla Estatus_POPURRÍ, tomando estrictamente en consideración la fecha y hora actual (${fechaHoraActual || 'Hoy en CABA'}) y los eventos del Google Calendar de César, para darle:
1. Atención inmediata a las alertas de visitas/encuentros pendientes de días u horarios anteriores que aún no cambiaron a "Ya adhirió" (cómo pedir disculpas con calidez y reprogramar).
2. Un diagnóstico táctico día por día (dónde instalar Café Hub y a quién visitar Puerta a Puerta contemplando sus eventos de Calendar y tiempos de traslado).
3. Criterios prácticos para confirmar propuestas 1-a-1 y consolidar la agenda diaria (ej: pasar a Puerta a Puerta a quien decline el Café Hub).
4. Usá voseo rioplatense natural, claro, empático y directo.`;

      const userPrompt = `Analizá este corte actualizado en vivo (${fechaHoraActual || 'Hoy'} · Filtro: ${barrioFiltro || 'Todos los barrios'}):
Métricas del corte (descartando ya adheridos): ${JSON.stringify(resumenMetricas)}
Alertas de pendientes vencidos o sin confirmar de días/horarios anteriores:
${JSON.stringify(alertasVencidas || [], null, 2)}
Eventos en el Google Calendar de César:
${JSON.stringify(eventosCalendarActivos || [], null, 2)}
Muestra de contactos pendientes con dirección/punto de encuentro:
${JSON.stringify(contactosMuestra, null, 2)}

Devolvé un diagnóstico breve y accionable en 3 bloques claros:
1. RESOLUCIÓN DE PENDIENTES VENCIDOS / SIN CONFIRMAR (a quién escribir hoy mismo pidiendo disculpas y proponiendo nueva fecha/hora).
2. AGENDA RECOMENDADA DÍA POR DÍA + CALCE CON GOOGLE CALENDAR (cómo encastrar Café Hub y Puerta a Puerta alrededor de los compromisos del Calendar de César).
3. REGLA DE CONSOLIDACIÓN 1-A-1 (qué hacer según la respuesta de cada vecino: confirmación en Café Hub vs. paso inmediato a recorrido Puerta a Puerta).`;

      let responseText = '';
      let modelUsed = 'gemini-4-argon';

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-argon',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        responseText = response.text || '';
      } catch {
        modelUsed = 'gemini-3.8-flash';
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        responseText = fallbackResponse.text || '';
      }

      res.json({
        ok: true,
        modelUsed,
        analisis: responseText,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al procesar corte con Gemini';
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 2. Ruta de Recomendación de Café Hub con Google Maps Grounding (gemini-3.8-flash + googleMaps)
  app.post('/api/gemini/places-hub', async (req, res) => {
    try {
      const ai = getAiClient();
      const { esquina, barrio, lat, lng, cantidadVecinos } = req.body;

      const prompt = `Necesito recomendar 2 o 3 cafés reales, tranquilos y bien ubicados para sentarme a trabajar con la computadora y recibir a ${cantidadVecinos || 5} vecinos a firmar una ficha de adhesión en papel durante una franja de 2 a 3 horas cerca de ${esquina}, en el barrio de ${barrio}, Ciudad Autónoma de Buenos Aires, Argentina. Indicá nombre del café, dirección exacta y por qué conviene como punto de encuentro.`;

      const configObj: Record<string, any> = {
        tools: [{ googleMaps: {} }],
      };
      if (typeof lat === 'number' && typeof lng === 'number') {
        configObj.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng,
            },
          },
        };
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: configObj,
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const lugaresMaps = chunks
        .filter((c) => c.maps && c.maps.uri)
        .map((c) => ({
          titulo: c.maps?.title || 'Ver en Google Maps',
          uri: c.maps?.uri || '',
        }));

      res.json({
        ok: true,
        recomendacion: response.text || '',
        lugaresMaps,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error consultando Google Maps Grounding';
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 3. Ruta rápida para afinar / acortar un mensaje de WhatsApp según respuesta recibida (gemini-3.1-flash-lite + fallback local inteligente)
  app.post('/api/gemini/redactar', async (req, res) => {
    const { contacto, ultimoMensajeRecibido, mensajeActual, perfilVoz, hacerMasBreve } = req.body || {};
    const instruccionFallback = hacerMasBreve
      ? 'Acortar este mensaje a 2-3 líneas directas'
      : String(ultimoMensajeRecibido || '');

    try {
      const ai = getAiClient();

      const prompt = `Sos ${perfilVoz?.nombrePromotor || 'César Rincón'}, del equipo de *${perfilVoz?.espacioPolitico || 'Hacemos Popurrí'}* (partido en formación: ${perfilVoz?.partidoLegal || 'Regeneración'}).
Estás hablando por WhatsApp con ${contacto?.primerNombre || contacto?.nombre} del barrio ${contacto?.barrio || 'CABA'}.
Comentario actual en planilla: "${contacto?.comentario || 'Sin comentario'}"
Situación detectada: ${contacto?.situacion}
${mensajeActual ? `Borrador actual del mensaje: """${mensajeActual}"""` : ''}
${ultimoMensajeRecibido ? `Último mensaje o instrucción a incorporar: "${ultimoMensajeRecibido}"` : ''}

Redactá ÚNICAMENTE el texto del mensaje de WhatsApp listo para enviar.
Reglas estrictas:
- Voseo rioplatense natural (tenés, podés, avisame, escribime), cálido, respetuoso, cero robótico.
- ${hacerMasBreve ? 'Hacelo SÚPER BREVE (máximo 2 párrafos cortos, menos de 55 palabras en total).' : 'Mantenelo conciso y directo (2 a 3 párrafos breves).'}
- Orientado a concretar los 2 minutos de firma presencial de la ficha de adhesión en papel (con DNI físico en CABA), sin ser insistente ni repetitivo.
- Cerrá con una pregunta clara de coordinación (día/hora o punto de encuentro) y saludo cordial.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
      });

      const textoIA = (response.text || '').trim();
      const mensajeFinal =
        textoIA ||
        (contacto
          ? adaptarMensajeConRespuestaVecinoLocal(
              contacto,
              instruccionFallback,
              mensajeActual,
              perfilVoz
            )
          : mensajeActual || '');

      res.json({
        ok: true,
        mensaje: mensajeFinal,
      });
    } catch {
      const mensajeAdaptadoLocal = contacto
        ? adaptarMensajeConRespuestaVecinoLocal(
            contacto,
            instruccionFallback,
            mensajeActual,
            perfilVoz
          )
        : mensajeActual || '';
      res.json({
        ok: true,
        mensaje: mensajeAdaptadoLocal,
        fallbackLocal: true,
      });
    }
  });

  // 3b. Ruta de Reescritura Polimórfica Anti-Spam con IA Gemini para el bucle de Python / App
  app.post('/api/gemini/variante-primer-contacto', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        nombre,
        sinNombre,
        barrio,
        mensajeBase,
        iteracion = 1,
        incluirOptOutBaja = false,
      } = req.body || {};

      const esCorto = String(mensajeBase || '').length < 280;

      const estilosSaludo = [
        'Empezá con un saludo tipo "Hola [Nombre], ¿cómo estás? 👋"',
        'Empezá con un saludo tipo "¿Qué tal, [Nombre]? ¿Cómo va todo?" sin emojis en el saludo',
        'Empezá con un saludo tipo "Buen día, [Nombre], ¿cómo andás? 😊"',
        'Empezá con un saludo tipo "¡Buenas, [Nombre]! ¿Todo bien?"',
        'Empezá con un saludo tipo "Hola [Nombre], ¿cómo viene la semana? 🙌"',
      ];
      const estiloElegido = estilosSaludo[Math.abs(Number(iteracion) || 0) % estilosSaludo.length];

      const prompt = `Reescribí ligeramente este primer mensaje de WhatsApp de César Rincón (equipo de Hacemos Popurrí / Regeneración en CABA) para la iteración #${iteracion}, manteniendo exactamente la misma intención pero variando el orden de las frases y palabras para que sea 100% natural, conversacional y redactado a mano por un vecino.

Datos del destinatario:
- Nombre: ${sinNombre ? 'SIN NOMBRE CARGADO (debés incluir sutilmente la consulta de su nombre para agendarlo bien)' : nombre}
- Barrio: ${barrio || 'CABA'}

Reglas obligatorias anti-bloqueo de Meta:
1. ${estiloElegido}.
2. Usá voseo rioplatense cálido y natural.
3. ${esCorto ? 'Mantenelo CORTO y conversacional (máximo 210 caracteres, 2 o 3 oraciones breves terminando en una pregunta sencilla como "¿Seguís por la zona esta semana?") para que parezca un chat humano normal y no una plantilla.' : 'Mencioná con naturalidad que es sólo una adhesión en papel de 2 minutos (no es afiliación) con DNI en CABA.'}
4. PROHIBIDO incluir enlaces web (ni http, ni www, ni bit.ly).
5. ${incluirOptOutBaja ? 'Incluí al final una frase breve y natural aclarando que si prefiere no recibir mensajes te avise.' : 'PROHIBIDO agregar frases robóticas tipo "respondé Baja" o pies de firma de marketing.'}

Mensaje base de referencia:
"""
${mensajeBase || ''}
"""

Devolvé ÚNICAMENTE el texto final del mensaje listo para enviar, sin comillas ni explicaciones.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
      });

      const limpio = (response.text || '')
        .replace(/https?:\/\/[^\s)]+/gi, '')
        .trim();

      res.json({
        ok: true,
        mensaje: limpio || mensajeBase,
      });
    } catch {
      // Fallback inmediato al mensaje polimórfico Spintax si no hay cuota o conexión
      res.json({
        ok: true,
        mensaje: req.body?.mensajeBase || '',
        fallback: true,
      });
    }
  });

  // 4. Sincronización automática en 1 clic con Google Sheets sin bloqueo de Protección Avanzada (Error 400)
  app.post('/api/sheets/fetch-live', async (req, res) => {
    try {
      const rawSheetInput = String(req.body?.sheetUrlOrId || '').trim();
      const rawScriptInput = String(req.body?.appsScriptUrl || '').trim();

      // Auto-detectar si el usuario pegó la URL de Sheets en el casillero de Apps Script o viceversa
      let effectiveSheetUrl = rawSheetInput;
      let effectiveScriptUrl = rawScriptInput;

      if (rawSheetInput.startsWith('https://script.google.com/') && !rawScriptInput) {
        effectiveScriptUrl = rawSheetInput;
        effectiveSheetUrl = '';
      }
      if (
        rawScriptInput.includes('docs.google.com/spreadsheets') &&
        !rawScriptInput.startsWith('https://script.google.com/')
      ) {
        if (!effectiveSheetUrl) effectiveSheetUrl = rawScriptInput;
        effectiveScriptUrl = '';
      }

      const esRespuestaHtml = (txt: string) => {
        const trimmed = txt.trim();
        return (
          /^<!doctype/i.test(trimmed) ||
          /^<html/i.test(trimmed) ||
          trimmed.includes('accounts.google.com') ||
          trimmed.includes('ServiceLogin')
        );
      };

      let scriptWarning = '';

      // A. Si configuró el Puente Nativo de Google Apps Script, intentar leer de ahí de forma segura
      if (effectiveScriptUrl && effectiveScriptUrl.startsWith('https://script.google.com/')) {
        if (effectiveScriptUrl.includes('/edit') && !effectiveScriptUrl.includes('/exec')) {
          scriptWarning =
            'La URL de Apps Script pegada termina en "/edit" (es el editor). Para usar el puente usá la URL de "Implementar -> Aplicación web" que termina en "/exec".';
        } else {
          try {
            const scriptRes = await fetch(effectiveScriptUrl, {
              headers: {
                Accept: 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (compatible; RutasPopurriSync/1.0)',
              },
            });
            const scriptText = await scriptRes.text();

            if (!esRespuestaHtml(scriptText)) {
              const data = JSON.parse(scriptText);
              if (data && (Array.isArray(data.rows) || data.ok)) {
                return res.json({
                  ok: true,
                  source: 'apps_script',
                  rows: data.rows || [],
                  calendarEvents: data.calendarEvents || [],
                });
              }
            } else {
              scriptWarning =
                'El Apps Script devolvió una página de acceso HTML en lugar de JSON. En Apps Script ("Implementar -> Gestionar implementaciones -> Editar") cambiá "Quién tiene acceso" a "Cualquier persona" (Anyone).';
            }
          } catch {
            scriptWarning =
              'No se pudo leer JSON desde la URL de Apps Script; intentando lectura directa del enlace de Google Sheets...';
          }
        }

        // Si no hay URL de Google Sheets para hacer fallback, informar el motivo claro en español
        if (!effectiveSheetUrl) {
          return res.status(400).json({
            ok: false,
            error:
              scriptWarning ||
              'El Apps Script devolvió una página HTML en vez de datos JSON. Asegurate de implementarlo con acceso "Cualquier persona" (Anyone) y usar la URL terminada en "/exec", o pegá el enlace de tu Google Sheets en el casillero 1.',
          });
        }
      }

      if (!effectiveSheetUrl) {
        return res.status(400).json({
          ok: false,
          error: 'Ingresá el enlace o ID de tu documento de Google Sheets.',
        });
      }

      // B. Soportar tanto enlaces publicados (/d/e/2PACX-...) como enlaces normales (/spreadsheets/d/ID/...)
      const publishedMatch = effectiveSheetUrl.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
      const idMatch = effectiveSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const gidMatch = effectiveSheetUrl.match(/[#&?]gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : '0';

      const candidateUrls: string[] = [];
      if (publishedMatch) {
        const pubId = publishedMatch[1];
        candidateUrls.push(
          `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=tsv&gid=${gid}`,
          `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&gid=${gid}`
        );
      }

      const spreadsheetId =
        idMatch && idMatch[1] !== 'e' ? idMatch[1] : effectiveSheetUrl;

      if (spreadsheetId && !publishedMatch) {
        candidateUrls.push(
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=tsv&gid=${gid}`,
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`
        );
      }

      let sawHtmlLogin = false;
      let lastStatus = 0;

      for (const url of candidateUrls) {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; RutasPopurriSync/1.0)',
            },
          });
          lastStatus = response.status;
          const text = await response.text();

          if (esRespuestaHtml(text)) {
            sawHtmlLogin = true;
            continue;
          }

          if (response.ok && text.trim().length > 0) {
            return res.json({
              ok: true,
              source: 'direct_csv',
              csvText: text,
              spreadsheetId,
              warning: scriptWarning || undefined,
            });
          }
        } catch {
          // Probar siguiente URL candidata
        }
      }

      if (sawHtmlLogin || lastStatus === 401 || lastStatus === 403) {
        return res.status(400).json({
          ok: false,
          code: 'SHEET_PRIVATE',
          spreadsheetId,
          gid,
          error:
            'Tu Google Sheets figura como "Restringido" (devolvió página de inicio de sesión). Para que el botón Actualizar cargue todo en 1 clic: en tu Google Sheets hacé clic en "Compartir" (arriba a la derecha) -> en "Acceso general" cambiá "Restringido" por "Cualquier persona con el enlace" (Lector).',
        });
      }

      return res.status(400).json({
        ok: false,
        spreadsheetId,
        gid,
        error: `No se pudo leer el documento de Google Sheets (HTTP ${lastStatus || 400}). Verificá que el enlace sea correcto y que en "Compartir" figure "Cualquier persona con el enlace (Lector)".`,
      });
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : 'Error sincronizando Google Sheets';
      const friendlyMsg =
        rawMsg.includes('Unexpected token') || rawMsg.includes('<!doctype')
          ? 'El documento o Apps Script devolvió una página web (HTML) en lugar de datos. Asegurate de que tu Google Sheets esté compartido como "Cualquier persona con el enlace (Lector)" o que tu Apps Script tenga acceso para "Cualquier persona".'
          : rawMsg;
      res.status(500).json({ ok: false, error: friendlyMsg });
    }
  });

  // 5. Escritura de vuelta al Google Sheets mediante Puente Google Apps Script (sin bloqueo Error 400)
  app.post('/api/sheets/push-live', async (req, res) => {
    try {
      const { appsScriptUrl, action, payload } = req.body;
      const savedUrl = await getSetting('appsScriptUrlInput');
      const targetUrl = (appsScriptUrl && String(appsScriptUrl).trim()) || (savedUrl && String(savedUrl).trim()) || process.env.VITE_APPS_SCRIPT_URL;
      if (!targetUrl || !String(targetUrl).startsWith('https://script.google.com/')) {
        return res.status(400).json({
          ok: false,
          error: 'Para guardar cambios automáticamente sin OAuth, pegá la URL de tu Google Apps Script.',
        });
      }
      const scriptRes = await fetch(String(targetUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action || 'updateRow', payload }),
        redirect: 'follow',
      });
      const scriptText = await scriptRes.text();
      if (/^<!doctype/i.test(scriptText.trim()) || /^<html/i.test(scriptText.trim())) {
        return res.status(400).json({
          ok: false,
          error:
            'Tu Google Apps Script devolvió una página HTML de permiso. En Apps Script abrí "Implementar -> Gestionar implementaciones -> Editar" y cambiá "Quién tiene acceso" a "Cualquier persona" (Anyone).',
        });
      }
      let data: unknown = { ok: scriptRes.ok };
      try {
        data = JSON.parse(scriptText);
      } catch {
        data = { ok: scriptRes.ok };
      }
      res.json({ ok: true, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error enviando datos a Google Sheets';
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 6. Puente en Vivo para el Automatizador Python de Primeros Mensajes (< 45 mensajes)
  interface ServerAutoReportItem {
    campaignId: string;
    contactId: string;
    telefonoNorm: string;
    nombre?: string;
    barrio?: string;
    resultado: 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO_OK' | 'NUMERO_INEXISTENTE' | 'ERROR_ENVIO';
    detalleResultado: string;
    fechaHoraResultadoISO: string;
    sincronizadoSheets?: boolean;
  }

  let activeAutoCampaign: unknown = null;
  const autoReportedItems: ServerAutoReportItem[] = [];

  app.get('/api/auto-wa/status', (_req, res) => {
    res.json({
      ok: true,
      campaign: activeAutoCampaign,
      reports: autoReportedItems,
      serverTimeISO: new Date().toISOString(),
    });
  });

  app.post('/api/auto-wa/campaign', (req, res) => {
    const campaign = req.body?.campaign;
    if (!campaign || !Array.isArray(campaign.items)) {
      return res.status(400).json({ ok: false, error: 'Formato de campaña inválido.' });
    }
    // Regla estricta: jamás aceptar 45 o más mensajes en la cola automática
    campaign.items = campaign.items.slice(0, 44);
    activeAutoCampaign = campaign;
    res.json({
      ok: true,
      campaignId: campaign.campaignId,
      itemsCount: campaign.items.length,
    });
  });

  app.post('/api/auto-wa/report-item', async (req, res) => {
    try {
      const {
        campaignId,
        contactId,
        telefonoNorm,
        nombre,
        barrio,
        resultado,
        detalleResultado,
        fechaHoraResultadoISO,
        appsScriptUrl,
      } = req.body || {};

      if (!contactId && !telefonoNorm) {
        return res.status(400).json({ ok: false, error: 'Falta contactId o telefonoNorm.' });
      }

      const timestamp = fechaHoraResultadoISO || new Date().toISOString();
      const reportEntry: ServerAutoReportItem = {
        campaignId: String(campaignId || 'manual'),
        contactId: String(contactId || ''),
        telefonoNorm: String(telefonoNorm || ''),
        nombre: String(nombre || ''),
        barrio: String(barrio || ''),
        resultado: resultado || 'ENVIADO_OK',
        detalleResultado: String(detalleResultado || ''),
        fechaHoraResultadoISO: timestamp,
        sincronizadoSheets: false,
      };

      // Si el detalle de un supuesto ERROR_ENVIO fue "Tiempo de espera agotado al abrir el chat",
      // tratarlo como ENVIADO_OK si ya había disparado el mensaje, o nunca pisar como contactado si el navegador se cerró antes.
      const resultadoNormalizado =
        resultado === 'ERROR_ENVIO' &&
        /Tiempo de espera agotado al abrir el chat/i.test(String(detalleResultado || ''))
          ? 'ENVIADO_OK'
          : resultado || 'ENVIADO_OK';

      reportEntry.resultado = resultadoNormalizado;

      const hoyBA = obtenerPartesFechaHoraBA();
      const notaComentarioSheet =
        resultadoNormalizado === 'NUMERO_INEXISTENTE'
          ? `[N° inexistente en WhatsApp ${hoyBA.ddmm}]`
          : resultadoNormalizado === 'ENVIADO_OK'
          ? `[1er msj auto enviado ${hoyBA.ddmm} ${hoyBA.hhmm}]`
          : '';

      // Actualizar inmediatamente la memoria persistente del servidor (`sharedStateMemory`)
      const currentSnap = sharedStateMemory || loadSharedState();
      if (currentSnap && Array.isArray(currentSnap.rawContacts)) {
        const idTarget = String(contactId || '').trim();
        const telTarget = normalizarTelefonoWA(String(telefonoNorm || ''));
        const updatedContacts: RawContactRow[] = currentSnap.rawContacts.map((r: RawContactRow): RawContactRow => {
          const rId = String(r.id || '').trim();
          const rTel = normalizarTelefonoWA(r.telRaw);
          const match = (idTarget && rId === idTarget) || (telTarget && rTel === telTarget);
          if (!match) return r;

          const comSinFallosPrevios = (r.comentario || '')
            .replace(/\[Intento auto fallido[^\]]*\]/gi, '')
            .trim();

          if (resultadoNormalizado === 'ENVIADO_OK') {
            const estadoNext: EstadoFlujo = '1ER_MSJ_ENVIADO_SIN_RSP';
            return {
              ...r,
              rsp: r.rsp === 'Sí' ? 'Sí' : 'No',
              adhirio: r.adhirio === 'Sí' ? 'Sí' : 'Pendiente',
              primerContactoEnviado: true,
              fechaPrimerContacto: new Date().toISOString().slice(0, 10),
              ultimoContacto: new Date().toISOString().slice(0, 10),
              intentos: Math.max(1, (r.intentos || 0) + 1),
              comentario: comSinFallosPrevios
                ? `${comSinFallosPrevios} · ${notaComentarioSheet}`
                : notaComentarioSheet,
              estadoFlujo: estadoNext,
              estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoNext),
              actualizadoEnAppAt: timestamp,
            };
          }

          if (resultadoNormalizado === 'NUMERO_INEXISTENTE') {
            const estadoNext: EstadoFlujo = 'DESCARTADO_O_BAJA';
            return {
              ...r,
              rsp: 'No',
              adhirio: 'No',
              primerContactoEnviado: true,
              comentario: comSinFallosPrevios
                ? `${comSinFallosPrevios} · ${notaComentarioSheet}`
                : notaComentarioSheet,
              estadoFlujo: estadoNext,
              estadoFlujoEtiqueta: obtenerEtiquetaEstadoFlujo(estadoNext),
              actualizadoEnAppAt: timestamp,
            };
          }

          // Si hubo error técnico (ej. navegador cerrado), mantenerlo como NO contactado para no perderlo de la cola
          return {
            ...r,
            rsp: 'Nuevo',
            primerContactoEnviado: false,
            comentario: comSinFallosPrevios,
          };
        });

        const nextSnap: SharedAppStateSnapshot = {
          ...currentSnap,
          version: (currentSnap.version || 0) + 1,
          updatedAt: timestamp,
          rawContacts: updatedContacts,
          sentContactIds:
            resultadoNormalizado === 'ENVIADO_OK' && contactId
              ? Array.from(new Set([...(currentSnap.sentContactIds || []), String(contactId)]))
              : currentSnap.sentContactIds,
        };
        sharedStateMemory = nextSnap;
        saveSharedState(nextSnap);
      }

      // Si hay puente Apps Script configurado (en el request o guardado en el estado compartido), empujar la actualización directamente al Google Sheets
      const effectiveAppsScriptUrl = String(
        appsScriptUrl || sharedStateMemory?.appsScriptUrlInput || ''
      ).trim();
      if (
        effectiveAppsScriptUrl.startsWith('https://script.google.com/') &&
        (resultadoNormalizado === 'ENVIADO_OK' || resultadoNormalizado === 'NUMERO_INEXISTENTE')
      ) {
        const estadoSheet =
          resultadoNormalizado === 'ENVIADO_OK'
            ? '2. 1er contacto enviado (Sin respuesta)'
            : '10. Descartado / Baja / N° inexistente';
        try {
          const scriptRes = await fetch(effectiveAppsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'updateRow',
              payload: {
                id: String(contactId || ''),
                telefonoNorm: String(telefonoNorm || ''),
                nombre: String(nombre || ''),
                barrio: String(barrio || ''),
                rsp: 'No',
                adhirio: resultadoNormalizado === 'NUMERO_INEXISTENTE' ? 'No' : 'Pendiente',
                primerContactoEnviado: 'Sí',
                estado: estadoSheet,
                comentarioNota: notaComentarioSheet,
              },
            }),
          });
          if (scriptRes.ok) {
            reportEntry.sincronizadoSheets = true;
          }
        } catch {
          // Si falla el webhook directo, el frontend lo sincroniza al recibir el polling
        }
      }

      const existingIdx = autoReportedItems.findIndex(
        (r) =>
          (reportEntry.contactId && r.contactId === reportEntry.contactId) ||
          (reportEntry.telefonoNorm && r.telefonoNorm === reportEntry.telefonoNorm)
      );
      if (existingIdx >= 0) {
        autoReportedItems[existingIdx] = reportEntry;
      } else {
        autoReportedItems.push(reportEntry);
      }

      res.json({
        ok: true,
        report: reportEntry,
        totalReports: autoReportedItems.length,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error registrando reporte de envío automático';
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 6. Sincronización de máxima precisión con Google Calendar vía URL iCal (.ics) o Puente Apps Script
  app.post('/api/calendar/fetch-ical', async (req, res) => {
    try {
      const rawUrl = String(req.body?.icalUrl || '').trim();
      if (!rawUrl) {
        return res.status(400).json({
          ok: false,
          error: 'Pegá la dirección secreta o pública en formato iCal (.ics) de tu Google Calendar.',
        });
      }

      const normalizedUrl = rawUrl.replace(/^webcal:\/\//i, 'https://');
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RutasPopurriCalendarSync/1.0)',
          Accept: 'text/calendar, application/json, text/plain, */*',
        },
      });

      if (!response.ok) {
        return res.status(400).json({
          ok: false,
          error: `Google Calendar devolvió código ${response.status}. Verificá haber copiado la "Dirección secreta en formato iCal (.ics)" desde la configuración de tu calendario.`,
        });
      }

      const text = await response.text();
      if (text.includes('BEGIN:VCALENDAR')) {
        return res.json({
          ok: true,
          format: 'ical',
          icsText: text,
        });
      }

      try {
        const json = JSON.parse(text);
        if (Array.isArray(json.events || json.items || json)) {
          return res.json({
            ok: true,
            format: 'json',
            events: json.events || json.items || json,
          });
        }
      } catch {
        // Not JSON
      }

      return res.status(400).json({
        ok: false,
        error:
          'El enlace proporcionado no devolvió un calendario iCal (.ics) válido. En Google Calendar abrí "Configuración y uso compartido" -> "Dirección secreta en formato iCal" y copiá ese enlace.',
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Error al conectar con el enlace iCal de Google Calendar';
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // 6.b CRUD persistente de eventos de Calendar en SQLite
  app.get('/api/calendar-events', (_req, res) => {
    try {
      const events = getCalendarEvents();
      res.json({ ok: true, events });
    } catch {
      res.status(500).json({ ok: false, error: 'Error leyendo eventos de calendario' });
    }
  });

  app.put('/api/calendar-events', (req, res) => {
    try {
      const { events, source } = req.body;
      if (Array.isArray(events)) {
        replaceCalendarEvents(events, source || 'sync');
        return res.json({ ok: true, count: events.length });
      }
      res.status(400).json({ ok: false, error: 'Formato de eventos inválido' });
    } catch {
      res.status(500).json({ ok: false, error: 'Error guardando eventos de calendario' });
    }
  });

  app.post('/api/calendar-events/replace', (req, res) => {
    try {
      const { events, source } = req.body;
      if (Array.isArray(events)) {
        replaceCalendarEvents(events, source || 'ical_sync');
        return res.json({ ok: true, count: events.length });
      }
      res.status(400).json({ ok: false, error: 'Formato de eventos inválido' });
    } catch {
      res.status(500).json({ ok: false, error: 'Error guardando eventos de calendario' });
    }
  });

  app.post('/api/calendar-events', (req, res) => {
    try {
      const { event, source } = req.body;
      if (event && event.id) {
        upsertCalendarEvent(event, source || 'manual');
        return res.json({ ok: true });
      }
      res.status(400).json({ ok: false, error: 'Evento inválido' });
    } catch {
      res.status(500).json({ ok: false, error: 'Error guardando evento de calendario' });
    }
  });

  app.delete('/api/calendar-events/:id', (req, res) => {
    try {
      deleteCalendarEvent(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: 'Error eliminando evento de calendario' });
    }
  });

  // 7. Estado persistente unificado entre dispositivos (PC, notebook/compu, celular) y recargas respaldado en SQLite
  let sharedStateMemory: SharedAppStateSnapshot | null = loadSharedState();

  app.get('/api/state', (_req, res) => {
    sharedStateMemory = loadSharedState();
    res.json({
      ok: true,
      hasState: Boolean(sharedStateMemory),
      state: sharedStateMemory,
    });
  });

  app.post('/api/state', (req, res) => {
    try {
      const incoming = req.body as Partial<SharedAppStateSnapshot> | undefined;
      if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ ok: false, error: 'Payload de estado inválido' });
      }

      const prev = sharedStateMemory || loadSharedState();
      const mergedControlMap = new Map<string, ControlEnvioRegistro>();
      for (const item of [...(incoming.controlEnvios || []), ...(prev?.controlEnvios || [])]) {
        if (item?.idRegistro && !mergedControlMap.has(item.idRegistro)) {
          mergedControlMap.set(item.idRegistro, item);
        }
      }
      const mergedControlEnvios = Array.from(mergedControlMap.values()).slice(0, 150);

      const controlKeys = new Set<string>();
      for (const reg of mergedControlEnvios) {
        if (reg.contactId) controlKeys.add(`id:${String(reg.contactId).trim()}`);
      }

      let mergedContacts: RawContactRow[] | undefined = prev?.rawContacts;
      if (Array.isArray(incoming.rawContacts) && incoming.rawContacts.length > 0) {
        mergedContacts =
          prev?.rawContacts && prev.rawContacts.length > 0
            ? fusionarContactosMultiDispositivo(prev.rawContacts, incoming.rawContacts, controlKeys)
            : incoming.rawContacts;
      }

      const mergedSentIds = Array.from(
        new Set([...(prev?.sentContactIds || []), ...(incoming.sentContactIds || [])])
      );
      const mergedAlertaOcultaIds = Array.from(
        new Set([...(prev?.alertaOcultaIds || []), ...(incoming.alertaOcultaIds || [])])
      );

      const nextSnapshot = sanitizeSnapshot({
        version: (prev?.version || 0) + 1,
        updatedAt: new Date().toISOString(),
        rawContacts: mergedContacts,
        controlEnvios: mergedControlEnvios,
        sentContactIds: mergedSentIds,
        alertaOcultaIds: mergedAlertaOcultaIds,
        respuestasConsolidadasLog: {
          ...(prev?.respuestasConsolidadasLog || {}),
          ...(incoming.respuestasConsolidadasLog || {}),
        },
        modalidadOverrideByBloque: {
          ...(prev?.modalidadOverrideByBloque || {}),
          ...(incoming.modalidadOverrideByBloque || {}),
        },
        cafeHubOverrideByBloque: {
          ...(prev?.cafeHubOverrideByBloque || {}),
          ...(incoming.cafeHubOverrideByBloque || {}),
        },
        calendarEvents:
          Array.isArray(incoming.calendarEvents) && incoming.calendarEvents.length > 0
            ? incoming.calendarEvents
            : prev?.calendarEvents,
        sheetUrlInput: incoming.sheetUrlInput ?? prev?.sheetUrlInput,
        appsScriptUrlInput: incoming.appsScriptUrlInput ?? prev?.appsScriptUrlInput,
        calendarIcalUrlInput: incoming.calendarIcalUrlInput ?? prev?.calendarIcalUrlInput,
        profile: incoming.profile ?? prev?.profile,
      });

      sharedStateMemory = nextSnapshot;
      saveSharedState(nextSnapshot);

      res.json({
        ok: true,
        version: nextSnapshot.version,
        updatedAt: nextSnapshot.updatedAt,
        state: nextSnapshot,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error guardando estado compartido';
      res.status(500).json({ ok: false, error: msg });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true, status: 'healthy' });
  });

  const candidateDist = [path.join(__dirname, 'dist'), path.join(process.cwd(), 'dist')];
  const diskDistPath = candidateDist.find((p) => fs.existsSync(path.join(p, 'index.html')));
  const isDevScript =
    process.env.NODE_ENV === 'development' ||
    process.env.npm_lifecycle_event === 'dev';
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.BUN_STANDALONE) ||
    !isDevScript;

  if (isProd && diskDistPath) {
    app.use(express.static(diskDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(diskDistPath, 'index.html'));
    });
  } else if (isProd && hasEmbeddedFrontend()) {
    // Modo 100% Autocontenido: El ejecutable sirve el frontend desde su propia memoria (sin requerir carpeta dist)
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api')) return next();

      const asset = getEmbeddedAsset(req.path);
      if (asset) {
        res.setHeader('Content-Type', asset.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(asset.buffer);
      }
      next();
    });

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const index = getEmbeddedIndexHtml();
      if (index) {
        res.setHeader('Content-Type', index.contentType);
        return res.send(index.buffer);
      }
      res.status(404).send('No frontend found');
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/data/**',
            '**/wa_session/**',
            '**/*.db',
            '**/*.db-wal',
            '**/*.db-shm',
            '**/*.journal',
            '**/*.tmp',
            '**/*.log',
            /[\\/]data[\\/]/,
            /[\\/]wa_session[\\/]/,
            /\.(db|db-wal|db-shm|tmp|journal)($|[?#])/,
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rutas POPURRÍ server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

