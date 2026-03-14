import { resolveSafePath, getWorkspaceRoot } from './src/services/fs/fileService.js';

const root = getWorkspaceRoot();
console.log('Workspace Root:', root);

const testPaths = [
  '/KitabiKira/views/layouts/boilerplate.ejs',
  '/KitabiKira/views/pages/index.ejs',
  '/KitabiKira/public/style.css',
];

testPaths.forEach((tp) => {
  try {
    const resolved = resolveSafePath(tp);
    console.log(`Path: "${tp}" -> Resolved: "${resolved}" (SUCCESS)`);
  } catch (e) {
    console.log(`Path: "${tp}" -> ERROR: ${e.message}`);
  }
});
