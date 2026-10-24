import { getDatabase } from '@shadow-llm/shared';
import { ShadowWorker } from './worker.js';

export * from './sandbox.js';
export * from './worker.js';

async function main() {
  console.log('[ShadowLLM Worker] Initializing standalone worker process...');
  const db = await getDatabase();
  await db.init();

  const worker = new ShadowWorker();
  worker.start();

  const shutdown = () => {
    console.log('[ShadowLLM Worker] Shutting down...');
    worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
