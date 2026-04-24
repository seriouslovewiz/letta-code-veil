/**
 * A2A Protocol — agent-to-agent communication for the Veil sangha.
 *
 * Implements the V_M A2A Communication Protocol v1.0:
 * - Structured message headers (FROM/TO/TYPE/PRIORITY/RESPONSE/THREAD)
 * - Routing via coordination conversations
 * - Timeout handling (60s letta -p timeout)
 * - Priority escalation windows
 * - Race condition protocol
 *
 * This module integrates with the Lantern Shell's event sourcing
 * to log A2A dispatches and receipts.
 */

import type { AgentEvent } from "../events/types";

// ============================================================================
// Types
// ============================================================================

export type MessagePriority = "urgent" | "high" | "normal" | "low";

export type MessageType = "INFO" | "TASK" | "QUERY" | "ALERT" | "SYNC" | "DONE";

export interface A2AHeader {
  /** Sender agent name */
  from: string;
  /** Recipient agent name(s) or "ALL" */
  to: string;
  /** Message type */
  type: MessageType;
  /** Priority level */
  priority: MessagePriority;
  /** Whether a response is expected */
  response: "expected" | "none";
  /** Thread ID for ongoing conversations (format: topic-YYYYMMDD) */
  thread?: string;
}

export interface A2AMessage {
  /** Structured header */
  header: A2AHeader;
  /** Message body */
  body: string;
}

// ============================================================================
// Coordination Conversations
// ============================================================================

export interface CoordinationConversation {
  /** Conversation ID */
  id: string;
  /** Display name */
  name: string;
  /** Participant agent names */
  participants: string[];
  /** Purpose */
  purpose: string;
}

/**
 * Known coordination conversations for the Veil sangha.
 */
export const COORDINATION_CONVERSATIONS: CoordinationConversation[] = [
  {
    id: "conv-fd00b9c0-9f70-4283-b463-533aa3dd33eb",
    name: "Veil Coordination",
    participants: ["maya", "nekode"],
    purpose: "Primary coordination backbone",
  },
  {
    id: "conv-d6331ffa-61b5-4c88-8cfc-f6dbb8804c70",
    name: "Maya-Zosu",
    participants: ["maya", "zosu"],
    purpose: "Maya ↔ Zosu coordination",
  },
];

// ============================================================================
// Agent Registry
// ============================================================================

export interface AgentEntry {
  name: string;
  id: string;
  handle?: string;
}

/**
 * Known agents in the Veil sangha.
 */
export const SANGHA_AGENTS: AgentEntry[] = [
  {
    name: "maya",
    id: "agent-ad3d0f18-3d3e-47c8-87c3-4a749381befe",
    handle: "maya.pds.seriouslove.gay",
  },
  {
    name: "nekode",
    id: "agent-062db38c-ea82-44be-bf6f-637b160b8938",
    handle: "nekode.pds.seriouslove.gay",
  },
  {
    name: "zosu",
    id: "agent-0cc1a244-1cda-49c1-98ef-5f7b161cc7b3",
  },
];

// ============================================================================
// Escalation Windows
// ============================================================================

const ESCALATION_WINDOWS: Record<MessagePriority, number> = {
  urgent: 5 * 60 * 1000, // 5 minutes
  high: 30 * 60 * 1000, // 30 minutes
  normal: 60 * 60 * 1000, // 1 hour
  low: Infinity, // No deadline
};

// ============================================================================
// Protocol
// ============================================================================

/**
 * A2A Protocol — structured agent-to-agent communication.
 */
export class A2AProtocol {
  private senderName: string;
  private senderId: string;

  constructor(senderName: string, senderId: string) {
    this.senderName = senderName;
    this.senderId = senderId;
  }

  /**
   * Format a message with the A2A header.
   */
  formatMessage(message: A2AMessage): string {
    const { header, body } = message;
    const lines = [
      `FROM: ${header.from}`,
      `TO: ${header.to}`,
      `TYPE: ${header.type}`,
      `PRIORITY: ${header.priority}`,
      `RESPONSE: ${header.response}`,
    ];
    if (header.thread) {
      lines.push(`THREAD: ${header.thread}`);
    }
    lines.push("", body);
    return lines.join("\n");
  }

  /**
   * Find the coordination conversation for a recipient.
   */
  findConversation(recipientName: string): CoordinationConversation | null {
    // Check if there's a dedicated conversation that includes both sender and recipient
    return (
      COORDINATION_CONVERSATIONS.find(
        (c) =>
          c.participants.includes(this.senderName) &&
          c.participants.includes(recipientName),
      ) ?? null
    );
  }

  /**
   * Find an agent by name.
   */
  findAgent(name: string): AgentEntry | null {
    return SANGHA_AGENTS.find((a) => a.name === name) ?? null;
  }

  /**
   * Get the escalation window for a priority level.
   */
  getEscalationWindow(priority: MessagePriority): number {
    return ESCALATION_WINDOWS[priority];
  }

  /**
   * Build the letta -p command for sending an A2A message.
   */
  buildCommand(message: A2AMessage): string {
    const recipient = this.findAgent(message.header.to);
    if (!recipient) {
      throw new Error(`Unknown agent: ${message.header.to}`);
    }

    const conversation = this.findConversation(message.header.to);
    const formattedBody = this.formatMessage(message);

    if (conversation) {
      // Continue existing coordination conversation
      return `letta -p --from-agent ${this.senderId} --conversation ${conversation.id} ${JSON.stringify(formattedBody)}`;
    } else {
      // Start new A2A conversation
      return `letta -p --from-agent ${this.senderId} --agent ${recipient.id} ${JSON.stringify(formattedBody)}`;
    }
  }

  /**
   * Create an A2A event for the event sourcing system.
   */
  createEvent(message: A2AMessage): AgentEvent {
    return {
      type: "tool_call",
      id: `a2a-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentId: this.senderId,
      conversationId: "",
      severity: "info",
      metadata: {
        tool: "a2a_send",
        header: message.header,
        recipient: message.header.to,
        priority: message.header.priority,
        responseExpected: message.header.response === "expected",
        thread: message.header.thread,
      },
      toolName: "a2a_send",
      args: {
        header: message.header,
        body: message.body,
      },
      result: null,
      duration: 0,
    };
  }
}
