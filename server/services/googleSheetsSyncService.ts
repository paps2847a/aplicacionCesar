import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ESTADOS_FLUJO_CATALOGO,
  obtenerEtiquetaEstadoFlujo,
  parsearTextoAEstadoFlujo,
} from '../../src/domain/contacts/contactStatus';
import type { EstadoFlujo } from '../../src/types';

import { getDataDirectory, getLanguageServerCandidates } from '../platformPaths';

const DATA_DIR = getDataDirectory();
const AGY_ENV_CACHE_PATH = path.join(DATA_DIR, 'agy_gsheets_env.json');

export const DEFAULT_SPREADSHEET_ID = '1IjsWFTYXnFZPo76GVbEKngG5ksU5ZLpwxddV1cj6F8k';
export const DEFAULT_CONTROL_SHEET_NAME = 'Control';

const LANGUAGE_SERVER_CANDIDATES = getLanguageServerCandidates();

interface SheetRowEntry {
  rowNum: number; // 1-based row index in Google Sheets (e.g. row 2 for #1)
  cols: string[]; // [id, nombre, barrio, tel, rsp, adhirio, comentario, estado]
}

interface SpreadsheetRowCache {
  spreadsheetId: string;
  updatedAtMs: number;
  maxRowNum: number;
  byId: Map<string, SheetRowEntry>;
  byTelLast8: Map<string, SheetRowEntry>;
}

export interface SheetRowUpdateInput {
  id?: string | number;
  contactId?: string | number;
  nombre?: string;
  barrio?: string;
  tel?: string;
  telRaw?: string;
  telefonoNorm?: string;
  rsp?: string;
  adhirio?: string;
  comentario?: string;
  comentarioNota?: string;
  estado?: string;
  estadoFlujo?: string;
  preserveIdentityColumns?: boolean;
}

const rowCacheBySpreadsheet = new Map<string, SpreadsheetRowCache>();
let writeQueuePromise: Promise<void> = Promise.resolve();
let activeWritesCount = 0;

function persistAndLoadAntigravityEnv(): NodeJS.ProcessEnv {
  let cachedVars: Record<string, string> = {};
  try {
    if (fs.existsSync(AGY_ENV_CACHE_PATH)) {
      cachedVars = JSON.parse(fs.readFileSync(AGY_ENV_CACHE_PATH, 'utf8')) || {};
    }
  } catch {
    // Ignore read errors
  }

  const currentAgyVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && (k.startsWith('ANTIGRAVITY_') || k.startsWith('AGY_'))) {
      currentAgyVars[k] = v;
    }
  }

  if (currentAgyVars.ANTIGRAVITY_LS_ADDRESS) {
    cachedVars = { ...cachedVars, ...currentAgyVars };
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(AGY_ENV_CACHE_PATH, JSON.stringify(cachedVars, null, 2), 'utf8');
    } catch {
      // Ignore write errors
    }
  }

  return {
    ...cachedVars,
    ...process.env,
  };
}

// Persistir variables al cargar el módulo si están disponibles
persistAndLoadAntigravityEnv();

function resolveLanguageServerExe(): string | null {
  for (const candidate of LANGUAGE_SERVER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function extractSpreadsheetId(sheetUrlOrId?: string): string {
  const raw = String(sheetUrlOrId || '').trim();
  if (!raw) return DEFAULT_SPREADSHEET_ID;
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1] && match[1] !== 'e') {
    return match[1];
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) {
    return raw;
  }
  return DEFAULT_SPREADSHEET_ID;
}

export function normalizeOfficialSheetChipLabel(rawEstado?: string): string {
  const clean = String(rawEstado || '').trim();
  if (!clean) {
    return obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP');
  }
  const exactByLabel = ESTADOS_FLUJO_CATALOGO.find(
    (item) => item.label.toLowerCase() === clean.toLowerCase()
  );
  if (exactByLabel) {
    return exactByLabel.label;
  }
  const exactByValue = ESTADOS_FLUJO_CATALOGO.find((item) => item.value === clean);
  if (exactByValue) {
    return exactByValue.label;
  }
  const parsed = parsearTextoAEstadoFlujo(clean);
  if (parsed) {
    return obtenerEtiquetaEstadoFlujo(parsed as EstadoFlujo);
  }
  return obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP');
}

