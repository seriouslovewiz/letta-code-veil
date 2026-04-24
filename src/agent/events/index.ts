/**
 * Event Sourcing & Audit Log — public exports.
 *
 * This module provides the event sourcing infrastructure for the Lantern Shell
 * agent runtime. Every meaningful agent action is recorded as an immutable event
 * that can be queried, filtered, and analysed.
 */

// Instrumentation
export {
  createGovernanceEvent,
  createIdentityChangeEvent,
  createMemoryReadEvent,
  createMemoryWriteEvent,
  createModeChangeEvent,
  createPermissionEvent,
  createReflectionEvent,
  createToolCallEvent,
  isEventType,
  resetEventCounter,
} from "./instrumentation";
export type { EventStoreStats } from "./store";
// Store
export { EventStore } from "./store";
// Types
export type {
  AgentEvent,
  AgentEventBase,
  AgentEventType,
  EventQuery,
  EventSeverity,
  GovernanceEvent,
  IdentityChangeEvent,
  MemoryReadEvent,
  MemoryWriteEvent,
  ModeChangeEvent,
  PermissionEvent,
  ReflectionEvent,
  TimeRange,
  ToolCallEvent,
} from "./types";
