import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { CalendarEventItem, RawContactRow } from '../types';
import {
  obtenerEtiquetaEstadoFlujo,
  obtenerPartesFechaHoraBA,
  parsearTSVoCSVContactos,
} from '../utils/logic';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.acls',
  'https://www.googleapis.com/auth/calendar.acls.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.calendars',
  'https://www.googleapis.com/auth/calendar.calendars.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  'https://www.googleapis.com/auth/calendar.events.public.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.settings.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
// In-memory cache for the access token (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso desde Google Auth.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Error al iniciar sesión con Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink?: string;
}

export async function buscarPlanillasEnDrive(): Promise<DriveSpreadsheetFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sesión de Google no activa');

  const q = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=20&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al consultar Google Drive (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.files || [];
}

export async function leerContactosDesdeGoogleSheet(
  spreadsheetId: string
): Promise<{ sheetTitle: string; contacts: RawContactRow[] }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sesión de Google no activa');

  // 1. Obtener metadatos de la planilla para descubrir el nombre real de las pestañas
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!metaRes.ok) {
    throw new Error(`No se pudo abrir la planilla (${metaRes.status}). Verifica el ID o permisos.`);
  }
  const metaData = await metaRes.json();
  const titles: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title || '');
  const targetSheet =
    titles.find((t) => /control|estatus|popurr/i.test(t)) || titles[0] || 'Hoja 1';

  // 2. Leer valores de la pestaña encontrada
  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      targetSheet
    )}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!valRes.ok) {
    throw new Error(`Error al leer los datos de la pestaña "${targetSheet}"`);
  }
  const valData = await valRes.json();
  const rows: string[][] = valData.values || [];
  if (rows.length === 0) {
    return { sheetTitle: targetSheet, contacts: [] };
  }

  const tsvText = rows
    .map((r) =>
      r
        .map((cell) =>
          String(cell ?? '')
            .replace(/\t|\r|\n/g, ' ')
            .trim()
        )
        .join('\t')
    )
    .join('\n');

  const contacts = parsearTSVoCSVContactos(tsvText, true);

  return { sheetTitle: targetSheet, contacts };
}

