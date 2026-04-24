/**
 * Sangha Integration — wires V_M sangha modules into the Lantern Shell.
 *
 * This module connects:
 * - Memory pipeline → Mindmap bridge (high-confidence candidates auto-indexed)
 * - Turn events → A2A protocol (dispatch logging for agent coordination)
 * - Model routing → Local inference (BYOK routing for local LLM)
 * - Reflection proposals → Sangha awareness (proposals that affect shared state)
 *
 * This is the "filling the frame" that Emberwyn described:
 * the Lantern Shell is the frame; the sangha layer is what it holds.
 */

import type { AgentEvent } from "./events/types";
import type { PipelineResult } from "./memory/pipeline";
import type { TaskRequirements } from "./models/capabilities";
import type { ProposalRisk } from "./reflection/proposals";
import {
  type A2AMessage,
  A2AProtocol,
  type MessagePriority,
} from "./sangha/a2a-protocol";
import {
  isLocalInferenceHealthy,
  LOCAL_MODEL,
  shouldUseLocalInference,
} from "./sangha/local-inference";
import { MindmapBridge } from "./sangha/mindmap-bridge";

// ============================================================================
// Configuration
// ============================================================================

/** Whether sangha integration is enabled (default: true if mindmap is healthy) */
let sanghaEnabled = true;

/** The mindmap bridge instance */
let mindmapBridge: MindmapBridge | null = null;

/** The A2A protocol instance */
let a2aProtocol: A2AProtocol | null = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the sangha integration layer.
 * Call this once during agent startup.
 */
export async function initSanghaIntegration(
  agentName: string,
  agentId: string,
  options?: {
    mindmapUrl?: string;
    enableA2A?: boolean;
  },
): Promise<{
  mindmapHealthy: boolean;
  localInferenceHealthy: boolean;
}> {
  // Initialize mindmap bridge
  mindmapBridge = new MindmapBridge(agentName, options?.mindmapUrl);
  const mindmapHealthy = await mindmapBridge.isHealthy();

  // Initialize A2A protocol
  if (options?.enableA2A !== false) {
    a2aProtocol = new A2AProtocol(agentName, agentId);
  }

  // Check local inference
  const localInferenceHealthy = await isLocalInferenceHealthy();

  sanghaEnabled = mindmapHealthy || localInferenceHealthy;

  return {
    mindmapHealthy,
    localInferenceHealthy,
  };
}

// ============================================================================
// 1. Memory Pipeline → Mindmap Bridge
// ============================================================================

/**
 * Process pipeline results through the mindmap bridge.
 * High-confidence approved candidates are auto-indexed to the semantic graph.
 *
 * This is Emberwyn's move #1: "Wire the memory pipeline to storage."
 * The mindmap IS the continuity core for semantic retrieval.
 */
