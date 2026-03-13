import { classifyIntent } from './apps/server/src/services/agent/intentClassifier.js';

async function run() {
  console.log('Testing classifyIntent...');
  try {
    const res = await classifyIntent("hello");
    console.log('Result:', res);
  } catch (e) {
    console.error('Error!', e);
  }
}
run();
