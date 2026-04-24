/**
 * Mindmap Bridge — indexes Lantern Shell memory events to the
 * shared semantic graph at localhost:8765.
 *
 * This bridge listens to the event sourcing system and creates
 * mindmap nodes from high-confidence memory candidates. It also
 * creates edges when memory events reference existing nodes.
 *
 * The mindmap is the connective tissue over the markdown substrate.
 */

import type { AgentEvent, MemoryWriteEvent } from "../events/types";

// ============================================================================
// Types
// ============================================================================

export interface MindmapNode {
  /** Node content — the key insight */
  content: string;
  /** Tags: first = topic, second = memory path, third = type, fourth = agent */
  tags: string[];
  /** Priority: critical | high | normal | low */
  priority: "critical" | "high" | "normal" | "low";
}

export interface MindmapEdge {
  /** Source node ID */
  source_id: string;
  /** Target node ID */
  target_id: string;
  /** Relationship type */
  relationship: MindmapRelationship;
  /** Who created this edge */
  created_by: string;
}

export type MindmapRelationship =
  | "builds_on"
  | "supports"
  | "contrasts_with"
  | "questions"
  | "inspired_by"
  | "part_of";

export interface MindmapSearchResult {
  node: {
    id: string;
    content: string;
    tags: string | string[];
    priority: string;
    access_count: number;
    connection_count: number;
    created_at: number;
    updated_at: number;
    last_accessed: number;
  };
  similarity: number;
  match_type: string;
}

export interface MindmapStats {
  total_nodes: number;
  total_edges: number;
  total_accesses: number;
  avg_connections_per_node: number;
  most_connected_node: { id: string; content: string; connections: number };
  most_accessed_node: { id: string; content: string; accesses: number };
}

// ============================================================================
// Configuration
// ============================================================================

const MINDMAP_URL = process.env.VM_MINDMAP_URL || "http://localhost:8765";
const MINDMAP_TIMEOUT_MS = 5000;

// ============================================================================
// Bridge
// ============================================================================

/**
 * Mindmap Bridge — connects Lantern Shell events to the semantic graph.
 */
export class MindmapBridge {
  private baseUrl: string;
  private agentName: string;

  constructor(agentName: string, baseUrl?: string) {
    this.agentName = agentName;
    this.baseUrl = baseUrl || MINDMAP_URL;
  }

  /**
   * Check if the mindmap server is healthy.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(MINDMAP_TIMEOUT_MS),
      });
      const data = await response.json();
      return data.status === "healthy";
    } catch {
      return false;
    }
  }

  /**
   * Get server stats.
   */
  async getStats(): Promise<MindmapStats | null> {
    try {
      const response = await fetch(`${this.baseUrl}/stats`, {
        signal: AbortSignal.timeout(MINDMAP_TIMEOUT_MS),
      });
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Insert a node into the mindmap.
   */
  async insertNode(node: MindmapNode): Promise<string | null> {
    // Ensure agent tag is present
    const tags = [...node.tags];
    if (!tags.some((t) => t.startsWith("agent:"))) {
      tags.push(`agent:${this.agentName}`);
    }

    try {
      const response = await fetch(`${this.baseUrl}/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...node, tags }),
        signal: AbortSignal.timeout(MINDMAP_TIMEOUT_MS),
      });
      const data = await response.json();
      return data.node_id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Create an edge between two nodes.
   */
  async createEdge(edge: MindmapEdge): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/edges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edge),
        signal: AbortSignal.timeout(MINDMAP_TIMEOUT_MS),
      });
      const data = await response.json();
      return data.edge_id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Search the mindmap by semantic similarity.
   */
  async search(query: string, topK = 5): Promise<MindmapSearchResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: topK }),
        signal: AbortSignal.timeout(MINDMAP_TIMEOUT_MS),
      });
      const data = await response.json();
      return data.results ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Navigate a node — get it and all connected nodes.
   */
  async navigate(nodeId: string): Promise<unknown | null> {
    try {
      const response = await fetch(`${this.baseUrl}/nodes/${nodeId}`, {
        signal: AbortSignal.timeout(MINDMAP_TIMEOUT_MS),
      });
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Process a memory event from the Lantern Shell pipeline.
   * High-confidence candidates are auto-indexed to the mindmap.
   */
  async processMemoryEvent(event: AgentEvent): Promise<string | null> {
    if (event.type !== "memory_write") return null;

    const writeEvent = event as MemoryWriteEvent;
    const content = writeEvent.after ?? "";
    const confidence = Number(writeEvent.metadata?.confidence ?? 0);

    // Only index high-confidence memories
    if (confidence < 0.7 || !content) return null;

    const memoryPath = writeEvent.path;
    const memoryType = String(writeEvent.metadata?.memoryType ?? "insight");

    return this.insertNode({
      content,
      tags: [memoryType, memoryPath, `agent:${this.agentName}`],
      priority: confidence >= 0.9 ? "high" : "normal",
    });
  }
}
