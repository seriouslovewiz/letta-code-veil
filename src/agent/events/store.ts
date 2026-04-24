/**
 * Event Store — append-only, in-memory event store for the agent runtime.
 *
 * Provides querying, filtering, and basic statistics. When the store exceeds
 * its configured maximum size, the oldest events are evicted first.
 */

import type {
  AgentEvent,
  AgentEventType,
  EventQuery,
  EventSeverity,
} from "./types";

// ============================================================================
// Store Statistics
// ============================================================================

export interface EventStoreStats {
  /** Total number of events currently in the store */
  total: number;
  /** Count of events by type */
  byType: Partial<Record<AgentEventType, number>>;
  /** Count of events by severity */
  bySeverity: Partial<Record<EventSeverity, number>>;
}

// ============================================================================
// EventStore
// ============================================================================

const DEFAULT_MAX_SIZE = 10_000;

export class EventStore {
  private events: Map<string, AgentEvent>;
  /** Ordered list of event IDs — oldest first */
  private order: string[];
  private readonly maxSize: number;

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.events = new Map();
    this.order = [];
    this.maxSize = maxSize;
  }

  // --------------------------------------------------------------------------
  // Mutation
  // --------------------------------------------------------------------------

  /**
   * Append an event to the store.
   *
   * If the store is at capacity, the oldest event is evicted before appending.
   */
  append(event: AgentEvent): void {
    // Evict if at capacity
    if (this.events.size >= this.maxSize) {
      const oldestId = this.order.shift();
      if (oldestId !== undefined) {
        this.events.delete(oldestId);
      }
    }

    this.events.set(event.id, event);
    this.order.push(event.id);
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Query events with structured filters.
   *
   * Returns events in insertion order (oldest first).
   */
  query(filters: EventQuery): AgentEvent[] {
    let results = [...this.events.values()];

    if (filters.type !== undefined) {
      results = results.filter((e) => e.type === filters.type);
    }

    if (filters.agentId !== undefined) {
      results = results.filter((e) => e.agentId === filters.agentId);
    }

    if (filters.conversationId !== undefined) {
      results = results.filter(
        (e) => e.conversationId === filters.conversationId,
      );
    }

    if (filters.severity !== undefined) {
      results = results.filter((e) => e.severity === filters.severity);
    }

    if (filters.timeRange !== undefined) {
      const { start, end } = filters.timeRange;
      results = results.filter(
        (e) => e.timestamp >= start && e.timestamp <= end,
      );
    }

    return results;
  }

  /**
   * Get all events for a given conversation, in chronological order.
   */
  getEventsForConversation(conversationId: string): AgentEvent[] {
    return this.query({ conversationId });
  }

  /**
   * Get all events of a given type, in chronological order.
   */
  getEventsByType(type: AgentEventType): AgentEvent[] {
    return this.query({ type });
  }

  /**
   * Get the most recent N events (newest last).
   */
  getRecent(limit: number): AgentEvent[] {
    const start = Math.max(0, this.order.length - limit);
    const ids = this.order.slice(start);
    return ids
      .map((id) => this.events.get(id))
      .filter((e): e is AgentEvent => e !== undefined);
  }

  /**
   * Compute aggregate statistics about the current store contents.
   */
  getStats(): EventStoreStats {
    const byType: Partial<Record<AgentEventType, number>> = {};
    const bySeverity: Partial<Record<EventSeverity, number>> = {};

    for (const event of this.events.values()) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
    }

    return {
      total: this.events.size,
      byType,
      bySeverity,
    };
  }

  // --------------------------------------------------------------------------
  // Utility
  // --------------------------------------------------------------------------

  /**
   * Current number of events in the store.
   */
  get size(): number {
    return this.events.size;
  }

  /**
   * Remove all events from the store.
   */
  clear(): void {
    this.events.clear();
    this.order = [];
  }
}
