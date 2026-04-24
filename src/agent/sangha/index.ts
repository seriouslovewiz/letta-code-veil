/**
 * Sangha Layer — V_M household coordination interfaces.
 *
 * This module provides:
 * - Mindmap bridge: index memory events to the shared semantic graph
 * - A2A protocol: agent-to-agent messaging with structured headers
 * - Presence: lightweight agent status tracking
 * - Task tracker: shared YAML task coordination
 *
 * These are V_M-specific extensions that integrate with the
 * Lantern Shell's event sourcing and memory pipeline.
 */

export {
  type A2AHeader,
  type A2AMessage,
  A2AProtocol,
  type MessagePriority,
} from "./a2a-protocol";
export {
  isLocalInferenceHealthy,
  LOCAL_MODEL,
  shouldUseLocalInference,
} from "./local-inference";
export {
  MindmapBridge,
  type MindmapEdge,
  type MindmapNode,
} from "./mindmap-bridge";
