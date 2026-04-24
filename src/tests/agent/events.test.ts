import { beforeEach, describe, expect, it } from "bun:test";
import type { AgentEvent, EventQuery } from "../../agent/events";
import {
  createGovernanceEvent,
  createIdentityChangeEvent,
  createMemoryReadEvent,
  createMemoryWriteEvent,
  createModeChangeEvent,
  createPermissionEvent,
  createReflectionEvent,
  createToolCallEvent,
  EventStore,
  isEventType,
  resetEventCounter,
} from "../../agent/events";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a minimal tool call event for testing, with deterministic fields.
 */
function makeToolCall(
  overrides?: Partial<AgentEvent> & { toolName?: string; duration?: number },
) {
  return createToolCallEvent(
    overrides?.agentId ?? "agent-1",
    overrides?.toolName ?? "read_file",
    { path: "/tmp/test.txt" },
    "file contents",
    overrides?.duration ?? 42,
    {
      conversationId: overrides?.conversationId ?? "conv-1",
      severity: overrides?.severity ?? "info",
      metadata: overrides?.metadata ?? {},
    },
  );
}

/**
 * Create a minimal memory write event for testing.
 */
function makeMemoryWrite(
  overrides?: Partial<AgentEvent> & {
    path?: string;
    operation?: "create" | "update" | "delete";
  },
) {
  return createMemoryWriteEvent(
    overrides?.agentId ?? "agent-1",
    overrides?.path ?? "knowledge/test.md",
    overrides?.operation ?? "create",
    undefined,
    "new content",
    {
      conversationId: overrides?.conversationId ?? "conv-1",
      severity: overrides?.severity ?? "info",
      metadata: overrides?.metadata ?? {},
    },
  );
}

// ============================================================================
// Event Creation Tests
// ============================================================================

