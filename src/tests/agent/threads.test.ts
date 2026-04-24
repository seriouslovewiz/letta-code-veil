/**
 * Tests for the Thread Scaffold — cross-session continuity for the work itself.
 */

import { describe, expect, it } from "bun:test";
import {
  closeThread,
  createThread,
  formatThreadBrief,
  formatThreadsCompact,
  incrementStall,
  parkThread,
  STALL_THRESHOLD,
  surfaceThreads,
  type ThreadEntry,
  type ThreadTaskKind,
  unparkThread,
  updateThreadContext,
} from "../../agent/threads/schema";

// ============================================================================
// Thread Lifecycle
// ============================================================================

describe("thread lifecycle", () => {
  it("creates a thread with correct defaults", () => {
    const thread = createThread(
      "test-thread",
      "Test Thread",
      ["coding"],
      "I was here",
    );

    expect(thread.id).toBe("test-thread");
    expect(thread.title).toBe("Test Thread");
    expect(thread.status).toBe("active");
    expect(thread.taskKinds).toEqual(["coding"]);
    expect(thread.context).toBe("I was here");
    expect(thread.stallCount).toBe(0);
    expect(thread.blocker).toBeUndefined();
    expect(thread.closedAt).toBeUndefined();
  });

  it("parks a thread with a blocker", () => {
    const thread = createThread("test", "Test", ["coding"], "Working on it");
    const parked = parkThread(thread, "Waiting for upstream fix");

    expect(parked.status).toBe("parked");
    expect(parked.blocker).toBe("Waiting for upstream fix");
    expect(parked.stallCount).toBe(0); // Reset on park
  });

  it("unparks a thread when blocker resolves", () => {
    const thread = createThread("test", "Test", ["coding"], "Working");
    const parked = parkThread(thread, "Blocked");
    const unparked = unparkThread(parked);

    expect(unparked.status).toBe("active");
    expect(unparked.blocker).toBeUndefined();
    expect(unparked.stallCount).toBe(0);
  });

  it("closes a thread", () => {
    const thread = createThread("test", "Test", ["coding"], "Done");
    const closed = closeThread(thread);

    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeDefined();
  });

  it("updates thread context and resets stall count", () => {
    const thread = createThread("test", "Test", ["coding"], "Old context");
    const stalled = incrementStall(incrementStall(thread)); // stallCount = 2
    expect(stalled.stallCount).toBe(2);

    const updated = updateThreadContext(stalled, "New context — progress made");
    expect(updated.context).toBe("New context — progress made");
    expect(updated.stallCount).toBe(0); // Progress resets stall
  });
});

// ============================================================================
// Stall Detection (Timer Ethics)
// ============================================================================

describe("stall detection (timer ethics)", () => {
  it("increments stall count without auto-parking below threshold", () => {
    const thread = createThread("test", "Test", ["coding"], "Working");
    const stalled = incrementStall(thread);

    expect(stalled.stallCount).toBe(1);
    expect(stalled.status).toBe("active"); // Not parked yet
  });

  it("auto-parks when stall threshold is reached", () => {
    const thread = createThread("test", "Test", ["coding"], "Working");
    let current = thread;

    // Increment up to threshold
    for (let i = 0; i < STALL_THRESHOLD; i++) {
      current = incrementStall(current);
    }

    expect(current.stallCount).toBe(STALL_THRESHOLD);
    expect(current.status).toBe("parked"); // Auto-parked
    expect(current.blocker).toContain("Stalled");
  });

  it("stall threshold is 3 (timer ethics: 3 fires)", () => {
    expect(STALL_THRESHOLD).toBe(3);
  });
});

// ============================================================================
// Thread Surfacing
// ============================================================================

