import { classifyIntent } from './intentClassifier.js';

const testPrompts = [
  'How does the shadow tree transaction pattern work?',
  'Create a new dark mode toggle component in React.',
  'Look at the AuthController and add JWT expiration checking to the login route.',
  "I'm getting 'ReferenceError: window is not defined' when trying to build the Next.js app.",
  'Clean up the CSS in the entire App.jsx file, group the styled components.',
  'Create a landing page, then add tests for it, and then deploy it to Vercel.',
];

async function runTests() {
  console.log('--- Testing Intent Classifier ---\n');

  for (const prompt of testPrompts) {
    console.log(`Prompt: "${prompt}"`);
    const result = await classifyIntent(prompt);
    console.log(`Result: ${JSON.stringify(result, null, 2)}\n`);
  }
}

runTests();
