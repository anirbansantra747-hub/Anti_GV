import path from 'path';
const workspaceRoot = 'C:\\Users\\anirb\\Downloads\\Anti_GV';
const targetPath = '/KitabiKira/views/pages/index.ejs';

const resolved = path.resolve(workspaceRoot, targetPath.replace(/^\/+/, ''));
const resolvedDirect = path.resolve(workspaceRoot, targetPath);

console.log('workspaceRoot:', workspaceRoot);
console.log('targetPath:', targetPath);
console.log('Resolved with replace(/^\\/+/, ""):', resolved);
console.log('Resolved directly:', resolvedDirect);
