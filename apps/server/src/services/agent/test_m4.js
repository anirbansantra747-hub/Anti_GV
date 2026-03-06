import { io } from 'socket.io-client';

console.log('--- Testing Agent Orchestrator Socket ---');
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log(`[test] Connected to server: ${socket.id}`);

  // Send a prompt
  socket.emit('agent:prompt', {
    prompt: 'Add error handling to the login route',
    context: {
      contextString: 'Mock frontend context string',
      activeFile: '/routes/auth.js',
    },
  });
});

socket.on('agent:thinking', (payload) => {
  console.log(`🧠 [thinking] ${payload.message}`);
});

socket.on('agent:step:start', (payload) => {
  console.log(`\n▶️  [step:start] ${payload.stepId}: ${payload.description}`);
});

socket.on('agent:plan', (payload) => {
  console.log(`📋 [plan] Received plan:`, payload);
});

socket.on('agent:step:code', (payload) => {
  process.stdout.write(`💻 [code] ${payload.provider || 'sys'}: ${payload.chunk}`);
});

socket.on('agent:step:done', (payload) => {
  console.log(`✅ [step:done] ${payload.stepId}`);
});

socket.on('agent:done', (payload) => {
  console.log(`\n🎉 [done] ${payload.message}`);
  socket.disconnect();
  process.exit(0);
});

socket.on('agent:error', (payload) => {
  console.error(`\n❌ [error] ${payload.message}`);
  socket.disconnect();
  process.exit(1);
});

socket.on('connect_error', (err) => {
  console.error(`\n❌ [connect_error] Failed to connect: ${err.message}`);
  process.exit(1);
});
