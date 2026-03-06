import { generatePlan } from './plannerAgent.js';

const mockContext = `
ACTIVE FILE (apps/web/src/App.jsx):
import React from 'react';
function App() {
  return <div>Hello World</div>;
}
export default App;

FILE TREE:
/apps/web/src/App.jsx
/apps/web/src/components/
`;

const mockPrompt = `Add a new highly styled modern Header component and import it into App.jsx.`;

const testPlanner = async () => {
  console.log('--- Testing Module 5: Planner Agent ---');
  console.log(`Prompt: ${mockPrompt}\n`);

  try {
    const plan = await generatePlan(mockPrompt, mockContext);
    console.log('--- Plan JSON Output ---');
    console.log(JSON.stringify(plan, null, 2));

    if (plan && plan.steps && plan.steps.length > 0) {
      console.log('✅ Planner Agent successfully output valid JSON schema.');
      process.exit(0);
    } else {
      console.error('❌ Planner Agent failed to generate steps.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Planner Agent threw an error:', error);
    process.exit(1);
  }
};

testPlanner();
