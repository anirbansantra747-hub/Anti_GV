import { generateCodeEdits } from './coderAgent.js';

const mockContext = `
ACTIVE FILE (apps/web/src/App.jsx):
import React from 'react';

function App() {
  return (
    <div>Hello World</div>
  );
}

export default App;
`;

const mockPlan = {
  summary: 'Update the App component text',
  risk_level: 'low',
  steps: [
    {
      stepId: 1,
      action: 'MODIFY',
      filePath: 'apps/web/src/App.jsx',
      description: "Change the text from 'Hello World' to 'Hello from Agent!'",
      depends_on: [],
    },
  ],
};

// Mock Socket
const mockSocket = {
  emit: (event, payload) => {
    console.log(`📡 [MockSocket emits ${event}]:`, payload);
  },
};

const testCoderAgent = async () => {
  console.log('--- Testing Module 6: Coder Agent ---');

  try {
    const edits = await generateCodeEdits(mockPlan, mockContext, mockSocket);
    console.log('\n--- Edits JSON Output ---');
    console.log(JSON.stringify(edits, null, 2));

    if (edits && edits.length === 1 && edits[0].edits) {
      console.log('\n✅ Coder Agent successfully output valid JSON edit blocks.');
      process.exit(0);
    } else {
      console.error('\n❌ Coder Agent failed to generate correct edit shapes.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Coder Agent threw an error:', error);
    process.exit(1);
  }
};

testCoderAgent();
