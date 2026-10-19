import { getDatabaseAdapter } from '../lib/db/adapter.js';

async function main() {
  console.log('--- Running Database Migrations ---');
  const adapter = getDatabaseAdapter();
  try {
    await adapter.init();
    console.log('Database migrations applied successfully.');
    const health = await adapter.checkHealth();
    console.log('Database health:', health);
  } catch (err: any) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await adapter.close();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  main();
}
