/**
 * Instrumentation — factory functions for creating typed agent events.
 *
 * Each function produces a fully-formed event with a generated ID and timestamp.
 * These are the primary way application code records events into the store.
 */

import type {
  AgentEvent,
  EventSeverity,
  GovernanceEvent,
  IdentityChangeEvent,
  MemoryReadEvent,
  MemoryWriteEvent,
  ModeChangeEvent,
  PermissionEvent,
  ReflectionEvent,
  ToolCallEvent,
} from "./types";

// ============================================================================
// ID Generation
// ============================================================================

let eventCounter = 0;

/**
 * Generate a unique event ID using a counter + timestamp pattern.
 *
 * Format: `evt-{counter}-{timestamp}`
 */
function generateEventId(): string {
  eventCounter += 1;
  return `evt-${eventCounter}-${Date.now()}`;
}

/**
 * Reset the event counter. Useful in tests to get deterministic IDs.
 */
export function resetEventCounter(): void {
  eventCounter = 0;
}

// ============================================================================
// Event Factories
// ============================================================================

/**
 * Record a tool invocation.
 */
export function createToolCallEvent(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  duration: number,
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): ToolCallEvent {
  return {
    id: generateEventId(),
    type: "tool_call",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? "info",
    metadata: options?.metadata ?? {},
    toolName,
    args,
    result,
    duration,
  };
}

/**
 * Record a memory write (create, update, or delete).
 */
export function createMemoryWriteEvent(
  agentId: string,
  path: string,
  operation: "create" | "update" | "delete",
  before?: string,
  after?: string,
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): MemoryWriteEvent {
  return {
    id: generateEventId(),
    type: "memory_write",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? "info",
    metadata: options?.metadata ?? {},
    path,
    operation,
    before,
    after,
  };
}

/**
 * Record a memory read.
 */
export function createMemoryReadEvent(
  agentId: string,
  path: string,
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): MemoryReadEvent {
  return {
    id: generateEventId(),
    type: "memory_read",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? "info",
    metadata: options?.metadata ?? {},
    path,
  };
}

/**
 * Record a change to an identity field (persona, name, etc.).
 */
export function createIdentityChangeEvent(
  agentId: string,
  field: string,
  before: unknown,
  after: unknown,
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): IdentityChangeEvent {
  return {
    id: generateEventId(),
    type: "identity_change",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? "warning",
    metadata: options?.metadata ?? {},
    field,
    before,
    after,
  };
}

/**
 * Record a mode transition.
 */
export function createModeChangeEvent(
  agentId: string,
  from: string,
  to: string,
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): ModeChangeEvent {
  return {
    id: generateEventId(),
    type: "mode_change",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? "info",
    metadata: options?.metadata ?? {},
    from,
    to,
  };
}

/**
 * Record a permission check result.
 */
export function createPermissionEvent(
  agentId: string,
  action: string,
  tool: string,
  granted: boolean,
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): PermissionEvent {
  return {
    id: generateEventId(),
    type: "permission",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? (granted ? "info" : "warning"),
    metadata: options?.metadata ?? {},
    action,
    tool,
    granted,
  };
}

/**
 * Record a self-reflection cycle with proposals and outcomes.
 */
export function createReflectionEvent(
  agentId: string,
  proposals: string[],
  outcomes: string[],
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): ReflectionEvent {
  return {
    id: generateEventId(),
    type: "reflection",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? "info",
    metadata: options?.metadata ?? {},
    proposals,
    outcomes,
  };
}

/**
 * Record a governance decision (approval, denial, or deferral).
 */
export function createGovernanceEvent(
  agentId: string,
  action: string,
  target: string,
  decision: "approved" | "denied" | "deferred",
  reason: string,
  options?: {
    conversationId?: string;
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): GovernanceEvent {
  return {
    id: generateEventId(),
    type: "governance",
    timestamp: new Date().toISOString(),
    agentId,
    conversationId: options?.conversationId ?? "",
    severity: options?.severity ?? (decision === "denied" ? "warning" : "info"),
    metadata: options?.metadata ?? {},
    action,
    target,
    decision,
    reason,
  };
}

// ============================================================================
// Type Guard Helpers
// ============================================================================

/**
 * Narrow an AgentEvent to a specific event type.
 *
 * Usage:
 * ```ts
 * if (isEventType<"tool_call">(event, "tool_call")) { ... }
 * ```
 */
export function isEventType<T extends AgentEvent["type"]>(
  event: AgentEvent,
  type: T,
): event is Extract<AgentEvent, { type: T }> {
  return event.type === type;
}
