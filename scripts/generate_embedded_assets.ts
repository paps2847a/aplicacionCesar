import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_FILE = path.join(ROOT_DIR, 'server', 'embeddedAssets.ts');

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function getAllFiles(dir: string, baseDir: string = dir): { relativePath: string; absolutePath: string }[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: { relativePath: string; absolutePath: string }[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const rel = '/' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
      files.push({ relativePath: rel, absolutePath: fullPath });
    }
  }

  return files;
}

export function generateEmbeddedAssets() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('[embed] Error: La carpeta "dist" no existe. Ejecuta primero "vite build".');
    process.exit(1);
  }

  const files = getAllFiles(DIST_DIR);
  console.log(`[embed] Empaquetando ${files.length} archivos estáticos de dist...`);

  const assetEntries: string[] = [];

  for (const file of files) {
    const ext = path.extname(file.relativePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    const buffer = fs.readFileSync(file.absolutePath);
    const base64 = buffer.toString('base64');

    assetEntries.push(`  ${JSON.stringify(file.relativePath)}: {
    contentType: ${JSON.stringify(contentType)},
    base64: ${JSON.stringify(base64)},
    size: ${buffer.length},
  }`);
  }

  const tsContent = `// ARCHIVO AUTOGENERADO POR scripts/generate_embedded_assets.ts
// Permite que el ejecutable de Bun sea 100% portable y autocontenido sin requerir la carpeta 'dist'.

export interface EmbeddedAsset {
  contentType: string;
  base64: string;
  size: number;
}

export const EMBEDDED_FRONTEND_ASSETS: Record<string, EmbeddedAsset> = {
${assetEntries.join(',\n')}
};

// Mapa precacheado de Buffers en memoria para servir en 0ms
const bufferCache = new Map<string, { buffer: Buffer; contentType: string }>();

export function getEmbeddedAsset(urlPath: string): { buffer: Buffer; contentType: string } | null {
  const normalized = urlPath === '/' ? '/index.html' : urlPath;
  if (bufferCache.has(normalized)) {
    return bufferCache.get(normalized)!;
  }

  const asset = EMBEDDED_FRONTEND_ASSETS[normalized];
  if (!asset) return null;

  const item = {
    buffer: Buffer.from(asset.base64, 'base64'),
    contentType: asset.contentType,
  };
  bufferCache.set(normalized, item);
  return item;
}

export function getEmbeddedIndexHtml(): { buffer: Buffer; contentType: string } | null {
  return getEmbeddedAsset('/index.html');
}

export function hasEmbeddedFrontend(): boolean {
  return Boolean(EMBEDDED_FRONTEND_ASSETS['/index.html']);
}
`;

  fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf-8');
  console.log(`[embed] Archivo de frontend embebido generado exitosamente en ${OUTPUT_FILE}`);
}

generateEmbeddedAssets();
