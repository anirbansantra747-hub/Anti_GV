import { assembleContext } from './contextAssembler.js';

// Mocked data coming from the frontend's contextService.buildContext()
const mockFrontendContext = {
  contextString:
    "## User Prompt\nCan you add a new endpoint?\n\n---\n\n## File Tree\n```\nsrc/\n  App.jsx\n  index.css\npackage.json\n```\n\n---\n\n## Active File: /src/App.jsx\n```\nimport React from 'react';\n\nexport default function App() {\n  return <div>Hello World</div>;\n}\n```",
  fileTree: ['src/App.jsx', 'src/index.css', 'package.json'],
  includedFiles: ['/src/App.jsx'],
};

// Mocked server-side data
const mockServerContext = {
  terminalOutput: `Error: 'window' is not defined\n    at App (App.jsx:4:5)`,
};

console.log('--- Testing Context Assembler ---\n');
const assembled = assembleContext(mockFrontendContext, mockServerContext);
console.log(assembled);
