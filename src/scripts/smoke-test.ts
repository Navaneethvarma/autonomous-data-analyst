import { mastra } from '../mastra/index.js';
import { isLiveModelConfigured, validateOpenAiApiKey } from '../config/env.js';

async function runSmokeTest(): Promise<void> {
  console.log('--- Autonomous Data Analyst Agent Smoke Test ---');

  if (!isLiveModelConfigured()) {
    console.log('\n[NOTICE] Live model call skipped: OPENAI_API_KEY is not configured.');
    console.log('To run a live test with OpenAI:');
    console.log('  1. Copy .env.example to .env');
    console.log('  2. Set your valid OPENAI_API_KEY in .env');
    console.log('  3. Re-run: npm run smoke-test\n');
    return;
  }

  try {
    validateOpenAiApiKey();
    console.log('API key detected. Initializing agent for smoke test...');
    const agent = mastra.getAgent('dataAnalystAgent');

    const prompt = 'Please state your core identity and how you handle questions when no dataset has been provided yet.';
    console.log(`Sending prompt: "${prompt}"`);

    const response = await agent.generate(prompt);
    console.log('\nAgent Response:');
    console.log(response.text);
    console.log('\n--- Smoke Test Succeeded ---');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n[ERROR] Smoke test failed:', message);
    process.exit(1);
  }
}

runSmokeTest();