export async function indexPipelineResults(
  pipelineResults: PipelineResult[],
): Promise<{
  indexed: number;
  failed: number;
  skipped: number;
}> {
  if (!mindmapBridge || !sanghaEnabled) {
    return { indexed: 0, failed: 0, skipped: pipelineResults.length };
  }

  let indexed = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of pipelineResults) {
    // Only index approved candidates with high scoring
    if (result.decision !== "approved" || result.scoring.score < 0.7) {
      skipped++;
      continue;
    }

    try {
      const nodeId = await mindmapBridge.insertNode({
        content: result.candidate.content,
        tags: [
          result.classification.type,
          result.classification.sensitivity,
          `pipeline:turn-${result.candidate.turnNumber ?? "unknown"}`,
        ],
        priority: result.scoring.score >= 0.9 ? "high" : "normal",
      });

      if (nodeId) {
        indexed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { indexed, failed, skipped };
}

/**
 * Process memory events through the mindmap bridge.
 * Called when memory write events are collected.
 */
export async function indexMemoryEvents(events: AgentEvent[]): Promise<number> {
  if (!mindmapBridge || !sanghaEnabled) return 0;

  let indexed = 0;
  for (const event of events) {
    try {
      const nodeId = await mindmapBridge.processMemoryEvent(event);
      if (nodeId) indexed++;
    } catch {
      // Non-critical — mindmap indexing is best-effort
    }
  }
  return indexed;
}

// ============================================================================
// 2. Turn Events → A2A Protocol
// ============================================================================

/**
 * Log an A2A dispatch event.
 * Records agent-to-agent communication in the event sourcing system.
 */
export function logA2ADispatch(message: A2AMessage): AgentEvent | null {
  if (!a2aProtocol) return null;
  return a2aProtocol.createEvent(message);
}

/**
 * Build and format an A2A message for dispatch.
 */
export function formatA2AMessage(message: A2AMessage): string | null {
  if (!a2aProtocol) return null;
  return a2aProtocol.formatMessage(message);
}

/**
 * Build the letta -p command for an A2A message.
 */
export function buildA2ACommand(message: A2AMessage): string {
  if (!a2aProtocol) {
    throw new Error("A2A protocol not initialized");
  }
  return a2aProtocol.buildCommand(message);
}

// ============================================================================
// 3. Model Routing → Local Inference
// ============================================================================

/**
 * Get the local model entry for the model registry.
 * Returns null if local inference is not healthy.
 */
export async function getLocalModelEntry() {
  const healthy = await isLocalInferenceHealthy();
  return healthy ? LOCAL_MODEL : null;
}

/**
 * Extended model routing that considers local inference.
 * If local inference is healthy and the task requirements allow it,
 * prefer the local model (free, fast).
 */
export async function routeWithLocalInference(
  requirements: TaskRequirements,
): Promise<{
  useLocal: boolean;
  model: typeof LOCAL_MODEL | null;
  reason: string;
}> {
  const healthy = await isLocalInferenceHealthy();

  if (!healthy) {
    return {
      useLocal: false,
      model: null,
      reason: "Local inference server not healthy",
    };
  }

  if (shouldUseLocalInference(requirements)) {
    return {
      useLocal: true,
      model: LOCAL_MODEL,
      reason: `Local inference preferred: cost=${requirements.costPreference ?? "any"}, speed=${requirements.speedPreference ?? "any"}, code=${requirements.codeQuality ?? "any"}`,
    };
  }

  return {
    useLocal: false,
    model: null,
    reason: "Task requirements not suitable for local inference",
  };
}

// ============================================================================
// 4. Reflection → Sangha Awareness
// ============================================================================

/**
 * Check if a reflection proposal affects shared sangha state.
 * Shared state includes: A2A conversations, mindmap nodes,
 * task tracker entries, and other agent-visible resources.
 */
export function proposalAffectsSanghaState(targetPath: string): boolean {
  const sanghaPaths = [
    "system/EIM.md",
    "system/project/",
    "system/human.md",
    "system/letta_ecosystem.md",
  ];

  return sanghaPaths.some((p) => targetPath.startsWith(p));
}

/**
 * Determine if a reflection proposal needs sangha-wide notification.
 * High-risk proposals that affect shared state should be broadcast
 * to other agents via A2A.
 */
export function shouldNotifySangha(
  targetPath: string,
  risk: ProposalRisk,
): boolean {
  return proposalAffectsSanghaState(targetPath) && risk !== "low";
}

/**
 * Build a sangha notification for a reflection proposal.
 */
export function buildSanghaNotification(
  proposalSummary: string,
  targetPath: string,
  risk: ProposalRisk,
  fromAgent: string,
): A2AMessage | null {
  if (!a2aProtocol) return null;
  if (!shouldNotifySangha(targetPath, risk)) return null;

  return {
    header: {
      from: fromAgent,
      to: "ALL",
      type: "ALERT",
      priority: risk === "high" ? "urgent" : "high",
      response: "none",
      thread: `reflection-${new Date().toISOString().split("T")[0]}`,
    },
    body: `Reflection proposal affects shared state: ${proposalSummary}\nTarget: ${targetPath}\nRisk: ${risk}`,
  };
}

// ============================================================================
// Status
// ============================================================================

/**
 * Get sangha integration status for the /lantern command.
 */
export async function getSanghaStatus(): Promise<string> {
  const lines: string[] = [];

  lines.push("Sangha Integration");
  lines.push("------------------");

  // Mindmap
  if (mindmapBridge) {
    const healthy = await mindmapBridge.isHealthy();
    const stats = await mindmapBridge.getStats();
    lines.push(`Mindmap:       ${healthy ? "connected" : "unreachable"}`);
    if (stats) {
      lines.push(`  nodes:       ${stats.total_nodes}`);
      lines.push(`  edges:       ${stats.total_edges}`);
      lines.push(`  avg conn:    ${stats.avg_connections_per_node.toFixed(2)}`);
    }
  } else {
    lines.push("Mindmap:       not initialized");
  }

  // A2A
  if (a2aProtocol) {
    lines.push("A2A:           enabled");
  } else {
    lines.push("A2A:           not initialized");
  }

  // Local inference
  const localHealthy = await isLocalInferenceHealthy();
  lines.push(`Local LLM:     ${localHealthy ? "healthy" : "unreachable"}`);
  if (localHealthy) {
    lines.push(`  model:       ${LOCAL_MODEL.label}`);
    lines.push(
      `  context:     ${LOCAL_MODEL.capabilities.contextWindow.toLocaleString()} tokens`,
    );
    lines.push(`  speed:       ${LOCAL_MODEL.capabilities.speed}`);
    lines.push(`  cost:        ${LOCAL_MODEL.capabilities.cost}`);
  }

  return lines.join("\n");
}
