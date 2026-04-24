import { beforeEach, describe, expect, it } from "bun:test";
import {
  addressContradiction,
  detectFactConflict,
  detectIdentityDrift,
  detectStaleMemory,
  getContradictionStats,
  getContradictionsBySeverity,
  getUnaddressedContradictions,
  recordContradiction,
} from "../../agent/reflection/contradictions";
import {
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
} from "../../agent/reflection/proposals";

describe("Reflection proposals", () => {
  beforeEach(() => {
    resetProposalCounter();
  });

  it("creates a proposal with required fields", () => {
    const proposal = createProposal({
      summary: "Test proposal",
      reason: "Testing the proposal system",
      operations: [
        { kind: "create", targetPath: "test.md", newContent: "test" },
      ],
      sensitivity: "public",
      risk: "low",
      confidence: 0.9,
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.summary).toBe("Test proposal");
    expect(proposal.status).toBe("pending");
    expect(proposal.operations.length).toBe(1);
    expect(proposal.confidence).toBe(0.9);
  });

  it("clamps confidence to 0-1 range", () => {
    const high = createProposal({
      summary: "High",
      reason: "Test",
      operations: [],
      sensitivity: "public",
      risk: "low",
      confidence: 1.5,
    });
    expect(high.confidence).toBe(1);

    const low = createProposal({
      summary: "Low",
      reason: "Test",
      operations: [],
      sensitivity: "public",
      risk: "low",
      confidence: -0.5,
    });
    expect(low.confidence).toBe(0);
  });

  it("creates an update proposal", () => {
    const proposal = createUpdateProposal(
      "knowledge/test.md",
      "old content",
      "new content",
      "Updated with new information",
    );

    expect(proposal.operations[0]!.kind).toBe("update");
    expect(proposal.operations[0]!.oldContent).toBe("old content");
    expect(proposal.operations[0]!.newContent).toBe("new content");
  });

  it("creates a create proposal", () => {
    const proposal = createCreateProposal(
      "knowledge/new.md",
      "new memory content",
      "Adding new knowledge",
    );

    expect(proposal.operations[0]!.kind).toBe("create");
    expect(proposal.risk).toBe("medium"); // Default for creates
  });

  it("creates a delete proposal", () => {
    const proposal = createDeleteProposal(
      "knowledge/old.md",
      "No longer relevant",
    );

    expect(proposal.operations[0]!.kind).toBe("delete");
    expect(proposal.confidence).toBeLessThan(0.8); // Deletes are lower confidence
  });

  it("queues and retrieves proposals", () => {
    const proposal = createProposal({
      summary: "Queued",
      reason: "Test",
      operations: [],
      sensitivity: "public",
      risk: "low",
      confidence: 0.8,
    });

    queueProposal(proposal);
    const pending = getPendingProposals();
    expect(pending.length).toBeGreaterThanOrEqual(1);

    const retrieved = getProposal(proposal.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.summary).toBe("Queued");
  });

  it("approves a proposal", () => {
    const proposal = createProposal({
      summary: "Approve me",
      reason: "Test",
      operations: [],
      sensitivity: "public",
      risk: "low",
      confidence: 0.9,
    });

    queueProposal(proposal);
    const approved = approveProposal(proposal.id, "user", "Looks good");

    expect(approved!.status).toBe("approved");
    expect(approved!.reviewedBy).toBe("user");
    expect(approved!.reviewNotes).toBe("Looks good");
  });

  it("rejects a proposal", () => {
    const proposal = createProposal({
      summary: "Reject me",
      reason: "Test",
      operations: [],
      sensitivity: "public",
      risk: "low",
      confidence: 0.9,
    });

    queueProposal(proposal);
    const rejected = rejectProposal(proposal.id, "user", "Not needed");

    expect(rejected!.status).toBe("rejected");
    expect(rejected!.reviewNotes).toBe("Not needed");
  });

  it("marks proposal as applied", () => {
    const proposal = createProposal({
      summary: "Apply me",
      reason: "Test",
      operations: [],
      sensitivity: "public",
      risk: "low",
      confidence: 0.9,
    });

    queueProposal(proposal);
    const applied = markApplied(proposal.id);

    expect(applied!.status).toBe("applied");
    expect(applied!.appliedAt).toBeDefined();
  });

  it("marks proposal as failed", () => {
    const proposal = createProposal({
      summary: "Fail me",
      reason: "Test",
      operations: [],
      sensitivity: "public",
      risk: "low",
      confidence: 0.9,
    });

    queueProposal(proposal);
    const failed = markFailed(proposal.id, "Write failed");

    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBe("Write failed");
  });

  it("gets proposal statistics", () => {
    const stats = getProposalStats();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.applied).toBe("number");
  });
});