function execGsheetsCli(
  args: string[],
  timeoutMs = 15000
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const exePath = resolveLanguageServerExe();
  if (!exePath) {
    return Promise.resolve({
      ok: false,
      stdout: '',
      stderr: 'language_server.exe no encontrado para plugin-cli gsheets',
    });
  }

  const env = persistAndLoadAntigravityEnv();

  return new Promise((resolve) => {
    execFile(
      exePath,
      ['plugin-cli', 'gsheets', ...args],
      {
        env,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 15 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            stdout: String(stdout || ''),
            stderr: String(stderr || error.message || ''),
          });
          return;
        }
        resolve({
          ok: true,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
        });
      }
    );
  });
}

function updateRowCacheFromTSV(spreadsheetId: string, tsvText: string): SpreadsheetRowCache {
  const lines = tsvText.split(/\r?\n/);
  const byId = new Map<string, SheetRowEntry>();
  const byTelLast8 = new Map<string, SheetRowEntry>();
  let maxRowNum = 1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = line.split('\t').map((c) => c.trim());
    while (cols.length < 8) cols.push('');
    const rowNum = i + 1;
    if (rowNum > maxRowNum) maxRowNum = rowNum;

    const idClean = String(cols[0] || '')
      .replace(/^#/, '')
      .trim();
    const telDigits = String(cols[3] || '').replace(/\D+/g, '');
    const telLast8 = telDigits.length >= 8 ? telDigits.slice(-8) : '';

    const entry: SheetRowEntry = {
      rowNum,
      cols,
    };

    if (idClean) {
      byId.set(idClean, entry);
    }
    if (telLast8) {
      byTelLast8.set(telLast8, entry);
    }
  }

  const cache: SpreadsheetRowCache = {
    spreadsheetId,
    updatedAtMs: Date.now(),
    maxRowNum,
    byId,
    byTelLast8,
  };
  rowCacheBySpreadsheet.set(spreadsheetId, cache);
  return cache;
}

/**
 * Lee en tiempo real (sin caché de CDN) la pestaña Control desde Google Sheets vía gsheets CLI.
 * Si hay una escritura en curso desde la App hacia Google Sheets, espera a que termine primero
 * para garantizar consistencia total.
 */
export async function readControlSheetTSV(sheetUrlOrId?: string): Promise<{
  ok: boolean;
  spreadsheetId: string;
  tsvText?: string;
  rowCount?: number;
  error?: string;
}> {
  const spreadsheetId = extractSpreadsheetId(sheetUrlOrId);

  if (activeWritesCount > 0) {
    try {
      await writeQueuePromise;
    } catch {
      // Continue
    }
  }

  const res = await execGsheetsCli(
    ['readonly', 'read', spreadsheetId, `${DEFAULT_CONTROL_SHEET_NAME}!A1:H600`],
    12000
  );

  if (res.ok && res.stdout.trim().length > 0) {
    const cache = updateRowCacheFromTSV(spreadsheetId, res.stdout);
    return {
      ok: true,
      spreadsheetId,
      tsvText: res.stdout,
      rowCount: cache.byId.size,
    };
  }

  return {
    ok: false,
    spreadsheetId,
    error: res.stderr || 'No se pudo leer mediante gsheets CLI',
  };
}

/**
 * Escribe de forma directa, atómica e inmediata los cambios de uno o más contactos
 * en la pestaña Control de Google Sheets usando gsheets mutate batch.
 */
