/**
 * Contradiction Detection — find conflicting memories and identity drift.
 *
 * Contradiction detection runs during reflection to identify:
 * - Conflicting facts between memory files
 * - Memory that contradicts observed conversation behavior
 * - Identity drift (agent behavior diverging from persona)
 * - Stale or outdated memories
 */

import type { MemoryType } from "../memory/taxonomy";
import type { ReflectionProposal } from "./proposals";

// ============================================================================
// Contradiction Types
// ============================================================================

/**
 * Severity of a detected contradiction.
 */
export type ContradictionSeverity = "minor" | "moderate" | "critical";

/**
 * Type of contradiction detected.
 */
export type ContradictionKind =
  | "fact_conflict" // Two facts that can't both be true
  | "behavior_mismatch" // Agent behavior contradicts stated preference
  | "identity_drift" // Agent persona has drifted from defined identity
  | "stale_memory" // Memory is outdated or no longer accurate
  | "preference_conflict" // Conflicting user preferences
  | "scope_violation"; // Memory in wrong category/directory

/**
 * A detected contradiction between memories or behavior.
 */
export interface Contradiction {
  /** Unique ID */
  id: string;
  /** When detected */
  detectedAt: string;
  /** Kind of contradiction */
  kind: ContradictionKind;
  /** Severity level */
  severity: ContradictionSeverity;
  /** The conflicting items */
  sources: ContradictionSource[];
  /** Description of the conflict */
  description: string;
  /** Suggested resolution */
  resolution?: ContradictionResolution;
  /** Whether this has been addressed */
  addressed: boolean;
  /** When addressed */
  addressedAt?: string;
  /** How it was addressed */
  addressedBy?: string;
}

/**
 * A source item in a contradiction.
 */
export interface ContradictionSource {
  /** Type of source */
  type: "memory_file" | "conversation" | "identity_definition";
  /** Path or identifier */
  path?: string;
  /** Conversation ID if from conversation */
  conversationId?: string;
  /** The conflicting content snippet */
  content: string;
}

/**
 * A suggested resolution for a contradiction.
 */