describe("Event creation", () => {
  beforeEach(() => {
    resetEventCounter();
  });

  it("creates a tool call event with correct type and payload", () => {
    const event = createToolCallEvent(
      "agent-1",
      "read_file",
      { path: "/tmp/test.txt" },
      "contents",
      100,
    );

    expect(event.type).toBe("tool_call");
    expect(event.agentId).toBe("agent-1");
    expect(event.toolName).toBe("read_file");
    expect(event.args).toEqual({ path: "/tmp/test.txt" });
    expect(event.result).toBe("contents");
    expect(event.duration).toBe(100);
    expect(event.id).toMatch(/^evt-\d+-\d+$/);
    expect(event.timestamp).toBeTruthy();
    expect(event.severity).toBe("info");
  });

  it("creates a memory write event with correct type and payload", () => {
    const event = createMemoryWriteEvent(
      "agent-1",
      "knowledge/typescript.md",
      "update",
      "old content",
      "new content",
    );

    expect(event.type).toBe("memory_write");
    expect(event.path).toBe("knowledge/typescript.md");
    expect(event.operation).toBe("update");
    expect(event.before).toBe("old content");
    expect(event.after).toBe("new content");
  });

  it("creates a memory read event with correct type and payload", () => {
    const event = createMemoryReadEvent("agent-1", "knowledge/typescript.md");

    expect(event.type).toBe("memory_read");
    expect(event.path).toBe("knowledge/typescript.md");
  });

  it("creates an identity change event with correct type and payload", () => {
    const event = createIdentityChangeEvent(
      "agent-1",
      "persona",
      "I am a helpful assistant",
      "I am a coding expert",
    );

    expect(event.type).toBe("identity_change");
    expect(event.field).toBe("persona");
    expect(event.before).toBe("I am a helpful assistant");
    expect(event.after).toBe("I am a coding expert");
    expect(event.severity).toBe("warning"); // default for identity changes
  });

  it("creates a mode change event with correct type and payload", () => {
    const event = createModeChangeEvent("agent-1", "standard", "restricted");

    expect(event.type).toBe("mode_change");
    expect(event.from).toBe("standard");
    expect(event.to).toBe("restricted");
  });

  it("creates a permission event with correct type and payload", () => {
    const granted = createPermissionEvent("agent-1", "execute", "bash", true);
    expect(granted.type).toBe("permission");
    expect(granted.action).toBe("execute");
    expect(granted.tool).toBe("bash");
    expect(granted.granted).toBe(true);
    expect(granted.severity).toBe("info"); // granted => info

    const denied = createPermissionEvent("agent-1", "execute", "bash", false);
    expect(denied.granted).toBe(false);
    expect(denied.severity).toBe("warning"); // denied => warning
  });

  it("creates a reflection event with correct type and payload", () => {
    const event = createReflectionEvent(
      "agent-1",
      ["Reduce verbosity", "Be more concise"],
      ["Applied successfully", "Partially applied"],
    );

    expect(event.type).toBe("reflection");
    expect(event.proposals).toHaveLength(2);
    expect(event.outcomes).toHaveLength(2);
  });

  it("creates a governance event with correct type and payload", () => {
    const event = createGovernanceEvent(
      "agent-1",
      "memory_delete",
      "knowledge/sensitive.md",
      "denied",
      "File contains sensitive user data",
    );

    expect(event.type).toBe("governance");
    expect(event.action).toBe("memory_delete");
    expect(event.target).toBe("knowledge/sensitive.md");
    expect(event.decision).toBe("denied");
    expect(event.reason).toBe("File contains sensitive user data");
    expect(event.severity).toBe("warning"); // denied => warning
  });

  it("allows overriding severity and conversationId via options", () => {
    const event = createToolCallEvent("agent-1", "bash", {}, "ok", 10, {
      conversationId: "conv-42",
      severity: "critical",
      metadata: { source: "test" },
    });

    expect(event.conversationId).toBe("conv-42");
    expect(event.severity).toBe("critical");
    expect(event.metadata).toEqual({ source: "test" });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe("isEventType type guard", () => {
  beforeEach(() => {
    resetEventCounter();
  });

  it("narrows a tool_call event correctly", () => {
    const event: AgentEvent = createToolCallEvent("a", "bash", {}, "ok", 5);
    expect(isEventType(event, "tool_call")).toBe(true);
    if (isEventType(event, "tool_call")) {
      expect(event.toolName).toBe("bash");
    }
  });

  it("returns false for non-matching types", () => {
    const event: AgentEvent = createMemoryReadEvent("a", "test.md");
    expect(isEventType(event, "tool_call")).toBe(false);
  });
});

// ============================================================================
// EventStore Tests
// ============================================================================

describe("EventStore", () => {
  let store: EventStore;

  beforeEach(() => {
    resetEventCounter();
    store = new EventStore();
  });

  it("appends and retrieves events", () => {
    const event = makeToolCall();
    store.append(event);

    expect(store.size).toBe(1);
    const recent = store.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.id).toBe(event.id);
  });

  it("queries events by type", () => {
    store.append(makeToolCall());
    store.append(makeMemoryWrite());
    store.append(makeToolCall());

    const toolCalls = store.getEventsByType("tool_call");
    expect(toolCalls).toHaveLength(2);

    const memoryWrites = store.getEventsByType("memory_write");
    expect(memoryWrites).toHaveLength(1);

    const reflections = store.getEventsByType("reflection");
    expect(reflections).toHaveLength(0);
  });

  it("queries events by conversation ID", () => {
    const event1 = makeToolCall({ conversationId: "conv-1" });
    const event2 = makeToolCall({ conversationId: "conv-2" });
    const event3 = makeMemoryWrite({ conversationId: "conv-1" });

    store.append(event1);
    store.append(event2);
    store.append(event3);

    const conv1 = store.getEventsForConversation("conv-1");
    expect(conv1).toHaveLength(2);

    const conv2 = store.getEventsForConversation("conv-2");
    expect(conv2).toHaveLength(1);

    const conv3 = store.getEventsForConversation("conv-999");
    expect(conv3).toHaveLength(0);
  });

  it("queries events by agent ID", () => {
    const event1 = makeToolCall({ agentId: "agent-1" });
    const event2 = makeToolCall({ agentId: "agent-2" });

    store.append(event1);
    store.append(event2);

    const results = store.query({ agentId: "agent-1" });
    expect(results).toHaveLength(1);
    expect(results[0]!.agentId).toBe("agent-1");
  });

  it("queries events by severity", () => {
    const event1 = createToolCallEvent("a", "bash", {}, "ok", 5, {
      severity: "critical",
    });
    const event2 = makeToolCall(); // info severity

    store.append(event1);
    store.append(event2);

    const critical = store.query({ severity: "critical" });
    expect(critical).toHaveLength(1);
    expect(critical[0]!.severity).toBe("critical");
  });

  it("queries events by time range", () => {
    // Create events with specific timestamps
    const earlyEvent = makeToolCall();
    // Manually set timestamps for deterministic testing
    const midEvent = makeToolCall();
    const lateEvent = makeToolCall();

    // We'll use the actual timestamps but query relative to them
    store.append(earlyEvent);
    store.append(midEvent);
    store.append(lateEvent);

    // Query for all events in a very wide range
    const all = store.query({
      timeRange: {
        start: "2020-01-01T00:00:00.000Z",
        end: "2099-12-31T23:59:59.999Z",
      },
    });
    expect(all).toHaveLength(3);

    // Query for events before any were created
    const none = store.query({
      timeRange: {
        start: "2020-01-01T00:00:00.000Z",
        end: "2020-01-02T00:00:00.000Z",
      },
    });
    expect(none).toHaveLength(0);
  });

  it("combines multiple filters", () => {
    const event1 = makeToolCall({ conversationId: "conv-1" });
    const event2 = makeMemoryWrite({ conversationId: "conv-1" });
    const event3 = makeToolCall({ conversationId: "conv-2" });

    store.append(event1);
    store.append(event2);
    store.append(event3);

    // Tool calls in conv-1
    const results = store.query({
      type: "tool_call",
      conversationId: "conv-1",
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(event1.id);
  });

  it("returns recent events with limit", () => {
    for (let i = 0; i < 10; i++) {
      store.append(makeToolCall());
    }

    const recent5 = store.getRecent(5);
    expect(recent5).toHaveLength(5);

    // Should be the last 5 events
    const all = store.query({});
    const last5 = all.slice(-5);
    expect(recent5.map((e) => e.id)).toEqual(last5.map((e) => e.id));
  });

  it("computes stats correctly", () => {
    store.append(makeToolCall());
    store.append(makeToolCall());
    store.append(makeMemoryWrite());
    store.append(
      createToolCallEvent("a", "bash", {}, "ok", 5, { severity: "critical" }),
    );

    const stats = store.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byType["tool_call"]).toBe(3);
    expect(stats.byType["memory_write"]).toBe(1);
    expect(stats.bySeverity["info"]).toBe(3);
    expect(stats.bySeverity["critical"]).toBe(1);
  });

  it("evicts oldest events when max size is reached", () => {
    const smallStore = new EventStore(3);

    const e1 = makeToolCall();
    const e2 = makeToolCall();
    const e3 = makeToolCall();
    const e4 = makeToolCall();

    smallStore.append(e1);
    smallStore.append(e2);
    smallStore.append(e3);
    expect(smallStore.size).toBe(3);

    // Adding a 4th should evict the 1st
    smallStore.append(e4);
    expect(smallStore.size).toBe(3);

    const ids = smallStore.getRecent(10).map((e) => e.id);
    expect(ids).toContain(e2.id);
    expect(ids).toContain(e3.id);
    expect(ids).toContain(e4.id);
    expect(ids).not.toContain(e1.id);
  });

  it("continues evicting as more events are added past capacity", () => {
    const tinyStore = new EventStore(2);

    const events = [];
    for (let i = 0; i < 5; i++) {
      events.push(makeToolCall());
      tinyStore.append(events[i]!);
    }

    expect(tinyStore.size).toBe(2);
    const ids = tinyStore.getRecent(10).map((e) => e.id);
    expect(ids).toContain(events[3]!.id);
    expect(ids).toContain(events[4]!.id);
    expect(ids).not.toContain(events[0]!.id);
    expect(ids).not.toContain(events[1]!.id);
    expect(ids).not.toContain(events[2]!.id);
  });

  it("clears all events", () => {
    store.append(makeToolCall());
    store.append(makeMemoryWrite());
    expect(store.size).toBe(2);

    store.clear();
    expect(store.size).toBe(0);
    expect(store.getStats().total).toBe(0);
  });

  it("returns empty results for empty store", () => {
    expect(store.query({})).toHaveLength(0);
    expect(store.getRecent(10)).toHaveLength(0);
    expect(store.getEventsByType("tool_call")).toHaveLength(0);
    expect(store.getEventsForConversation("conv-1")).toHaveLength(0);
  });
});
