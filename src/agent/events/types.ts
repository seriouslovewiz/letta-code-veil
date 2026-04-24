/**
 * Event Types — discriminated union schema for the agent event sourcing system.
 *
 * Every meaningful action the agent takes is recorded as an event. Events are
 * immutable, append-only records that form an audit log of agent behaviour.
 *
 * The discriminated union is keyed on `type` so consumers can narrow safely.
 */

// ============================================================================
// Severity
// ============================================================================

/**
 * Event severity levels.
 *
 * - info: routine operation (default)
 * - warning: something unexpected but recoverable
 * - critical: requires human attention
 */
export type EventSeverity = "info" | "warning" | "critical";

// ============================================================================
// Event Type Discriminators
// ============================================================================

export type AgentEventType =
  | "tool_call"
  | "memory_write"
  | "memory_read"
  | "identity_change"
  | "mode_change"
  | "permission"
  | "reflection"
  | "governance";

// ============================================================================
// Base Event
// ============================================================================

/**
 * Fields shared by every agent event.
 */
export interface AgentEventBase {
  /** Unique event identifier (counter + timestamp pattern) */
  id: string;
  /** Discriminator for the event type */
  type: AgentEventType;
  /** ISO-8601 timestamp of when the event occurred */
  timestamp: string;
  /** The agent that produced this event */
  agentId: string;
  /** Conversation this event belongs to */
  conversationId: string;
  /** Severity level */
  severity: EventSeverity;
  /** Arbitrary key-value metadata for extensions */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Concrete Event Types
// ============================================================================

export interface ToolCallEvent extends AgentEventBase {
  type: "tool_call";
  /** Name of the tool that was invoked */
  toolName: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Result returned by the tool (serialised) */
  result: unknown;
  /** Wall-clock duration in milliseconds */
  duration: number;
}

export interface MemoryWriteEvent extends AgentEventBase {
  type: "memory_write";
  /** Path of the memory file that was written */
  path: string;
  /** Kind of write operation */
  operation: "create" | "update" | "delete";
  /** Content before the write (absent on create) */
  before?: string;
  /** Content after the write (absent on delete) */
  after?: string;
}

export interface MemoryReadEvent extends AgentEventBase {
  type: "memory_read";
  /** Path of the memory file that was read */
  path: string;
}

export interface IdentityChangeEvent extends AgentEventBase {
  type: "identity_change";
  /** Which identity field changed */
  field: string;
  /** Previous value */
  before: unknown;
  /** New value */
  after: unknown;
}

export interface ModeChangeEvent extends AgentEventBase {
  type: "mode_change";
  /** Mode the agent transitioned from */
  from: string;
  /** Mode the agent transitioned to */
  to: string;
}

export interface PermissionEvent extends AgentEventBase {
  type: "permission";
  /** The action being authorised */
  action: string;
  /** The tool (or resource) the action targets */
  tool: string;
  /** Whether the permission was granted */
  granted: boolean;
}

export interface ReflectionEvent extends AgentEventBase {
  type: "reflection";
  /** Self-correction proposals generated during reflection */
  proposals: string[];
  /** Outcomes of applying those proposals (may be empty if not yet applied) */
  outcomes: string[];
}

export interface GovernanceEvent extends AgentEventBase {
  type: "governance";
  /** The governance action taken */
  action: string;
  /** The target of the governance action */
  target: string;
  /** The decision reached */
  decision: "approved" | "denied" | "deferred";
  /** Human-readable reason for the decision */
  reason: string;
}

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * The full event type — a discriminated union over all agent event kinds.
 */
export type AgentEvent =
  | ToolCallEvent
  | MemoryWriteEvent
  | MemoryReadEvent
  | IdentityChangeEvent
  | ModeChangeEvent
  | PermissionEvent
  | ReflectionEvent
  | GovernanceEvent;

// ============================================================================
// Query Types
// ============================================================================

export interface TimeRange {
  /** Inclusive start (ISO-8601) */
  start: string;
  /** Inclusive end (ISO-8601) */
  end: string;
}

/**
 * Structured query for the event store.
 *
 * All filters are optional — an empty query returns all events.
 */
export interface EventQuery {
  type?: AgentEventType;
  agentId?: string;
  conversationId?: string;
  timeRange?: TimeRange;
  severity?: EventSeverity;
}
