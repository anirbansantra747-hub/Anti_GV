import crypto from 'crypto';

class FailurePatternDetector {
  constructor() {
    this.memory = new Map(); // ErrorSignature -> { count, lastSeen, history }
    this.stepContexts = new Map(); // stepId -> { signatures: Set }
  }

  /**
   * Generates a deterministic signature for an error based on the feedback string.
   */
  hashError(feedback, fileGroup) {
    const raw = `${fileGroup}::${String(feedback).trim().toLowerCase()}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  /**
   * Analyzes an error and decides on the recovery strategy.
   * Returns: { action: 'retry' | 'switch_model' | 'escalate_to_user', message: string }
   */
  evaluateFailure(stepId, fileGroup, feedback) {
    const signature = this.hashError(feedback, fileGroup);
    
    if (!this.memory.has(signature)) {
      this.memory.set(signature, { count: 0, lastSeen: Date.now(), history: [] });
    }

    if (!this.stepContexts.has(stepId)) {
      this.stepContexts.set(stepId, new Set());
    }

    const record = this.memory.get(signature);
    record.count += 1;
    record.lastSeen = Date.now();
    record.history.push({ stepId, timestamp: Date.now() });

    this.stepContexts.get(stepId).add(signature);

    // Decision Logic based on ai-plan.md phase 4.4
    // Be more tolerant: only escalate after many repeated identical failures
    if (record.count >= 5) {
      return {
        action: 'escalate_to_user',
        signature,
        message: 'Persistent failure cycle detected after 5 identical attempts.',
      };
    }

    if (record.count >= 3) {
      return {
        action: 'switch_model',
        signature,
        message: 'Repeated failure detected (3x). Forcing model rotation.',
      };
    }

    const allStepErrors = this.stepContexts.get(stepId);
    if (allStepErrors.size > 8) {
       return {
         action: 'escalate_to_user',
         signature,
         message: 'Too many cascading errors occurred on this step. Escalating for manual review.'
       };
    }

    return {
      action: 'retry',
      signature,
      message: 'Attempting localized retry.',
    };
  }

  clearStep(stepId) {
    this.stepContexts.delete(stepId);
  }

  /**
   * Reset all tracked patterns. Should be called at the start of each new agent run.
   */
  reset() {
    this.memory.clear();
    this.stepContexts.clear();
  }
}

// Singleton for tracking across the entire agent run
export const activePatternDetector = new FailurePatternDetector();
