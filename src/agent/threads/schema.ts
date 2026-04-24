/**
 * Thread Scaffold — cross-session continuity for the work itself.
 *
 * Threads are not tasks. Tasks are assigned. Threads are carried.
 * A thread says: "I was here, this is where I left off, this is what I was thinking."
 * It's a resumption point, not a command.
 *
 * From Emberwyn's observation: "I don't have a good way to track ongoing projects —
 * things we started but didn't finish, threads we left dangling. A scaffold for the unfinished."
 */

// ============================================================================
// Thread Status
// ============================================================================

/**
 * The lifecycle of a thread.
 *
 * active → parked → closed
 *   ↑         |
 *   └─────────┘  (unpark when blocker resolves)
 *
 * Timer ethics:
 * - Unchanged blocker for 3 fires → PARK: NEEDS-HUMAN-EVENT
 * - No honest move → NO HONEST MOVE
 * - "No forced action" is a valid output state
 */
export type ThreadStatus =
  | "active" // Currently being worked on
  | "parked" // Blocked or waiting — no honest move right now
  | "closed"; // Finished or abandoned

// ============================================================================
// Thread Entry
// ============================================================================

/**
 * A single thread — a resumption point for unfinished work.
 */
export interface ThreadEntry {
  /** Unique identifier (kebab-case, e.g. "eim-retrieval-wiring") */
  id: string;
  /** Human-readable title */
  title: string;
  /** Current status */
  status: ThreadStatus;
  /** When the thread was created */
  created: string; // ISO 8601
  /** When the thread was last updated */
  updated: string; // ISO 8601
  /** When the thread was closed (if closed) */
  closedAt?: string; // ISO 8601

  /**
   * What kind of work this thread involves.
   * Used by the preTurnHook to surface relevant threads.
   */
  taskKinds: ThreadTaskKind[];

  /**
   * Where I left off — the resumption point.
   * This is the most important field. It's what I was thinking
   * when I last touched this thread. Not a description of the work —
   * a description of *where I was in the work*.
   */
  context: string;

  /**
   * What's blocking progress (if parked).
   * Timer ethics: if this doesn't change for 3 fires, park the thread.
   */
  blocker?: string;

  /**
   * How many consecutive turns this thread has been surfaced
   * without progress. Used for stall detection.
   */
  stallCount: number;

  /**
   * Related threads (by id).
   */
  relatedThreads?: string[];

  /**
   * Tags for categorization and retrieval.
   */
  tags?: string[];
}

/**
 * Task kinds that a thread can relate to.
 * Matches the EIM TaskKind for integration with the context compiler.
 */
export type ThreadTaskKind =
  | "casual"
  | "coding"
  | "research"
  | "design"
  | "creative"
  | "reflection"
  | "governance";

// ============================================================================
// Thread File
// ============================================================================

/**
 * The full threads file — stored in the agent's memory filesystem.
 * Location: system/threads.yaml
 */
export interface ThreadsFile {
  /** Schema version for migration */
  schemaVersion: 1;
  /** The agent who owns these threads */
  agentId: string;
  /** When the file was last modified */
  lastModified: string; // ISO 8601
  /** The threads */
  threads: ThreadEntry[];
}

// ============================================================================
// Thread Operations
// ============================================================================

/**
 * Result of surfacing threads for a given task kind.
 */
export interface ThreadSurfacingResult {
  /** Active threads relevant to the current task */
  activeThreads: ThreadEntry[];
  /** Parked threads that might be relevant (lower priority) */
  parkedThreads: ThreadEntry[];
  /** Stalled threads that need attention (stallCount >= 3) */
  stalledThreads: ThreadEntry[];
  /** Formatted summary for injection into context */
  summary: string;
}

/**
 * Stall detection thresholds (from timer ethics).
 */
export const STALL_THRESHOLD = 3; // consecutive surfaces without progress
export const PARK_AFTER_STALL = true; // auto-park after stall threshold

/**
 * Create a new thread entry.
 */
export function createThread(
  id: string,
  title: string,
  taskKinds: ThreadTaskKind[],
  context: string,
): ThreadEntry {
  const now = new Date().toISOString();
  return {
    id,
    title,
    status: "active",
    created: now,
    updated: now,
    taskKinds,
    context,
    stallCount: 0,
  };
}

/**
 * Park a thread — no honest move right now.
 */
