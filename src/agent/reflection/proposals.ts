/**
 * Reflection Proposals — structured change proposals for memory updates.
 *
 * Instead of the reflection subagent directly editing memory files,
 * it produces proposals that can be reviewed, modified, or rejected.
 * This enables:
 * - Human-in-the-loop review for sensitive changes
 * - Batch approval of low-risk changes
 * - Audit trail of what was proposed vs. what was applied
 * - Safer reflection that doesn't corrupt memory on errors
 */

import type { MemorySensitivity, MemoryType } from "../memory/taxonomy";

// ============================================================================
// Proposal Types
// ============================================================================

/**
 * The kind of change a proposal makes.
 */
export type ProposalKind =
  | "create" // Create a new memory file
  | "update" // Update content of existing file
  | "delete" // Delete a memory file
  | "rename" // Rename/move a memory file
  | "merge" // Merge multiple files into one
  | "split" // Split one file into multiple
  | "retire"; // Archive a file (move to archive/)

/**
 * Risk level for a proposal.
 * Determines whether automatic approval is allowed.
 */
export type ProposalRisk =
  | "low" // Safe to auto-approve (public, non-identity)
  | "medium" // Should be reviewed (sensitive or large changes)
  | "high"; // Must be reviewed (identity-critical or contradictory)

/**
 * A single change operation within a proposal.
 */
export interface ProposalOperation {
  /** The operation kind */
  kind: ProposalKind;
  /** Target file path (relative to memory root) */
  targetPath: string;
  /** For updates/creates, the new content */
  newContent?: string;
  /** For updates, the content being replaced (for diff) */
  oldContent?: string;
  /** For renames, the source path */
  sourcePath?: string;
  /** For merges, the paths being merged */
  mergeSources?: string[];
  /** For splits, the resulting paths */
  splitTargets?: string[];
}

/**
 * A reflection proposal — a structured change request for memory.
 */
