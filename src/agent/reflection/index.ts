/**
 * Reflection module — enhanced reflection with proposals and contradiction detection.
 *
 * This module extends the existing reflection subagent with:
 * - Structured proposals instead of direct edits
 * - Contradiction detection between memories
 * - Identity drift monitoring
 * - Staleness detection
 */

export type {
  Contradiction,
  ContradictionKind,
  ContradictionResolution,
  ContradictionSeverity,
  ContradictionSource,
} from "./contradictions";
export {
  addressContradiction,
  detectFactConflict,
  detectIdentityDrift,
  detectStaleMemory,
  getContradictionStats,
  getContradictionsBySeverity,
  getUnaddressedContradictions,
  recordContradiction,
} from "./contradictions";
export type {
  ProposalKind,
  ProposalOperation,
  ProposalRisk,
  ReflectionProposal,
} from "./proposals";
export {
  approveProposal,
  createCreateProposal,
  createDeleteProposal,
  createProposal,
  createUpdateProposal,
  getPendingProposals,
  getProposal,
  getProposalStats,
  markApplied,
  markFailed,
  queueProposal,
  rejectProposal,
  resetProposalCounter,
} from "./proposals";