export async function agregarFilaEnGoogleSheet(
  spreadsheetId: string,
  sheetTitle: string,
  contacto: RawContactRow
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sesión de Google no activa');

  const values = [
    [
      contacto.id,
      contacto.nombre,
      contacto.barrio,
      contacto.telRaw,
      contacto.rsp === 'Sí' ? 'Sí' : 'No',
      contacto.adhirio,
      contacto.comentario,
      contacto.estadoFlujoEtiqueta ||
        (contacto.estadoFlujo ? obtenerEtiquetaEstadoFlujo(contacto.estadoFlujo) : ''),
    ],
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      sheetTitle
    )}:append?valueInputOption=USER_entered`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );
  if (!res.ok) {
    throw new Error(`No se pudo escribir la fila en Google Sheets (${res.status})`);
  }
}

export async function sincronizarPadronEnGoogleSheet(
  spreadsheetId: string,
  sheetTitle: string,
  contactos: RawContactRow[]
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sesión de Google no activa');

  const incluyeEmail = contactos.some((c) => Boolean(c.email));
  const values = incluyeEmail
    ? [
        ['#', 'Nombre', 'Barrio', 'Mail', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado'],
        ...contactos.map((c) => [
          c.id,
          c.nombre,
          c.barrio,
          c.email || '',
          c.telRaw,
          c.rsp === 'Sí' ? 'Sí' : 'No',
          c.adhirio,
          c.comentario,
          c.estadoFlujoEtiqueta ||
            (c.estadoFlujo ? obtenerEtiquetaEstadoFlujo(c.estadoFlujo) : ''),
        ]),
      ]
    : [
        ['#', 'Nombre', 'Barrio', 'Tel', 'RSP', 'Adhirió', 'Comentario', 'Estado'],
        ...contactos.map((c) => [
          c.id,
          c.nombre,
          c.barrio,
          c.telRaw,
          c.rsp === 'Sí' ? 'Sí' : 'No',
          c.adhirio,
          c.comentario,
          c.estadoFlujoEtiqueta ||
            (c.estadoFlujo ? obtenerEtiquetaEstadoFlujo(c.estadoFlujo) : ''),
        ]),
      ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      `${sheetTitle}!A1`
    )}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );
  if (!res.ok) {
    throw new Error(`No se pudo actualizar la hoja en Google Sheets (${res.status})`);
  }
}

export async function listarEventosGoogleCalendar(
  fechaISO?: string,
  diasVentana: number = 14
): Promise<CalendarEventItem[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sesión de Google no activa');

  const hoyBA = obtenerPartesFechaHoraBA();
  const baseISO = fechaISO && /^\d{4}-\d{2}-\d{2}$/.test(fechaISO) ? fechaISO : hoyBA.isoDate;

  // Ventana de lectura: desde ayer a las 00:00 (UTC-3) hasta N días hacia adelante
  const startBaseMs = new Date(`${baseISO}T00:00:00-03:00`).getTime();
  const safeStartMs = Number.isFinite(startBaseMs) ? startBaseMs - 24 * 3600 * 1000 : Date.now() - 24 * 3600 * 1000;
  const safeEndMs = safeStartMs + Math.max(2, diasVentana + 1) * 86400 * 1000;

  const timeMin = new Date(safeStartMs).toISOString();
  const timeMax = new Date(safeEndMs).toISOString();

  // 1. Consultar todos los calendarios de la cuenta (principal + secundarios/trabajo/compartidos)
  let calendarsToFetch: { id: string; summary: string }[] = [
    { id: 'primary', summary: 'Calendario Principal' },
  ];

  try {
    const listRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const items = Array.isArray(listData.items) ? listData.items : [];
      const seleccionados = items
        .filter((cal: any) => !cal.deleted && cal.selected !== false && cal.id && !String(cal.id).includes('#holiday@'))
        .map((cal: any) => ({
          id: String(cal.id),
          summary: String(cal.summaryOverride || cal.summary || 'Mi Calendar'),
        }));
      if (seleccionados.length > 0) {
        calendarsToFetch = seleccionados;
      }
    }
  } catch {
    // Si calendarList falla por permisos, continuar con 'primary'
  }

  // 2. Consultar en paralelo todos los calendarios activos con zona horaria America/Argentina/Buenos_Aires
  const resultadosPorCalendario = await Promise.all(
    calendarsToFetch.map(async (cal) => {
      try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          cal.id
        )}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
          timeMax
        )}&singleEvents=true&orderBy=startTime&maxResults=250&timeZone=${encodeURIComponent(
          'America/Argentina/Buenos_Aires'
        )}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.items || [])
          .filter((ev: any) => ev.status !== 'cancelled')
          .map((ev: any): CalendarEventItem => {
            const isAllDay = Boolean(ev.start?.date && !ev.start?.dateTime);
            const startIso = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T09:00:00-03:00` : '');
            const endIso = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T18:00:00-03:00` : '');
            const dStartMs = startIso ? new Date(startIso).getTime() : Date.now();
            const dEndMs = endIso ? new Date(endIso).getTime() : dStartMs + 3600 * 1000;
            const startBA = obtenerPartesFechaHoraBA(dStartMs);
            const endBA = obtenerPartesFechaHoraBA(dEndMs);

            return {
              id: `${cal.id}-${ev.id || startIso}`,
              summary: ev.summary || 'Compromiso en Calendar',
              location: ev.location || 'CABA',
              fecha: startBA.ddmm,
              fechaISO: startBA.isoDate,
              startTime: isAllDay ? '09:00' : startBA.hhmm,
              endTime: isAllDay ? '18:00' : endBA.hhmm,
              startIso: new Date(dStartMs).toISOString(),
              endIso: new Date(dEndMs).toISOString(),
              calendarName: cal.summary,
              source: 'oauth',
            };
          });
      } catch {
        return [];
      }
    })
  );

  // Deduplicar por resumen + fechaISO + startTime y ordenar cronológicamente
  const todos = resultadosPorCalendario.flat();
  const vistos = new Set<string>();
  const unicos: CalendarEventItem[] = [];
  for (const ev of todos) {
    const clave = `${ev.summary.toLowerCase().trim()}|${ev.fechaISO || ev.fecha}|${ev.startTime}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicos.push(ev);
  }

  return unicos.sort((a, b) => (a.startIso || '').localeCompare(b.startIso || ''));
}

export async function crearEventoGoogleCalendar(params: {
  summary: string;
  location: string;
  description: string;
  startIso: string;
  endIso: string;
}): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sesión de Google no activa');

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        location: params.location,
        description: params.description,
        start: { dateTime: params.startIso },
        end: { dateTime: params.endIso },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Error al agendar evento en Google Calendar (${res.status})`);
  }
}

export async function crearTareaSeguimientoGoogleTasks(params: {
  title: string;
  notes: string;
  dueIso?: string;
}): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sesión de Google no activa');

  const res = await fetch(
    'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: params.title,
        notes: params.notes,
        due: params.dueIso,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Error al crear tarea en Google Tasks (${res.status})`);
  }
}
