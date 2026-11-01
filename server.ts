import 'dotenv/config';
if (process.env.DISABLE_HMR === undefined) {
  process.env.DISABLE_HMR = 'true';
}
// Register TypeScript and ESM loader hooks for native node execution (e.g. `node server.ts` in Cloud Run)
import 'tsx';

await import('./server/main.ts');
