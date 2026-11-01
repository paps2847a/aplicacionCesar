import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Obtiene la ruta del directorio 'data' adaptada a cada sistema operativo (Windows, Linux, macOS)
 * y a cada modo de ejecución (Desarrollo, Node.js de producción y Ejecutable autocontenido de Bun).
 */
export function getDataDirectory(): string {
  const isStandalone = Boolean(process.env.BUN_STANDALONE);

  if (isStandalone) {
    // En modo ejecutable compilado, colocamos la carpeta 'data' junto al archivo ejecutable (.exe, binario unix)
    // para que la base de datos sea 100% portable y persistente donde el usuario lo guarde.
    const exeDir = path.dirname(process.execPath);
    const exeDirLower = exeDir.toLowerCase();
    const isSystemDir =
      exeDirLower.includes('system32') ||
      exeDirLower.startsWith('/usr/') ||
      exeDirLower.startsWith('/bin') ||
      exeDirLower === '/';

    const targetDir = isSystemDir
      ? path.resolve(process.cwd(), 'data')
      : path.join(exeDir, 'data');

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch {}
    }
    return targetDir;
  }

  // En modo desarrollo / node normal:
  const candidateDir = fs.existsSync(path.resolve(__dirname, '../data'))
    ? path.resolve(__dirname, '../data')
    : path.resolve(__dirname, '../../data');

  const resolved = fs.existsSync(candidateDir)
    ? candidateDir
    : path.resolve(process.cwd(), 'data');

  if (!fs.existsSync(resolved)) {
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch {}
  }
  return resolved;
}

/**
 * Detecta ejecutables de navegadores Chromium en Windows, macOS y Linux
 * para automatizar WhatsApp Web sin requerir descargas pesadas de Puppeteer.
 */
export function getSystemBrowserExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  const candidates: string[] = [];

  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    candidates.push(
      path.join(progFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(progFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(progFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(progFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(progFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      path.join(localAppData, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
    );
  } else if (isMac) {
    const home = os.homedir();
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      path.join(home, 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser'),
      path.join(home, 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')
    );
  } else if (isLinux) {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/brave-browser',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable'
    );
  }

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        return p;
      }
    } catch {}
  }

  return undefined;
}

/**
 * Detecta el binario Language Server / Antigravity CLI según el sistema operativo
 */
export function getLanguageServerCandidates(): string[] {
  const isWin = process.platform === 'win32';
  const home = os.homedir();
  const binaryName = isWin ? 'language_server.exe' : 'language_server';

  const candidates: string[] = [];

  if (process.env.ANTIGRAVITY_AGENTAPI_EXE) {
    candidates.push(path.join(path.dirname(process.env.ANTIGRAVITY_AGENTAPI_EXE), binaryName));
  }

  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs\\antigravity\\resources\\bin\\language_server.exe'));
    }
  } else {
    // Linux y macOS
    candidates.push(
      path.join(home, '.gemini/antigravity/bin', binaryName),
      path.join(home, '.config/Antigravity/bin', binaryName),
      '/Applications/Antigravity.app/Contents/Resources/bin/language_server',
      path.join(home, 'Applications/Antigravity.app/Contents/Resources/bin/language_server')
    );
  }

  return candidates.filter((c) => {
    try {
      return fs.existsSync(c);
    } catch {
      return false;
    }
  });
}
