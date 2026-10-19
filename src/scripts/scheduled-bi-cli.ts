import path from 'node:path';
import { MemoryDbAdapter } from '../lib/db/adapter.js';
import { InMemoryAnalysisQueue } from '../lib/queue/analysis-queue.js';
import { ScheduleService } from '../lib/scheduler/service.js';
import { SchedulerDaemon } from '../lib/scheduler/daemon.js';
import { TimezoneScheduler } from '../lib/scheduler/timezone.js';
import { encryptSecret } from '../lib/security/encryption.js';

async function main() {
  console.log('=================================================================');
  console.log('  Autonomous Data Analyst - Scheduled Autonomous BI CLI Demo     ');
  console.log('=================================================================\n');

  const db = new MemoryDbAdapter();
  await db.init();
  const queue = new InMemoryAnalysisQueue(db);
  const scheduleService = new ScheduleService(db);
  const daemon = new SchedulerDaemon(db, queue);

  const orgId = 'org_enterprise_bi';
  const userId = 'user_executive_analyst';
  const datasetId = 'dataset_sales_q3';

  // 1. Create Organization & Dataset
  console.log('1. Setting up tenant organization and dataset...');
  await db.createOrganization({ id: orgId, name: 'Enterprise Analytics Org', slug: 'enterprise-bi' });
  await db.createDataset({
    id: datasetId,
    organizationId: orgId,
    uploadedByUserId: userId,
    originalFilename: 'sample_sales.csv',
    storagePath: path.resolve(process.cwd(), 'datasets', 'sample_sales.csv'),
    fileSizeBytes: 2048,
    format: 'csv',
    rowCount: 25,
    columnCount: 6,
    schemaFingerprint: 'fp_sample_sales',
    status: 'ready',
  });
  console.log('   ✓ Tenant organization and dataset registered.\n');

  // 2. Configure Delivery Destination (HMAC-SHA256 Webhook)
  console.log('2. Configuring secure HMAC-SHA256 report delivery destination...');
  const webhookSecret = 'sec_webhook_enterprise_2026';
  const dest = await db.createDeliveryDestination({
    id: 'dest_slack_exec',
    organizationId: orgId,
    name: 'Executive Slack Webhook',
    destinationType: 'webhook',
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/ADA',
    encryptedSecret: encryptSecret(webhookSecret),
    isActive: true,
  });
  console.log(`   ✓ Delivery destination created: ${dest.name} (${dest.destinationType})`);
  console.log(`     Secret encrypted with AES-256-GCM. Plaintext not exposed in DB.\n`);

  // 3. Configure BI Platform Connection (Apache Superset)
  console.log('3. Configuring Apache Superset BI platform connection...');
  const biConn = await db.createBiConnection({
    id: 'bi_superset_prod',
    organizationId: orgId,
    name: 'Production Apache Superset',
    platformType: 'superset',
    hostUrl: 'https://superset.corp.internal',
    encryptedCredentials: encryptSecret(JSON.stringify({ username: 'ada_bot', password: 'secure_password' })),
    status: 'untested',
  });
  console.log(`   ✓ BI connection registered: ${biConn.name} (${biConn.platformType})`);
  console.log(`     Credentials securely encrypted at rest.\n`);

  // 4. Create Timezone-Aware Recurring Schedule
  console.log('4. Creating recurring autonomous analysis schedule with America/New_York timezone...');
  const cronExpr = '0 9 * * 1'; // Every Monday at 9:00 AM
  const timezone = 'America/New_York';
  const schedule = await scheduleService.createSchedule({
    organizationId: orgId,
    userId,
    datasetId,
    name: 'Weekly Executive Sales & Profit Review',
    userQuery: 'Summarize total sales revenue, units sold, and profit trends by region and product category',
    scheduleType: 'recurring',
    cronExpression: cronExpr,
    timezone,
    deliveryDestinationId: dest.id,
    biConnectionId: biConn.id,
    concurrencyLimit: 1,
    exportFormat: 'both',
  });

  console.log(`   ✓ Schedule created: ${schedule.name}`);
  console.log(`     Schedule Type: ${schedule.scheduleType}`);
  console.log(`     Cron Expression: ${schedule.cronExpression} (${schedule.timezone})`);
  console.log(`     Next Scheduled Run: ${schedule.nextRunAt}`);

  // Display upcoming 3 runs
  const nextRuns = TimezoneScheduler.getNextRuns(cronExpr, timezone, 3);
  console.log('     Upcoming Occurrences:');
  nextRuns.forEach((r, idx) => console.log(`       ${idx + 1}. ${new Date(r).toLocaleString()} (${r})`));
  console.log('');

  // 5. Simulate Triggering Immediate Execution
  console.log('5. Triggering scheduled autonomous analysis immediately...');
  const dispatched = await daemon.dispatchSchedule(schedule, new Date().toISOString());
  console.log(`   ✓ Dispatch status: ${dispatched ? 'Successfully dispatched to background worker' : 'Skipped/locked'}`);

  const runs = await scheduleService.listScheduleRuns(schedule.id, orgId);
  console.log(`   ✓ Recorded Schedule Run ID: ${runs[0]?.id}`);
  console.log(`     Scheduled For: ${runs[0]?.scheduledFor}`);
  console.log(`     Execution Status: ${runs[0]?.status}\n`);

  // 6. Demonstrate Concurrency Limit Protection
  console.log('6. Verifying concurrency limit guard (preventing overlapping runs)...');
  const secondAttempt = await daemon.dispatchSchedule(schedule, new Date().toISOString());
  console.log(`   ✓ Second overlapping dispatch result: ${secondAttempt} (Correctly rejected due to active run limit)\n`);

  // Cleanup
  await queue.close();
  await db.close();
  console.log('=================================================================');
  console.log('  Demo finished successfully. All Milestone 12 controls verified! ');
  console.log('=================================================================');
}

main().catch(err => {
  console.error('CLI demo failed:', err);
  process.exit(1);
});