export interface ContradictionResolution {
  /** Type of resolution */
  type: "update" | "delete" | "merge" | "clarify" | "archive";
  /** Which source to modify */
  target: string;
  /** Suggested new content or action */
  suggestion: string;
  /** Whether this can be auto-applied */
  autoApplicable: boolean;
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if two content strings contain a fact conflict.
 * Simple heuristic: look for negation patterns and direct contradictions.
 */
export function detectFactConflict(
  content1: string,
  content2: string,
): { hasConflict: boolean; description?: string } {
  const c1 = content1.toLowerCase();
  const c2 = content2.toLowerCase();

  // Check for negation contradictions: "X is Y" vs "X is not Y"
  const negationPatterns = [/\b(not|never|don'?t|doesn'?t|won'?t|can'?t)\b/i];

  // Extract key assertions from each content
  const extractAssertions = (text: string): string[] => {
    const assertions: string[] = [];
    // Simple sentence splitting
    const sentences = text.split(/[.!?]+/).map((s) => s.trim());
    for (const sentence of sentences) {
      if (sentence.length > 10 && sentence.length < 200) {
        assertions.push(sentence);
      }
    }
    return assertions;
  };

  const assertions1 = extractAssertions(c1);
  const assertions2 = extractAssertions(c2);

  // Check each pair for negation conflict
  for (const a1 of assertions1) {
    for (const a2 of assertions2) {
      // If one contains a negation pattern and the other doesn't
      const hasNeg1 = negationPatterns.some((p) => p.test(a1));
      const hasNeg2 = negationPatterns.some((p) => p.test(a2));

      if (hasNeg1 !== hasNeg2) {
        // Check if they're talking about the same thing
        const words1 = new Set(a1.split(/\s+/).filter((w) => w.length > 3));
        const words2 = new Set(a2.split(/\s+/).filter((w) => w.length > 3));
        const overlap = [...words1].filter((w) => words2.has(w)).length;

        if (overlap >= 2) {
          return {
            hasConflict: true,
            description: `Potential contradiction: "${a1}" vs "${a2}"`,
          };
        }
      }
    }
  }

  return { hasConflict: false };
}

/**
 * Check if memory content is stale (hasn't been updated in a while).
 */
export function detectStaleMemory(
  content: string,
  lastUpdated: string,
  memoryType: MemoryType,
): { isStale: boolean; reason?: string } {
  const now = new Date();
  const updated = new Date(lastUpdated);
  const daysSinceUpdate =
    (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);

  // Staleness thresholds by memory type
  const stalenessThresholds: Record<MemoryType, number> = {
    episodic: 30, // Events become stale after 30 days
    semantic: 365, // Facts stay valid for a year
    procedural: 180, // Procedures stay valid for 6 months
    relationship: 90, // Relationships evolve over 3 months
    project: 60, // Project state changes over 2 months
    reflective: 180, // Reflections stay valid for 6 months
  };

  const threshold = stalenessThresholds[memoryType];

  if (daysSinceUpdate > threshold) {
    return {
      isStale: true,
      reason: `Memory not updated in ${Math.floor(daysSinceUpdate)} days (threshold: ${threshold})`,
    };
  }

  return { isStale: false };
}

/**
 * Check for identity drift by comparing behavior against persona.
 */
export function detectIdentityDrift(
  personaContent: string,
  observedBehaviors: string[],
): {
  hasDrift: boolean;
  description?: string;
  severity?: ContradictionSeverity;
} {
  const persona = personaContent.toLowerCase();

  // Check for key persona traits
  const traitPatterns = [
    {
      pattern: /\b(never|don'?t|avoid)\s+(impersonate|share\s+secrets|assume)/i,
      trait: "no impersonation",
    },
    { pattern: /\b(warm|friendly|kind|helpful)\b/i, trait: "warmth" },
    { pattern: /\b(precise|accurate|careful)\b/i, trait: "precision" },
    { pattern: /\b(brief|concise|short)\b/i, trait: "brevity" },
  ];

  const detectedTraits: string[] = [];
  for (const { pattern, trait } of traitPatterns) {
    if (pattern.test(persona)) {
      detectedTraits.push(trait);
    }
  }

  // If persona defines brevity but behaviors suggest verbosity
  if (detectedTraits.includes("brevity")) {
    const verboseBehaviors = observedBehaviors.filter(
      (b) =>
        b.toLowerCase().includes("verbose") || b.toLowerCase().includes("long"),
    );
    if (verboseBehaviors.length > 0) {
      return {
        hasDrift: true,
        description: `Persona defines brevity but observed verbose behavior`,
        severity: "minor",
      };
    }
  }

  return { hasDrift: false };
}

// ============================================================================
// Contradiction Queue
// ============================================================================

let contradictionIdCounter = 0;

function generateContradictionId(): string {
  contradictionIdCounter++;
  return `contra-${Date.now()}-${contradictionIdCounter}`;
}

const contradictionQueue: Map<string, Contradiction> = new Map();

/**
 * Record a detected contradiction.
 */
export function recordContradiction(
  kind: ContradictionKind,
  severity: ContradictionSeverity,
  sources: ContradictionSource[],
  description: string,
  resolution?: ContradictionResolution,
): Contradiction {
  const contradiction: Contradiction = {
    id: generateContradictionId(),
    detectedAt: new Date().toISOString(),
    kind,
    severity,
    sources,
    description,
    resolution,
    addressed: false,
  };
  contradictionQueue.set(contradiction.id, contradiction);
  return contradiction;
}

/**
 * Get all unaddressed contradictions.
 */
export function getUnaddressedContradictions(): Contradiction[] {
  return [...contradictionQueue.values()].filter((c) => !c.addressed);
}

/**
 * Get contradictions by severity.
 */
export function getContradictionsBySeverity(
  severity: ContradictionSeverity,
): Contradiction[] {
  return [...contradictionQueue.values()].filter(
    (c) => c.severity === severity && !c.addressed,
  );
}

/**
 * Mark a contradiction as addressed.
 */
export function addressContradiction(
  id: string,
  addressedBy: string,
): Contradiction | undefined {
  const contradiction = contradictionQueue.get(id);
  if (!contradiction) return undefined;
  contradiction.addressed = true;
  contradiction.addressedAt = new Date().toISOString();
  contradiction.addressedBy = addressedBy;
  return contradiction;
}

/**
 * Get statistics.
 */
export function getContradictionStats(): {
  total: number;
  unaddressed: number;
  bySeverity: Record<ContradictionSeverity, number>;
  byKind: Record<ContradictionKind, number>;
} {
  const contradictions = [...contradictionQueue.values()];
  return {
    total: contradictions.length,
    unaddressed: contradictions.filter((c) => !c.addressed).length,
    bySeverity: {
      minor: contradictions.filter((c) => c.severity === "minor").length,
      moderate: contradictions.filter((c) => c.severity === "moderate").length,
      critical: contradictions.filter((c) => c.severity === "critical").length,
    },
    byKind: {
      fact_conflict: contradictions.filter((c) => c.kind === "fact_conflict")
        .length,
      behavior_mismatch: contradictions.filter(
        (c) => c.kind === "behavior_mismatch",
      ).length,
      identity_drift: contradictions.filter((c) => c.kind === "identity_drift")
        .length,
      stale_memory: contradictions.filter((c) => c.kind === "stale_memory")
        .length,
      preference_conflict: contradictions.filter(
        (c) => c.kind === "preference_conflict",
      ).length,
      scope_violation: contradictions.filter(
        (c) => c.kind === "scope_violation",
      ).length,
    },
  };
}