describe("Contradiction detection", () => {
  it("detects fact conflicts with negation", () => {
    const result = detectFactConflict(
      "The user prefers dark mode for their IDE.",
      "The user does not prefer dark mode.",
    );

    expect(result.hasConflict).toBe(true);
    expect(result.description).toContain("contradiction");
  });

  it("does not flag unrelated statements as conflicts", () => {
    const result = detectFactConflict(
      "The sky is blue.",
      "The grass is green.",
    );

    expect(result.hasConflict).toBe(false);
  });

  it("detects stale episodic memories", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

    const result = detectStaleMemory(
      "User mentioned they were starting a new job.",
      oldDate.toISOString(),
      "episodic",
    );

    expect(result.isStale).toBe(true);
    expect(result.reason).toContain("60");
  });

  it("does not flag recent memories as stale", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 5);

    const result = detectStaleMemory(
      "User mentioned they were starting a new job.",
      recent.toISOString(),
      "episodic",
    );

    expect(result.isStale).toBe(false);
  });

  it("semantic memories have longer staleness threshold", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 200); // 200 days ago

    const result = detectStaleMemory(
      "TypeScript is a typed superset of JavaScript.",
      oldDate.toISOString(),
      "semantic",
    );

    // Semantic threshold is 365 days, so 200 days is not stale
    expect(result.isStale).toBe(false);
  });

  it("detects identity drift", () => {
    const persona = "I should be brief and concise in my responses.";
    const behaviors = [
      "The agent gave a very verbose and long-winded explanation.",
    ];

    const result = detectIdentityDrift(persona, behaviors);
    expect(result.hasDrift).toBe(true);
  });

  it("does not flag matching behavior as drift", () => {
    const persona = "I should be warm and friendly.";
    const behaviors: string[] = [];

    const result = detectIdentityDrift(persona, behaviors);
    expect(result.hasDrift).toBe(false);
  });
});

describe("Contradiction queue", () => {
  it("records a contradiction", () => {
    const contradiction = recordContradiction(
      "fact_conflict",
      "moderate",
      [
        { type: "memory_file", path: "knowledge/a.md", content: "X is true" },
        { type: "memory_file", path: "knowledge/b.md", content: "X is false" },
      ],
      "Conflicting facts about X",
    );

    expect(contradiction.id).toBeDefined();
    expect(contradiction.kind).toBe("fact_conflict");
    expect(contradiction.severity).toBe("moderate");
    expect(contradiction.addressed).toBe(false);
  });

  it("gets unaddressed contradictions", () => {
    recordContradiction(
      "identity_drift",
      "minor",
      [{ type: "identity_definition", content: "drift detected" }],
      "Drift test",
    );

    const unaddressed = getUnaddressedContradictions();
    expect(unaddressed.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by severity", () => {
    recordContradiction(
      "stale_memory",
      "critical",
      [{ type: "memory_file", path: "test.md", content: "stale" }],
      "Critical stale memory",
    );

    const critical = getContradictionsBySeverity("critical");
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(critical[0]!.severity).toBe("critical");
  });

  it("addresses a contradiction", () => {
    const c = recordContradiction(
      "scope_violation",
      "minor",
      [{ type: "memory_file", path: "test.md", content: "violation" }],
      "Test",
    );

    const addressed = addressContradiction(c.id, "reflection");
    expect(addressed!.addressed).toBe(true);
    expect(addressed!.addressedBy).toBe("reflection");

    const unaddressed = getUnaddressedContradictions();
    expect(unaddressed.find((x) => x.id === c.id)).toBeUndefined();
  });

  it("gets contradiction statistics", () => {
    const stats = getContradictionStats();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.bySeverity.minor).toBeGreaterThanOrEqual(0);
    expect(stats.bySeverity.moderate).toBeGreaterThanOrEqual(0);
    expect(stats.bySeverity.critical).toBeGreaterThanOrEqual(0);
  });
});
