/**
 * EIM Config Loader — loads EIM configuration from the memory filesystem.
 *
 * Reads `system/eim.md` from the agent's memory filesystem, deserializes it
 * via `deserializeEIMConfig`, and falls back to `DEFAULT_EIM_CONFIG` if the
 * file doesn't exist or is invalid.
 *
 * Includes a simple in-memory cache keyed by agent ID that invalidates
 * when the memory filesystem syncs.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getMemorySystemDir } from "../memoryFilesystem";
import { deserializeEIMConfig } from "./serializer";
import type { EIMConfig } from "./types";
import { DEFAULT_EIM_CONFIG } from "./types";

// ============================================================================
// Cache
// ============================================================================

const EIM_CONFIG_FILENAME = "eim.md";

/**
 * In-memory cache for EIM configs keyed by agent ID.
 * Invalidated when the memory filesystem syncs (pull/commit).
 */
const configCache = new Map<string, { config: EIMConfig; mtimeMs: number }>();

/**
 * Invalidate the cached EIM config for a given agent.
 * Call after memory filesystem sync operations (pull, commit).
 */
export function invalidateEIMConfigCache(agentId: string): void {
  configCache.delete(agentId);
}

/**
 * Invalidate all cached EIM configs.
 */
export function invalidateAllEIMConfigCaches(): void {
  configCache.clear();
}

// ============================================================================
// Loading
// ============================================================================

/**
 * Load the EIM config for an agent from its memory filesystem.
 *
 * Resolution order:
 * 1. Check in-memory cache (with mtime validation)
 * 2. Read `system/eim.md` from the memory filesystem
 * 3. Deserialize via `deserializeEIMConfig`
 * 4. Fall back to `DEFAULT_EIM_CONFIG` if the file doesn't exist or is invalid
 *
 * @param agentId - The agent ID whose EIM config to load
 * @returns The EIM configuration (loaded or default)
 */
export function loadEIMConfig(agentId: string): EIMConfig {
  const systemDir = getMemorySystemDir(agentId);
  const eimPath = join(systemDir, EIM_CONFIG_FILENAME);

  if (!existsSync(eimPath)) {
    return DEFAULT_EIM_CONFIG;
  }

  try {
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(eimPath).mtimeMs;
    } catch {
      // stat failed — skip cache check, just read
    }

    // Check cache
    const cached = configCache.get(agentId);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.config;
    }

    // Read and deserialize
    const content = readFileSync(eimPath, "utf-8");
    const config = deserializeEIMConfig(content);

    // Update cache
    if (mtimeMs > 0) {
      configCache.set(agentId, { config, mtimeMs });
    }

    return config;
  } catch {
    // Deserialization failed — fall back to default
    return DEFAULT_EIM_CONFIG;
  }
}
