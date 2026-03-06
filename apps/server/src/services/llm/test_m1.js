import { generateResponse, streamResponse } from './llmRouter.js';
import { handleStream } from './streamHandler.js';

async function runTest() {
  console.log('--- Testing Standard Generation ---');
  try {
    const res = await generateResponse([{ role: 'user', content: 'Say hello in one word.' }]);
    console.log('Router response:', res);
  } catch (e) {
    console.error('Standard generation failed:', e);
  }

  console.log('\n--- Testing Streaming ---');
  try {
    const { stream, provider } = await streamResponse([
      { role: 'user', content: 'Count from 1 to 5' },
    ]);
    console.log(`Streaming started from provider: ${provider}`);

    // Mock socket implementation for testing
    const mockSocket = {
      emit: (event, payload) => {
        if (event === 'agent:step:code') {
          process.stdout.write(payload.chunk);
        }
      },
    };

    const fullMsg = await handleStream(stream, mockSocket, provider);
    console.log('\n\nStream complete! Full message:', fullMsg);
  } catch (e) {
    console.error('Streaming failed:', e);
  }
}

runTest();
