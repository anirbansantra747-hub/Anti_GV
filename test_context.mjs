import { contextService } from './apps/web/src/services/contextService.js';

async function run() {
  try {
    console.log('Building context...');
    const result = await contextService.buildContext({
      activeFile: null,
      openTabs: [],
      userPrompt: 'hello',
    });
    console.log('Context built success:', result.contextString.length, 'chars');
  } catch (e) {
    console.error('Error in contextService!', e);
  }
}

run();
