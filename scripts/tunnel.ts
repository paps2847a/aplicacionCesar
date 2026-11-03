import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cloudflaredExe = path.join(rootDir, 'bin', 'cloudflared.exe');

if (!fs.existsSync(cloudflaredExe)) {
  console.error(`[Error] No se encontró el binario de Cloudflare Tunnel en: ${cloudflaredExe}`);
  process.exit(1);
}

console.log('\n🚀 Iniciando Túnel Seguro Cloudflare hacia http://localhost:3000...\n');

const child = spawn(
  cloudflaredExe,
  ['tunnel', '--protocol', 'http2', '--url', 'http://localhost:3000'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }
);

let tunnelFound = false;

function handleOutput(data: Buffer) {
  const text = data.toString();
  // Cloudflare imprime la URL en stderr o stdout con formato: https://xxxx.trycloudflare.com
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !tunnelFound) {
    tunnelFound = true;
    const url = match[0];

    QRCode.toString(url, { type: 'terminal', small: true }, (err, qr) => {
      console.log('\n====================================================================');
      console.log('       🌐 POPURRAPP - TÚNEL SEGURO HTTPS ACTIVO PARA CELULAR        ');
      console.log('====================================================================\n');
      console.log('  URL de Acceso Móvil (válida en cualquier red 4G/5G/WiFi):');
      console.log(`  👉 ${url}\n`);
      console.log('  Escaneá este código QR con la cámara de tu teléfono para entrar:\n');
      if (!err && qr) {
        console.log(qr);
      }
      console.log('====================================================================');
      console.log('  ℹ️  Mantené tu PC encendida con este túnel y el servidor corriendo.');
      console.log('  ℹ️  Al presionar Ctrl+C, el túnel se cerrará de forma segura.');
      console.log('====================================================================\n');
    });
  }
}

child.stdout.on('data', handleOutput);
child.stderr.on('data', handleOutput);

child.on('close', (code) => {
  console.log(`\n🛑 Túnel cerrado (código ${code}).`);
});

process.on('SIGINT', () => {
  console.log('\nCerrando túnel...');
  child.kill();
  process.exit(0);
});
