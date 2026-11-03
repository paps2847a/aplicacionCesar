import 'dotenv/config';
if (!process.versions.bun) {
  // Register TypeScript and ESM loader hooks for native node execution (e.g. `node server.ts` in Cloud Run)
  // @ts-ignore - dynamic import for runtime loader
  await import('tsx');
}

await import('./server/main.ts');
