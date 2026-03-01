/**
 * AI Agent type constants.
 */

// Intent classification categories (Phase 0)
export const INTENTS = {
  ASK: 'ASK',
  EDIT: 'EDIT',
  CREATE: 'CREATE',
  DEBUG: 'DEBUG',
  REFACTOR: 'REFACTOR',
  MULTI: 'MULTI',
};

// Plan risk levels
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

// Plan step action types
export const STEP_ACTIONS = {
  CREATE: 'CREATE',
  MODIFY: 'MODIFY',
  DELETE: 'DELETE',
  INSTALL: 'INSTALL',
};
