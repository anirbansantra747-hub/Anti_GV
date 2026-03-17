import { readFile, exists } from '../fs/fileService.js';
import path from 'path';

// Inline path normalization to avoid circular dependency with coderAgent.js
function normalizePath(filePath) {
  if (!filePath) return '/';
  let normalized = filePath.replace(/\\/g, '/').trim();
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return normalized;
}

/**
 * An in-memory staging area for file edits.
 * Prevents partial or conflicting changes from hitting the live workspace before approval.
 */
class ShadowWorkspace {
  constructor() {
    this.stagedFiles = new Map(); // Normalized path -> content
    this.fileGroups = new Map();  // groupId -> Set<normalizedPath>
    this.conflicts = [];
  }

  async getFileContent(filePath) {
    const normalized = normalizePath(filePath);
    if (this.stagedFiles.has(normalized)) {
      return this.stagedFiles.get(normalized);
    }
    if (await exists(normalized)) {
      return await readFile(normalized);
    }
    return '';
  }

  async stagePatch(fileGroupId, filePath, newContent) {
    const normalized = normalizePath(filePath);
    
    // Check for cross-group conflicts
    for (const [groupId, files] of this.fileGroups.entries()) {
      if (groupId !== fileGroupId && files.has(normalized)) {
        this.conflicts.push({
          file: normalized,
          groups: [groupId, fileGroupId],
          message: `File modified by both ${groupId} and ${fileGroupId}`
        });
      }
    }

    // Track the file in the group
    if (!this.fileGroups.has(fileGroupId)) {
      this.fileGroups.set(fileGroupId, new Set());
    }
    this.fileGroups.get(fileGroupId).add(normalized);

    // Stage the content
    this.stagedFiles.set(normalized, newContent);
  }

  getGroupFiles(fileGroupId) {
    const group = this.fileGroups.get(fileGroupId);
    return group ? Array.from(group) : [];
  }

  getConflicts() {
    return this.conflicts;
  }

  hasConflicts(fileGroupId) {
    return this.conflicts.some(c => c.groups.includes(fileGroupId));
  }

  clearGroup(fileGroupId) {
    const files = this.fileGroups.get(fileGroupId);
    if (files) {
      files.forEach(f => this.stagedFiles.delete(f));
      this.fileGroups.delete(fileGroupId);
    }
    // Remove resolved conflicts
    this.conflicts = this.conflicts.filter(c => !c.groups.includes(fileGroupId));
  }

  clearAll() {
    this.stagedFiles.clear();
    this.fileGroups.clear();
    this.conflicts = [];
  }
}

// Singleton instance for the current agent run
export const activeShadowWorkspace = new ShadowWorkspace();
