/**
 * Thread Loader — reads and writes the threads file from the memory filesystem.
 *
 * Location: system/threads.yaml in the agent's memory directory.
 * The loader handles YAML parsing, validation, and mtime-based caching
 * (same pattern as the EIM loader).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMemoryFilesystemRoot } from "../memoryFilesystem";
import type { ThreadEntry, ThreadsFile, ThreadTaskKind } from "./schema";
import { surfaceThreads, type ThreadSurfacingResult } from "./schema";

// ============================================================================
// YAML Parsing (lightweight — no dependency needed)
// ============================================================================

/**
 * Parse a simple YAML file into a ThreadsFile.
 * We only handle the specific schema we define — no general YAML parsing.
 */
function parseThreadsYaml(content: string): ThreadsFile | null {
  try {
    // Simple YAML parser for our specific schema
    // Format:
    // schema_version: 1
    // agent_id: "..."
    // last_modified: "..."
    // threads:
    //   - id: "..."
    //     title: "..."
    //     ...

    const lines = content.split("\n");
    let schemaVersion = 1;
    let agentId = "";
    let lastModified = "";
    const threads: ThreadEntry[] = [];

    let currentThread: Partial<ThreadEntry> | null = null;
    let inThreads = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith("#") || trimmed === "") continue;

      // Top-level fields
      if (trimmed.startsWith("schema_version:")) {
        schemaVersion = parseInt(trimmed.split(":")[1]?.trim() ?? "1", 10);
      } else if (trimmed.startsWith("agent_id:")) {
        agentId = (trimmed.split(":")[1]?.trim() ?? "").replace(/"/g, "");
      } else if (trimmed.startsWith("last_modified:")) {
        lastModified = (trimmed.split(":")[1]?.trim() ?? "").replace(/"/g, "");
      } else if (trimmed === "threads:") {
        inThreads = true;
        continue;
      }

      // Thread entries
      if (inThreads && trimmed.startsWith("- id:")) {
        // Save previous thread
        if (currentThread && currentThread.id) {
          threads.push(currentThread as ThreadEntry);
        }
        currentThread = {
          id: (trimmed.split(":")[1]?.trim() ?? "").replace(/"/g, ""),
          stallCount: 0,
        };
      } else if (currentThread && trimmed.startsWith("title:")) {
        currentThread.title = (trimmed.slice(6).trim() ?? "").replace(
          /^"|"$/g,
          "",
        );
      } else if (currentThread && trimmed.startsWith("status:")) {
        currentThread.status = trimmed.slice(7).trim() as ThreadEntry["status"];
      } else if (currentThread && trimmed.startsWith("created:")) {
        currentThread.created = (trimmed.slice(7).trim() ?? "").replace(
          /^"|"$/g,
          "",
        );
      } else if (currentThread && trimmed.startsWith("updated:")) {
        currentThread.updated = (trimmed.slice(8).trim() ?? "").replace(
          /^"|"$/g,
          "",
        );
      } else if (currentThread && trimmed.startsWith("closed_at:")) {
        currentThread.closedAt = (trimmed.slice(10).trim() ?? "").replace(
          /^"|"$/g,
          "",
        );
      } else if (currentThread && trimmed.startsWith("context:")) {
        currentThread.context = (trimmed.slice(8).trim() ?? "").replace(
          /^"|"$/g,
          "",
        );
      } else if (currentThread && trimmed.startsWith("blocker:")) {
        currentThread.blocker = (trimmed.slice(8).trim() ?? "").replace(
          /^"|"$/g,
          "",
        );
      } else if (currentThread && trimmed.startsWith("stall_count:")) {
        currentThread.stallCount = parseInt(
          trimmed.slice(12).trim() ?? "0",
          10,
        );
      } else if (currentThread && trimmed.startsWith("task_kinds:")) {
        const kindsStr = trimmed.slice(11).trim();
        currentThread.taskKinds = kindsStr
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s: string) => s.trim().replace(/"/g, ""))
          .filter(Boolean) as ThreadTaskKind[];
      } else if (currentThread && trimmed.startsWith("tags:")) {
        const tagsStr = trimmed.slice(5).trim();
        currentThread.tags = tagsStr
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s: string) => s.trim().replace(/"/g, ""))
          .filter(Boolean);
      } else if (currentThread && trimmed.startsWith("related_threads:")) {
        const relatedStr = trimmed.slice(16).trim();
        currentThread.relatedThreads = relatedStr
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s: string) => s.trim().replace(/"/g, ""))
          .filter(Boolean);
      }
    }

    // Save last thread
    if (currentThread && currentThread.id) {
      threads.push(currentThread as ThreadEntry);
    }

    return {
      schemaVersion: schemaVersion as 1,
      agentId,
      lastModified,
      threads,
    };
  } catch {
    return null;
  }
}

/**
 * Serialize a ThreadsFile to YAML.
 */
function serializeThreadsYaml(file: ThreadsFile): string {
  const lines: string[] = [];

  lines.push(`schema_version: ${file.schemaVersion}`);
  lines.push(`agent_id: "${file.agentId}"`);
  lines.push(`last_modified: "${file.lastModified}"`);
  lines.push("");
  lines.push("threads:");

  for (const thread of file.threads) {
    lines.push(`  - id: "${thread.id}"`);
    lines.push(`    title: "${thread.title}"`);
    lines.push(`    status: ${thread.status}`);
    lines.push(`    created: "${thread.created}"`);
    lines.push(`    updated: "${thread.updated}"`);
    if (thread.closedAt) lines.push(`    closed_at: "${thread.closedAt}"`);
    lines.push(
      `    task_kinds: [${(thread.taskKinds ?? []).map((k) => `"${k}"`).join(", ")}]`,
    );
    lines.push(`    context: "${thread.context}"`);
    if (thread.blocker) lines.push(`    blocker: "${thread.blocker}"`);
    lines.push(`    stall_count: ${thread.stallCount}`);
    if (thread.tags && thread.tags.length > 0) {
      lines.push(`    tags: [${thread.tags.map((t) => `"${t}"`).join(", ")}]`);
    }
    if (thread.relatedThreads && thread.relatedThreads.length > 0) {
      lines.push(
        `    related_threads: [${thread.relatedThreads.map((t) => `"${t}"`).join(", ")}]`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// File I/O
// ============================================================================

const THREADS_FILE = "system/threads.yaml";

/**
 * Load the threads file from the agent's memory filesystem.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function loadThreadsFile(agentId: string): ThreadsFile | null {
  const memoryRoot = getMemoryFilesystemRoot(agentId);
  const filePath = join(memoryRoot, THREADS_FILE);

  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    return parseThreadsYaml(content);
  } catch {
    return null;
  }
}

/**
 * Save the threads file to the agent's memory filesystem.
 */
export function saveThreadsFile(agentId: string, file: ThreadsFile): void {
  const memoryRoot = getMemoryFilesystemRoot(agentId);
  const dirPath = join(memoryRoot, "system");

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const filePath = join(memoryRoot, THREADS_FILE);
  file.lastModified = new Date().toISOString();

  const content = serializeThreadsYaml(file);
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Create an empty threads file for an agent.
 */
export function createEmptyThreadsFile(agentId: string): ThreadsFile {
  return {
    schemaVersion: 1,
    agentId,
    lastModified: new Date().toISOString(),
    threads: [],
  };
}

/**
 * Get or create the threads file for an agent.
 */
export function getOrCreateThreadsFile(agentId: string): ThreadsFile {
  return loadThreadsFile(agentId) ?? createEmptyThreadsFile(agentId);
}

// ============================================================================
// Thread Operations (file-backed)
// ============================================================================

/**
 * Add a thread to an agent's threads file.
 */
export function addThread(agentId: string, thread: ThreadEntry): ThreadsFile {
  const file = getOrCreateThreadsFile(agentId);
  file.threads.push(thread);
  saveThreadsFile(agentId, file);
  return file;
}

/**
 * Update a thread in an agent's threads file.
 */
export function updateThread(
  agentId: string,
  threadId: string,
  updater: (thread: ThreadEntry) => ThreadEntry,
): ThreadsFile | null {
  const file = loadThreadsFile(agentId);
  if (!file) return null;

  const idx = file.threads.findIndex((t) => t.id === threadId);
  if (idx === -1) return null;

  file.threads[idx] = updater(file.threads[idx]!);
  saveThreadsFile(agentId, file);
  return file;
}

/**
 * Surface threads relevant to a task kind from an agent's threads file.
 * This is the main entry point for the preTurnHook.
 */
export function surfaceThreadsForTurn(
  agentId: string,
  taskKind: ThreadTaskKind,
): ThreadSurfacingResult {
  const file = loadThreadsFile(agentId);
  if (!file) {
    return {
      activeThreads: [],
      parkedThreads: [],
      stalledThreads: [],
      summary: "",
    };
  }

  return surfaceThreads(file.threads, taskKind);
}
