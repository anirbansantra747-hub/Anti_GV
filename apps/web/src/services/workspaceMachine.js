/* eslint-disable no-unused-vars */
/**
 * @file workspaceMachine.js
 * @description Formal Closed State Machine for the V3 Workspace Runtime.
 * Validates all workspace state transitions. Prevents illegal mutations (e.g.
 * writing a file while in DIFF_REVIEW state). Subscribes to the eventBus.
 */

import { bus, Events } from './eventBus.js';
import { memfs } from './memfsService.js';
import { WorkspaceState } from '../models/WorkspaceContracts.js';

// Legal transitions: { from: Set<allowedFrom> }
const TRANSITIONS = {
  [WorkspaceState.AI_PENDING]: new Set([WorkspaceState.IDLE]),
  [WorkspaceState.DIFF_REVIEW]: new Set([WorkspaceState.AI_PENDING]),
  [WorkspaceState.COMMITTING]: new Set([WorkspaceState.DIFF_REVIEW]),
  [WorkspaceState.CONFLICT]: new Set([WorkspaceState.IDLE, WorkspaceState.COMMITTING]),
  [WorkspaceState.ERROR]: new Set([WorkspaceState.AI_PENDING, WorkspaceState.COMMITTING]),
  [WorkspaceState.IDLE]: new Set([
    WorkspaceState.COMMITTING,
    WorkspaceState.ERROR,
    WorkspaceState.CONFLICT,
  ]),
};

class WorkspaceMachine {
  constructor() {
    this._setupListeners();
  }

  /**
   * Attempt to transition the workspace to a new state.
   * @param {string} nextState
   * @returns {boolean} True if transition was successful
   */
  transition(nextState) {
    const currentState = memfs.workspace.state;

    if (!TRANSITIONS[nextState]?.has(currentState)) {
      console.warn(
        `[WorkspaceMachine] Illegal transition: ${currentState} → ${nextState}. Ignoring.`
      );
      return false;
    }

    memfs.workspace.state = nextState;
    bus.emit(Events.WS_STATE_CHANGED, { from: currentState, to: nextState });
    console.log(`[WorkspaceMachine] State: ${currentState} → ${nextState}`);
    return true;
  }

  _setupListeners() {
    // When AI starts editing → lock the workspace
    bus.on(Events.AI_EDIT_INTENT, (payload) => {
      if (this.transition(WorkspaceState.AI_PENDING)) {
        memfs.workspace.locked = true;
        console.log('[WorkspaceMachine] Workspace locked for AI mutation.');
      }
    });

    // AI produced a diff → move to DIFF_REVIEW so human can inspect
    bus.on(Events.DIFF_READY, () => {
      this.transition(WorkspaceState.DIFF_REVIEW);
    });

    // User approved the diff → commit to Tier 1
    bus.on(Events.AI_APPROVE_DIFF, () => {
      if (this.transition(WorkspaceState.COMMITTING)) {
        // After commit, return to IDLE
        this.transition(WorkspaceState.IDLE);
        memfs.workspace.locked = false;
      }
    });

    // User rejected the diff → discard shadow tree, return to IDLE
    bus.on(Events.AI_REJECT_DIFF, () => {
      memfs.workspace.state = WorkspaceState.IDLE;
      memfs.workspace.locked = false;
      bus.emit(Events.WS_STATE_CHANGED, {
        from: WorkspaceState.DIFF_REVIEW,
        to: WorkspaceState.IDLE,
      });
    });

    // Conflict detected during remote sync
    bus.on(Events.CONFLICT_DETECTED, () => {
      this.transition(WorkspaceState.CONFLICT);
    });
  }
}

// Instantiate immediately — it self-wires to the bus on creation.
export const workspaceMachine = new WorkspaceMachine();
