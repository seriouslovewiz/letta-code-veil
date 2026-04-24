import { describe, expect, it } from "bun:test";
import type { ClassificationResult } from "../../agent/memory/classifier";
import {
  approveQueueEntry,
  enqueueForReview,
  getPendingReviews,
  getQueueStats,
  type PipelineCandidate,
  processCandidate,
  processCandidates,
  rejectQueueEntry,
  scoreCandidate,
} from "../../agent/memory/pipeline";

describe("Memory pipeline scoring", () => {
  const baseCandidate: PipelineCandidate = {
    id: "test-1",
    content: "User prefers dark mode for their IDE",
    createdAt: new Date().toISOString(),
    source: "conversation",
  };

  const publicClassification: ClassificationResult = {
    type: "semantic",
    sensitivity: "public",
    importance: "high",
    confidence: 0.95,
    description: "User prefers dark mode",
  };

  const sensitiveClassification: ClassificationResult = {
    type: "relationship",
    sensitivity: "sensitive",
    importance: "high",
    confidence: 0.9,
    description: "User's private preference",
  };

  it("scores a novel public memory", () => {
    const result = scoreCandidate(baseCandidate, publicClassification);
    expect(result.score).toBeGreaterThan(0);
    expect(result.factors.novelty).toBe(1); // No existing memories
    expect(result.factors.classificationConfidence).toBe(0.95);
  });

  it("does not auto-approve sensitive memories", () => {
    const result = scoreCandidate(baseCandidate, sensitiveClassification);
    expect(result.autoApprove).toBe(false);
    // Reason should explain why (sensitivity, score, or confidence)
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("penalizes low classification confidence", () => {
    const lowConfidence: ClassificationResult = {
      ...publicClassification,
      confidence: 0.5,
    };
    const result = scoreCandidate(baseCandidate, lowConfidence);
    expect(result.autoApprove).toBe(false);
  });

  it("reduces novelty with similar existing memories", () => {
    const existing = ["User prefers light mode for their IDE"];
    const result = scoreCandidate(
      baseCandidate,
      publicClassification,
      existing,
    );
    expect(result.factors.novelty).toBeLessThan(1);
  });

  it("applies different utility scores by memory type", () => {
    const proceduralResult = scoreCandidate(baseCandidate, {
      ...publicClassification,
      type: "procedural",
    });
    expect(proceduralResult.factors.utility).toBe(0.85);

    const episodicResult = scoreCandidate(baseCandidate, {
      ...publicClassification,
      type: "episodic",
    });
    expect(episodicResult.factors.utility).toBe(0.5);
  });
});

describe("Memory pipeline processing", () => {
  it("processes a candidate through the full pipeline", () => {
    const result = processCandidate({
      content: "User prefers TypeScript over JavaScript",
    });

    expect(result.candidate.id).toBeDefined();
    expect(result.classification).toBeDefined();
    expect(result.scoring).toBeDefined();
    expect(result.decision).toMatch(/approved|rejected|queued|conflict/);
    expect(result.reason).toBeDefined();
  });

  it("classifies and scores memories", () => {
    const result = processCandidate({
      content: "The sky is blue during the day.",
    });

    expect(result.classification.type).toBeDefined();
    expect(result.scoring.score).toBeGreaterThan(0);
  });

  it("queues sensitive memories for review", () => {
    const result = processCandidate({
      content: "The user's API key is stored in the environment.",
    });

    expect(result.classification.sensitivity).toBe("sensitive");
    expect(result.decision).toBe("queued");
  });

  it("handles low-quality memories", () => {
    const result = processCandidate({
      content: "x",
    });

    expect(result.decision).toBeDefined();
  });

  it("processes multiple candidates in batch", () => {
    const results = processCandidates([
      { content: "User likes dark mode" },
      { content: "Project uses TypeScript" },
      { content: "I should ask before assuming" },
    ]);

    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.decision).toMatch(/approved|rejected|queued|conflict/);
    }
  });
});

describe("Review queue", () => {
  it("enqueues a result for review", () => {
    const result = processCandidate({
      content: "User's private data",
    });
    result.decision = "queued";
    result.queueEntryId = "test-queue-1";

    const entry = enqueueForReview(result);
    expect(entry.id).toBe("test-queue-1");
    expect(entry.status).toBe("pending");
  });

  it("gets pending reviews", () => {
    const result = processCandidate({
      content: "Sensitive user information",
    });
    result.decision = "queued";
    result.queueEntryId = "test-queue-2";

    enqueueForReview(result);
    const pending = getPendingReviews();
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });

  it("approves a queue entry", () => {
    const result = processCandidate({
      content: "Test memory",
    });
    result.decision = "queued";
    result.queueEntryId = "test-queue-3";

    enqueueForReview(result);
    const approved = approveQueueEntry("test-queue-3", "user", "Looks good");

    expect(approved?.status).toBe("approved");
    expect(approved?.reviewedBy).toBe("user");
    expect(approved?.reviewNotes).toBe("Looks good");
  });

  it("rejects a queue entry", () => {
    const result = processCandidate({
      content: "Bad memory",
    });
    result.decision = "queued";
    result.queueEntryId = "test-queue-4";

    enqueueForReview(result);
    const rejected = rejectQueueEntry("test-queue-4", "user", "Not relevant");

    expect(rejected?.status).toBe("rejected");
    expect(rejected?.reviewNotes).toBe("Not relevant");
  });

  it("gets queue statistics", () => {
    const stats = getQueueStats();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.approved).toBe("number");
    expect(typeof stats.rejected).toBe("number");
  });
});