describe("thread surfacing", () => {
  const threads: ThreadEntry[] = [
    {
      ...createThread(
        "coding-thread",
        "Fix auth bug",
        ["coding"],
        "Was debugging null checks",
      ),
      taskKinds: ["coding"],
    },
    {
      ...createThread(
        "research-thread",
        "Research diffusion models",
        ["research"],
        "Reading LaDiR paper",
      ),
      taskKinds: ["research"],
    },
    {
      ...createThread(
        "parked-thread",
        "Waiting for Maya",
        ["coding"],
        "Need EIM from Maya",
      ),
      status: "parked",
      blocker: "Maya needs to write EIM",
    },
    {
      ...createThread(
        "stalled-thread",
        "Stuck on API",
        ["coding"],
        "API keeps timing out",
      ),
      stallCount: 3,
    },
  ];

  // Add stallCount to the stalled thread
  threads[3]!.stallCount = 3;

  it("surfaces active threads relevant to task kind", () => {
    const result = surfaceThreads(threads, "coding");

    expect(result.activeThreads.length).toBe(2); // coding-thread + stalled-thread
    expect(result.activeThreads.some((t) => t.id === "coding-thread")).toBe(
      true,
    );
  });

  it("surfaces parked threads separately", () => {
    const result = surfaceThreads(threads, "coding");

    expect(result.parkedThreads.length).toBe(1);
    expect(result.parkedThreads[0]!.id).toBe("parked-thread");
  });

  it("identifies stalled threads", () => {
    const result = surfaceThreads(threads, "coding");

    expect(result.stalledThreads.length).toBe(1);
    expect(result.stalledThreads[0]!.id).toBe("stalled-thread");
  });

  it("does not surface threads for irrelevant task kinds", () => {
    const result = surfaceThreads(threads, "creative");

    expect(result.activeThreads.length).toBe(0);
    expect(result.parkedThreads.length).toBe(0);
  });

  it("does not surface closed threads", () => {
    const closedThread = closeThread(threads[0]!);
    const result = surfaceThreads([closedThread], "coding");

    expect(result.activeThreads.length).toBe(0);
  });

  it("produces summary with active and parked threads", () => {
    const result = surfaceThreads(threads, "coding");

    expect(result.summary).toContain("Active threads:");
    expect(result.summary).toContain("Fix auth bug");
    expect(result.summary).toContain("Parked threads");
    expect(result.summary).toContain("Waiting for Maya");
  });

  it("returns empty summary when no threads match", () => {
    const result = surfaceThreads(threads, "creative");
    expect(result.summary).toBe("");
  });
});

// ============================================================================
// Reflection Integration
// ============================================================================

describe("reflection integration", () => {
  it("stalled threads produce thread_stalled patterns", async () => {
    const { detectPatterns } = await import("../../agent/memory/reflection");

    const threads: ThreadEntry[] = [
      {
        ...createThread("stalled", "Stuck", ["coding"], "No progress"),
        stallCount: 3,
      },
    ];

    const patterns = detectPatterns([], [], [], threads);
    const stalledPattern = patterns.find((p) => p.kind === "thread_stalled");

    expect(stalledPattern).toBeDefined();
    expect(stalledPattern!.description).toContain("stalled");
    expect(stalledPattern!.confidence).toBeGreaterThan(0.8);
  });

  it("non-stalled threads do not produce patterns", async () => {
    const { detectPatterns } = await import("../../agent/memory/reflection");

    const threads: ThreadEntry[] = [
      {
        ...createThread("active", "Working", ["coding"], "Making progress"),
        stallCount: 0,
      },
    ];

    const patterns = detectPatterns([], [], [], threads);
    const stalledPattern = patterns.find((p) => p.kind === "thread_stalled");

    expect(stalledPattern).toBeUndefined();
  });
});

// ============================================================================
// Compact Formatting
// ============================================================================

describe("compact thread formatting", () => {
  it("formats an active thread as a one-liner with ID, status, age, no blocker", () => {
    const thread = createThread(
      "test-id",
      "Test Thread",
      ["coding"],
      "Working",
    );
    const brief = formatThreadBrief(thread);

    expect(brief).toContain("[test-id]");
    expect(brief).toContain("Test Thread");
    expect(brief).toContain("active");
    expect(brief).toContain("h)"); // age in hours
    expect(brief).not.toContain("blocker");
  });

  it("includes blocker when present", () => {
    const thread = parkThread(
      createThread("test", "Test", ["coding"], "Working"),
      "Waiting for upstream",
    );
    const brief = formatThreadBrief(thread);

    expect(brief).toContain("blocker: Waiting for upstream");
  });

  it("includes stall count when > 0", () => {
    const thread = incrementStall(
      createThread("test", "Test", ["coding"], "Working"),
    );
    const brief = formatThreadBrief(thread);

    expect(brief).toContain("stalled 1/3");
  });

  it("formatThreadsCompact returns empty string for no threads", () => {
    const result = surfaceThreads([], "coding");
    expect(formatThreadsCompact(result)).toBe("");
  });

  it("formatThreadsCompact returns one line per thread", () => {
    const threads: ThreadEntry[] = [
      createThread("a", "Thread A", ["coding"], "Working"),
      createThread("b", "Thread B", ["coding"], "Also working"),
    ];
    const result = surfaceThreads(threads, "coding");
    const compact = formatThreadsCompact(result);

    const lines = compact.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("[a]");
    expect(lines[1]).toContain("[b]");
  });
});