export interface ReflectionProposal {
  /** Unique proposal ID */
  id: string;
  /** When the proposal was created */
  createdAt: string;
  /** The conversation that triggered this proposal */
  conversationId?: string;
  /** What the proposal is about */
  summary: string;
  /** Why this change is needed */
  reason: string;
  /** The operations to perform */
  operations: ProposalOperation[];
  /** Memory type classification (for routing) */
  memoryType?: MemoryType;
  /** Sensitivity level */
  sensitivity: MemorySensitivity;
  /** Risk assessment */
  risk: ProposalRisk;
  /** Confidence in the proposal (0-1) */
  confidence: number;
  /** Current status */
  status: "pending" | "approved" | "rejected" | "applied" | "failed";
  /** Who approved/rejected (if applicable) */
  reviewedBy?: string;
  /** When reviewed */
  reviewedAt?: string;
  /** Review notes */
  reviewNotes?: string;
  /** When applied (if applicable) */
  appliedAt?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Proposal Factory
// ============================================================================

let proposalIdCounter = 0;

/**
 * Generate a unique proposal ID.
 */
function generateProposalId(): string {
  proposalIdCounter++;
  return `prop-${Date.now()}-${proposalIdCounter}`;
}

/**
 * Reset the proposal counter (for tests).
 */
export function resetProposalCounter(): void {
  proposalIdCounter = 0;
}

/**
 * Create a new reflection proposal.
 */
export function createProposal(options: {
  summary: string;
  reason: string;
  operations: ProposalOperation[];
  memoryType?: MemoryType;
  sensitivity: MemorySensitivity;
  risk: ProposalRisk;
  confidence: number;
  conversationId?: string;
}): ReflectionProposal {
  return {
    id: generateProposalId(),
    createdAt: new Date().toISOString(),
    conversationId: options.conversationId,
    summary: options.summary,
    reason: options.reason,
    operations: options.operations,
    memoryType: options.memoryType,
    sensitivity: options.sensitivity,
    risk: options.risk,
    confidence: Math.max(0, Math.min(1, options.confidence)),
    status: "pending",
  };
}

// ============================================================================
// Proposal Helpers
// ============================================================================

/**
 * Create a simple update proposal.
 */
export function createUpdateProposal(
  targetPath: string,
  oldContent: string,
  newContent: string,
  reason: string,
  options?: {
    memoryType?: MemoryType;
    sensitivity?: MemorySensitivity;
    risk?: ProposalRisk;
    confidence?: number;
    conversationId?: string;
  },
): ReflectionProposal {
  return createProposal({
    summary: `Update ${targetPath}`,
    reason,
    operations: [
      {
        kind: "update",
        targetPath,
        oldContent,
        newContent,
      },
    ],
    memoryType: options?.memoryType,
    sensitivity: options?.sensitivity ?? "public",
    risk: options?.risk ?? "low",
    confidence: options?.confidence ?? 0.8,
    conversationId: options?.conversationId,
  });
}

/**
 * Create a simple create proposal.
 */
export function createCreateProposal(
  targetPath: string,
  content: string,
  reason: string,
  options?: {
    memoryType?: MemoryType;
    sensitivity?: MemorySensitivity;
    risk?: ProposalRisk;
    confidence?: number;
    conversationId?: string;
  },
): ReflectionProposal {
  return createProposal({
    summary: `Create ${targetPath}`,
    reason,
    operations: [
      {
        kind: "create",
        targetPath,
        newContent: content,
      },
    ],
    memoryType: options?.memoryType,
    sensitivity: options?.sensitivity ?? "public",
    risk: options?.risk ?? "medium",
    confidence: options?.confidence ?? 0.7,
    conversationId: options?.conversationId,
  });
}

/**
 * Create a delete proposal.
 */
export function createDeleteProposal(
  targetPath: string,
  reason: string,
  options?: {
    sensitivity?: MemorySensitivity;
    risk?: ProposalRisk;
    confidence?: number;
    conversationId?: string;
  },
): ReflectionProposal {
  return createProposal({
    summary: `Delete ${targetPath}`,
    reason,
    operations: [
      {
        kind: "delete",
        targetPath,
      },
    ],
    sensitivity: options?.sensitivity ?? "public",
    risk: options?.risk ?? "medium",
    confidence: options?.confidence ?? 0.6,
    conversationId: options?.conversationId,
  });
}

// ============================================================================
// Proposal Queue
// ============================================================================

/**
 * In-memory proposal queue.
 */
const proposalQueue: Map<string, ReflectionProposal> = new Map();

/**
 * Add a proposal to the queue.
 */
export function queueProposal(
  proposal: ReflectionProposal,
): ReflectionProposal {
  proposalQueue.set(proposal.id, proposal);
  return proposal;
}

/**
 * Get all pending proposals.
 */
export function getPendingProposals(): ReflectionProposal[] {
  return [...proposalQueue.values()].filter((p) => p.status === "pending");
}

/**
 * Get a specific proposal by ID.
 */
export function getProposal(id: string): ReflectionProposal | undefined {
  return proposalQueue.get(id);
}

/**
 * Approve a proposal.
 */
export function approveProposal(
  id: string,
  reviewedBy?: string,
  notes?: string,
): ReflectionProposal | undefined {
  const proposal = proposalQueue.get(id);
  if (!proposal) return undefined;
  proposal.status = "approved";
  proposal.reviewedBy = reviewedBy;
  proposal.reviewedAt = new Date().toISOString();
  proposal.reviewNotes = notes;
  return proposal;
}

/**
 * Reject a proposal.
 */
export function rejectProposal(
  id: string,
  reviewedBy: string,
  reason: string,
): ReflectionProposal | undefined {
  const proposal = proposalQueue.get(id);
  if (!proposal) return undefined;
  proposal.status = "rejected";
  proposal.reviewedBy = reviewedBy;
  proposal.reviewedAt = new Date().toISOString();
  proposal.reviewNotes = reason;
  return proposal;
}

/**
 * Mark a proposal as applied.
 */
export function markApplied(id: string): ReflectionProposal | undefined {
  const proposal = proposalQueue.get(id);
  if (!proposal) return undefined;
  proposal.status = "applied";
  proposal.appliedAt = new Date().toISOString();
  return proposal;
}

/**
 * Mark a proposal as failed.
 */
export function markFailed(
  id: string,
  error: string,
): ReflectionProposal | undefined {
  const proposal = proposalQueue.get(id);
  if (!proposal) return undefined;
  proposal.status = "failed";
  proposal.error = error;
  return proposal;
}

/**
 * Get queue statistics.
 */
export function getProposalStats(): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  applied: number;
  failed: number;
} {
  const proposals = [...proposalQueue.values()];
  return {
    total: proposals.length,
    pending: proposals.filter((p) => p.status === "pending").length,
    approved: proposals.filter((p) => p.status === "approved").length,
    rejected: proposals.filter((p) => p.status === "rejected").length,
    applied: proposals.filter((p) => p.status === "applied").length,
    failed: proposals.filter((p) => p.status === "failed").length,
  };
}