export async function pushContactUpdatesToSheet(params: {
  sheetUrlOrId?: string;
  appsScriptUrl?: string;
  action?: string;
  updates?: SheetRowUpdateInput[];
  estadosPorId?: Record<string, string>;
}): Promise<{
  ok: boolean;
  method: 'gsheets_cli' | 'apps_script' | 'none';
  updatedCount: number;
  error?: string;
}> {
  const spreadsheetId = extractSpreadsheetId(params.sheetUrlOrId);
  activeWritesCount += 1;

  const runWrite = async (): Promise<{
    ok: boolean;
    method: 'gsheets_cli' | 'apps_script' | 'none';
    updatedCount: number;
    error?: string;
  }> => {
    try {
      let cache = rowCacheBySpreadsheet.get(spreadsheetId);
      if (!cache || cache.byId.size === 0) {
        const readRes = await execGsheetsCli(
          ['readonly', 'read', spreadsheetId, `${DEFAULT_CONTROL_SHEET_NAME}!A1:H600`],
          12000
        );
        if (readRes.ok && readRes.stdout.trim().length > 0) {
          cache = updateRowCacheFromTSV(spreadsheetId, readRes.stdout);
        }
      }

      const batchOps: {
        op: 'write';
        range: string;
        data: (string | number)[][];
      }[] = [];

      // Caso 1: Sincronización de mapa estadosPorId
      if (params.action === 'syncEstadosChips' && params.estadosPorId && cache) {
        for (const [rawId, rawLabel] of Object.entries(params.estadosPorId)) {
          const cleanId = String(rawId || '')
            .replace(/^#/, '')
            .trim();
          const entry = cache.byId.get(cleanId);
          if (!entry) continue;
          const validChip = normalizeOfficialSheetChipLabel(rawLabel);
          if (entry.cols[7] !== validChip) {
            entry.cols[7] = validChip;
            batchOps.push({
              op: 'write',
              range: `${DEFAULT_CONTROL_SHEET_NAME}!H${entry.rowNum}`,
              data: [[validChip]],
            });
          }
        }
      }

      // Caso 2: Actualización de filas individuales o por lote desde la App
      const updatesList = Array.isArray(params.updates) ? params.updates : [];
      if (updatesList.length > 0) {
        // Si algún ID buscado no está aún en caché, refrescar 1 vez la caché desde Google Sheets
        const needsCacheRefresh =
          !cache ||
          updatesList.some((u) => {
            const idTarget = String(u?.id ?? u?.contactId ?? '')
              .replace(/^#/, '')
              .trim();
            return idTarget && !cache!.byId.has(idTarget);
          });

        if (needsCacheRefresh) {
          const readRes = await execGsheetsCli(
            ['readonly', 'read', spreadsheetId, `${DEFAULT_CONTROL_SHEET_NAME}!A1:H600`],
            12000
          );
          if (readRes.ok && readRes.stdout.trim().length > 0) {
            cache = updateRowCacheFromTSV(spreadsheetId, readRes.stdout);
          }
        }

        if (cache) {
          for (const p of updatesList) {
            if (!p) continue;
            const idTarget = String(p.id ?? p.contactId ?? '')
              .replace(/^#/, '')
              .trim();
            const telDigits = String(p.telRaw || p.tel || p.telefonoNorm || '').replace(/\D+/g, '');
            const telLast8 = telDigits.length >= 8 ? telDigits.slice(-8) : '';

            const entry =
              (idTarget ? cache.byId.get(idTarget) : undefined) ||
              (telLast8 ? cache.byTelLast8.get(telLast8) : undefined);

            const validChip = normalizeOfficialSheetChipLabel(p.estado || p.estadoFlujo);

            if (entry) {
              const idNum = Number(idTarget || entry.cols[0]);
              const colA: string | number = Number.isFinite(idNum) && idNum > 0
                ? idNum
                : idTarget || entry.cols[0];

              const colB =
                !p.preserveIdentityColumns && p.nombre !== undefined && p.nombre.trim() !== ''
                  ? p.nombre.trim()
                  : entry.cols[1] || p.nombre || '';
              const colC =
                !p.preserveIdentityColumns && p.barrio !== undefined && p.barrio.trim() !== ''
                  ? p.barrio.trim()
                  : entry.cols[2] || p.barrio || '';
              const colD =
                !p.preserveIdentityColumns && (p.telRaw || p.tel)
                  ? String(p.telRaw || p.tel).trim()
                  : entry.cols[3] || String(p.telRaw || p.tel || '');

              const colE =
                p.rsp !== undefined && String(p.rsp).trim() !== ''
                  ? String(p.rsp).trim()
                  : entry.cols[4] || 'No';
              const colF =
                p.adhirio !== undefined && String(p.adhirio).trim() !== ''
                  ? String(p.adhirio).trim()
                  : entry.cols[5] || 'Pendiente';

              let colG = entry.cols[6] || '';
              if (p.comentario !== undefined) {
                colG = String(p.comentario).trim();
              } else if (p.comentarioNota) {
                const prevCom = String(entry.cols[6] || '')
                  .replace(/\[Intento auto fallido[^\]]*\]/gi, '')
                  .trim();
                colG = prevCom.includes(p.comentarioNota)
                  ? prevCom
                  : prevCom
                  ? `${prevCom} · ${p.comentarioNota}`
                  : p.comentarioNota;
              }

              const colH =
                p.estado || p.estadoFlujo
                  ? validChip
                  : entry.cols[7] || obtenerEtiquetaEstadoFlujo('1ER_MSJ_ENVIADO_SIN_RSP');

              entry.cols = [
                String(colA),
                colB,
                colC,
                colD,
                colE,
                colF,
                colG,
                colH,
              ];

              batchOps.push({
                op: 'write',
                range: `${DEFAULT_CONTROL_SHEET_NAME}!A${entry.rowNum}:H${entry.rowNum}`,
                data: [[colA, colB, colC, colD, colE, colF, colG, colH]],
              });
            } else if (idTarget) {
              const newRowNum = cache.maxRowNum + 1;
              cache.maxRowNum = newRowNum;

              const idNum = Number(idTarget);
              const colA: string | number =
                Number.isFinite(idNum) && idNum > 0 ? idNum : idTarget;
              const colB = String(p.nombre || '').trim();
              const colC = String(p.barrio || 'Palermo').trim();
              const colD = String(p.telRaw || p.tel || p.telefonoNorm || '').trim();
              const colE = String(p.rsp || 'Nuevo').trim();
              const colF = String(p.adhirio || 'Pendiente').trim();
              const colG =
                p.comentario !== undefined
                  ? String(p.comentario).trim()
                  : String(p.comentarioNota || '').trim();
              const colH = validChip;

              const newEntry: SheetRowEntry = {
                rowNum: newRowNum,
                cols: [String(colA), colB, colC, colD, colE, colF, colG, colH],
              };
              cache.byId.set(idTarget, newEntry);
              if (telLast8) {
                cache.byTelLast8.set(telLast8, newEntry);
              }

              batchOps.push({
                op: 'write',
                range: `${DEFAULT_CONTROL_SHEET_NAME}!A${newRowNum}:H${newRowNum}`,
                data: [[colA, colB, colC, colD, colE, colF, colG, colH]],
              });
            }
          }
        }
      }

      if (batchOps.length > 0) {
        const tmpFile = path.join(
          os.tmpdir(),
          `popurri_gsheets_batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`
        );
        try {
          fs.writeFileSync(tmpFile, JSON.stringify(batchOps, null, 2), 'utf8');
          const writeRes = await execGsheetsCli(
            ['mutate', 'batch', spreadsheetId, '-f', tmpFile],
            15000
          );
          if (writeRes.ok) {
            return {
              ok: true,
              method: 'gsheets_cli',
              updatedCount: batchOps.length,
            };
          }
          console.warn('[GoogleSheetsSync] gsheets mutate batch falló:', writeRes.stderr);
        } finally {
          try {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
          } catch {
            // Ignore cleanup errors
          }
        }
      } else if (cache && updatesList.length === 0 && params.action === 'syncEstadosChips') {
        return {
          ok: true,
          method: 'gsheets_cli',
          updatedCount: 0,
        };
      }

      // Fallback al puente Apps Script si gsheets CLI no estuvo disponible
      const scriptUrl = String(params.appsScriptUrl || '').trim();
      if (scriptUrl && scriptUrl.startsWith('https://script.google.com/')) {
        const firstItem = updatesList[0] || {};
        const effectiveAction =
          params.action || (updatesList.length > 1 ? 'batchUpdateRows' : 'updateRow');
        const scriptRes = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: effectiveAction,
            sheetUrlOrId: spreadsheetId,
            sheetId: spreadsheetId,
            estadosPorId: params.estadosPorId || undefined,
            payload: updatesList.length > 1 ? { rows: updatesList } : firstItem,
            updates: updatesList,
            rows: updatesList,
            ...(typeof firstItem === 'object' && firstItem ? firstItem : {}),
          }),
        });
        const scriptText = await scriptRes.text();
        if (!/^<!doctype/i.test(scriptText.trim()) && !/^<html/i.test(scriptText.trim())) {
          return {
            ok: scriptRes.ok,
            method: 'apps_script',
            updatedCount: updatesList.length,
          };
        }
      }

      return {
        ok: false,
        method: 'none',
        updatedCount: 0,
        error: 'No se pudo sincronizar la escritura con Google Sheets.',
      };
    } catch (err) {
      return {
        ok: false,
        method: 'none',
        updatedCount: 0,
        error: err instanceof Error ? err.message : 'Error sincronizando con Google Sheets',
      };
    }
  };

  const resultPromise = writeQueuePromise.then(runWrite, runWrite);
  writeQueuePromise = resultPromise.then(
    () => {},
    () => {}
  );

  try {
    return await resultPromise;
  } finally {
    activeWritesCount = Math.max(0, activeWritesCount - 1);
  }
}
