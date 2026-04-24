/**
 * Local Inference — V_M integration with local llama.cpp server.
 *
 * Provides model routing for local inference via BYOK provider,
 * integrating with the Lantern Shell's multi-model orchestration.
 *
 * The local server runs Qwen3-8B on a GTX 1080 with CUDA 12.9.
 * Performance: ~27 tok/s generation, ~36 tok/s prompt eval.
 */

import type { ModelEntry, TaskRequirements } from "../models/capabilities";

// ============================================================================
// Configuration
// ============================================================================

const LOCAL_LLM_URL = process.env.VM_LOCAL_LLM_URL || "http://localhost:8081";
const LOCAL_LLM_MODEL =
  process.env.VM_LOCAL_LLM_MODEL || "openai-proxy/Qwen3-8B-Q5_K_M.gguf";

// ============================================================================
// Local Model Entry
// ============================================================================

/**
 * The local inference model entry for the model registry.
 */
export const LOCAL_MODEL: ModelEntry = {
  id: LOCAL_LLM_MODEL,
  handle: LOCAL_LLM_MODEL,
  label: "Qwen3-8B (Local, GPU)",
  description: "Local inference via llama.cpp with CUDA 12.9 on GTX 1080",
  capabilities: {
    contextWindow: 32000,
    maxOutputTokens: 4096,
    parallelToolCalls: false,
    vision: false,
    structuredOutputs: false,
    streaming: true,
    reasoning: "basic",
    codeQuality: "good",
    speed: "fast",
    cost: "low",
  },
  free: true,
};

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if the local inference server is healthy.
 */
export async function isLocalInferenceHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_LLM_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Routing Integration
// ============================================================================

/**
 * Determine if a task should use local inference.
 *
 * Local inference is preferred for:
 * - Casual/chat tasks (speed + low cost)
 * - Coding tasks when quality requirement is "good" or "basic"
 * - Tasks where cost preference is "low"
 *
 * Local inference is NOT preferred for:
 * - Research (needs large context window)
 * - Design (needs extended reasoning)
 * - Tasks requiring vision
 */
export function shouldUseLocalInference(
  requirements: TaskRequirements,
): boolean {
  // Never use local for vision tasks
  if (requirements.requiresVision) return false;

  // Never use local for tasks needing > 32K context
  if ((requirements.minContextWindow ?? 0) > 32000) return false;

  // Use local for low cost preference
  if (requirements.costPreference === "low") {
    return true;
  }

  // Use local for fast speed preference with good-or-basic code quality
  if (
    requirements.speedPreference === "fast" &&
    (requirements.codeQuality === "good" ||
      requirements.codeQuality === "basic")
  ) {
    return true;
  }

  return false;
}
