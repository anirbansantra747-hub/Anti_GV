/**
 * Socket.io event name constants.
 * Single source of truth — both client and server import from here.
 * NEVER hardcode event strings. Always use these constants.
 */
export const SOCKET_EVENTS = {
  // Agent events (AI Panel ↔ Server)
  AGENT_THINKING: 'agent:thinking',
  AGENT_PLAN: 'agent:plan',
  AGENT_STEP_START: 'agent:step:start',
  AGENT_STEP_CODE: 'agent:step:code',
  AGENT_STEP_VERIFY: 'agent:step:verify',
  AGENT_STEP_DONE: 'agent:step:done',
  AGENT_ERROR: 'agent:error',
  AGENT_DONE: 'agent:done',
  AGENT_APPROVE: 'agent:approve',
  AGENT_REJECT: 'agent:reject',
  AGENT_CANCEL: 'agent:cancel',

  // Execution events (Code Runner ↔ Server)
  EXECUTE: 'execute',
  EXECUTE_RESULT: 'execution:result',
  EXECUTE_STATUS: 'execution:status',
  EXECUTE_KILL: 'execute:kill',
};