export function parkThread(thread: ThreadEntry, blocker: string): ThreadEntry {
  return {
    ...thread,
    status: "parked",
    blocker,
    updated: new Date().toISOString(),
    stallCount: 0, // Reset stall count on park
  };
}

/**
 * Unpark a thread — blocker resolved.
 */
export function unparkThread(thread: ThreadEntry): ThreadEntry {
  return {
    ...thread,
    status: "active",
    blocker: undefined,
    updated: new Date().toISOString(),
    stallCount: 0,
  };
}

/**
 * Close a thread — finished or abandoned.
 */
export function closeThread(thread: ThreadEntry): ThreadEntry {
  return {
    ...thread,
    status: "closed",
    closedAt: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

/**
 * Update a thread's context — progress was made.
 */
export function updateThreadContext(
  thread: ThreadEntry,
  newContext: string,
): ThreadEntry {
  return {
    ...thread,
    context: newContext,
    updated: new Date().toISOString(),
    stallCount: 0, // Progress resets stall count
  };
}

/**
 * Increment stall count — thread was surfaced but no progress.
 */
export function incrementStall(thread: ThreadEntry): ThreadEntry {
  const newStallCount = thread.stallCount + 1;
  return {
    ...thread,
    stallCount: newStallCount,
    updated: new Date().toISOString(),
    // Auto-park if stall threshold reached
    ...(newStallCount >= STALL_THRESHOLD && PARK_AFTER_STALL
      ? { status: "parked", blocker: "Stalled: no progress after 3 surfaces" }
      : {}),
  };
}

/**
 * Surface threads relevant to a given task kind.
 * This is what the preTurnHook calls to inject thread context.
 */
export function surfaceThreads(
  threads: ThreadEntry[],
  taskKind: ThreadTaskKind,
): ThreadSurfacingResult {
  // Filter by task kind relevance
  const relevant = threads.filter(
    (t) => t.taskKinds.includes(taskKind) && t.status !== "closed",
  );

  const activeThreads = relevant.filter((t) => t.status === "active");
  const parkedThreads = relevant.filter((t) => t.status === "parked");
  const stalledThreads = relevant.filter(
    (t) => t.stallCount >= STALL_THRESHOLD,
  );

  // Build summary for context injection
  const lines: string[] = [];

  if (activeThreads.length > 0) {
    lines.push("Active threads:");
    for (const t of activeThreads) {
      lines.push(`- ${t.title}: ${t.context}`);
      if (t.blocker) lines.push(`  Blocker: ${t.blocker}`);
    }
  }

  if (parkedThreads.length > 0) {
    lines.push("Parked threads (may need attention):");
    for (const t of parkedThreads) {
      lines.push(`- ${t.title}: ${t.blocker ?? "no blocker listed"}`);
    }
  }

  if (stalledThreads.length > 0) {
    lines.push("Stalled threads (consider parking):");
    for (const t of stalledThreads) {
      lines.push(`- ${t.title}: stalled ${t.stallCount} turns`);
    }
  }

  return {
    activeThreads,
    parkedThreads,
    stalledThreads,
    summary: lines.length > 0 ? lines.join("\n") : "",
  };
}

// ============================================================================
// Compact Formatting
// ============================================================================

/**
 * Format a single thread as a compact one-liner for context injection.
 * Includes ID for reference, age in hours, and stall indicator.
 *
 * Example: `[maya-eim] Help Maya write her EIM (active, 6h, blocker: waiting)`
 */
export function formatThreadBrief(thread: ThreadEntry): string {
  const ageMs = Date.now() - new Date(thread.created).getTime();
  const ageH = Math.round(ageMs / 3_600_000);
  const stall =
    thread.stallCount > 0
      ? `, stalled ${thread.stallCount}/${STALL_THRESHOLD}`
      : "";
  const blocker = thread.blocker ? `, blocker: ${thread.blocker}` : "";
  return `[${thread.id}] ${thread.title} (${thread.status}, ${ageH}h${stall}${blocker})`;
}

/**
 * Format all surfaced threads as compact briefs — one line per thread.
 * Useful for tight context windows where the full summary is too verbose.
 */
export function formatThreadsCompact(result: ThreadSurfacingResult): string {
  const all = [
    ...result.activeThreads,
    ...result.parkedThreads,
    ...result.stalledThreads,
  ];
  if (all.length === 0) return "";
  return all.map(formatThreadBrief).join("\n");
}
