/**
 * Governance — RBAC, action policies, and audit interface.
 *
 * The governance module provides:
 * - Role-based access control (RBAC)
 * - Action policies (what actions require what permissions)
 * - Audit interface (querying events for governance)
 * - Approval workflows for sensitive operations
 */

import type { EventSeverity } from "../events/types";
import type { MemorySensitivity } from "../memory/taxonomy";
import type { ProposalRisk } from "../reflection/proposals";

// ============================================================================
// RBAC Types
// ============================================================================

/**
 * Permission levels for actions.
 */
export type PermissionLevel =
  | "none" // No permission required
  | "user" // User approval required
  | "admin" // Admin approval required
  | "system"; // System-only (cannot be approved by user)

/**
 * Roles in the system.
 */
export type Role =
  | "user" // Standard user
  | "admin" // Administrator
  | "system"; // System-level (automated processes)

/**
 * Action categories for permission checks.
 */
export type ActionCategory =
  | "memory_read" // Reading memory files
  | "memory_write" // Writing memory files
  | "memory_delete" // Deleting memory files
  | "tool_execute" // Executing tools
  | "bash_command" // Running shell commands
  | "mode_change" // Changing operation modes
  | "config_change" // Changing agent configuration
  | "identity_change" // Changing persona/identity
  | "reflection_apply" // Applying reflection proposals
  | "governance_change"; // Changing governance settings

/**
 * A permission rule.
 */
export interface PermissionRule {
  /** The action category */
  action: ActionCategory;
  /** Required permission level */
  requiredLevel: PermissionLevel;
  /** Whether this requires audit logging */
  audit: boolean;
  /** Additional constraints */
  constraints?: {
    /** Only for specific tools */
    tools?: string[];
    /** Only for specific memory paths */
    paths?: string[];
    /** Only for specific sensitivity levels */
    sensitivity?: MemorySensitivity[];
    /** Only for specific risk levels */
    risk?: ProposalRisk[];
  };
}

// ============================================================================
// Action Policies
// ============================================================================

/**
 * Default action policies.
 */
export const DEFAULT_POLICIES: PermissionRule[] = [
  // Memory operations
  {
    action: "memory_read",
    requiredLevel: "none",
    audit: false,
    constraints: { sensitivity: ["public"] },
  },
  {
    action: "memory_read",
    requiredLevel: "user",
    audit: true,
    constraints: { sensitivity: ["sensitive", "private"] },
  },
  {
    action: "memory_write",
    requiredLevel: "none",
    audit: true,
    constraints: { sensitivity: ["public"] },
  },
  {
    action: "memory_write",
    requiredLevel: "user",
    audit: true,
    constraints: { sensitivity: ["sensitive"] },
  },
  {
    action: "memory_write",
    requiredLevel: "admin",
    audit: true,
    constraints: { sensitivity: ["private"] },
  },
  {
    action: "memory_delete",
    requiredLevel: "user",
    audit: true,
  },

  // Tool execution
  {
    action: "tool_execute",
    requiredLevel: "none",
    audit: false,
    constraints: { tools: ["Read", "Grep", "Glob"] },
  },
  {
    action: "tool_execute",
    requiredLevel: "user",
    audit: true,
    constraints: { tools: ["Bash", "Write", "Edit"] },
  },

  // Bash commands
  {
    action: "bash_command",
    requiredLevel: "user",
    audit: true,
  },

  // Mode changes
  {
    action: "mode_change",
    requiredLevel: "none",
    audit: true,
  },

  // Config changes
  {
    action: "config_change",
    requiredLevel: "user",
    audit: true,
  },

  // Identity changes
  {
    action: "identity_change",
    requiredLevel: "user",
    audit: true,
  },

  // Reflection proposals
  {
    action: "reflection_apply",
    requiredLevel: "none",
    audit: true,
    constraints: { risk: ["low"] },
  },
  {
    action: "reflection_apply",
    requiredLevel: "user",
    audit: true,
    constraints: { risk: ["medium"] },
  },
  {
    action: "reflection_apply",
    requiredLevel: "admin",
    audit: true,
    constraints: { risk: ["high"] },
  },

  // Governance changes
  {
    action: "governance_change",
    requiredLevel: "admin",
    audit: true,
  },
];

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if a role has permission for an action.
 */
export function hasPermission(
  role: Role,
  action: ActionCategory,
  context?: {
    tool?: string;
    path?: string;
    sensitivity?: MemorySensitivity;
    risk?: ProposalRisk;
  },
): { allowed: boolean; requiredLevel: PermissionLevel; reason: string } {
  // Find applicable rules
  const applicableRules = DEFAULT_POLICIES.filter((rule) => {
    if (rule.action !== action) return false;

    // Check constraints
    if (rule.constraints) {
      if (rule.constraints.tools && context?.tool) {
        if (!rule.constraints.tools.includes(context.tool)) return false;
      }
      if (rule.constraints.paths && context?.path) {
        if (!rule.constraints.paths.some((p) => context.path?.includes(p)))
          return false;
      }
      if (rule.constraints.sensitivity && context?.sensitivity) {
        if (!rule.constraints.sensitivity.includes(context.sensitivity))
          return false;
      }
      if (rule.constraints.risk && context?.risk) {
        if (!rule.constraints.risk.includes(context.risk)) return false;
      }
    }

    return true;
  });

  if (applicableRules.length === 0) {
    // No matching rule — default to user permission
    return {
      allowed: role === "admin" || role === "user",
      requiredLevel: "user",
      reason: "No matching policy — defaulting to user permission",
    };
  }

  // Get the highest required level
  const levelPriority: Record<PermissionLevel, number> = {
    none: 0,
    user: 1,
    admin: 2,
    system: 3,
  };

  const highestRule = applicableRules.reduce((highest, rule) => {
    if (
      levelPriority[rule.requiredLevel] > levelPriority[highest.requiredLevel]
    ) {
      return rule;
    }
    return highest;
  });

  const rolePriority: Record<Role, number> = {
    user: 1,
    admin: 2,
    system: 3,
  };

  const allowed =
    rolePriority[role] >= levelPriority[highestRule.requiredLevel];

  return {
    allowed,
    requiredLevel: highestRule.requiredLevel,
    reason: allowed
      ? `Role ${role} satisfies ${highestRule.requiredLevel} requirement`
      : `Role ${role} does not satisfy ${highestRule.requiredLevel} requirement`,
  };
}

// ============================================================================
// Approval Workflow
// ============================================================================

/**
 * An approval request for a sensitive action.
 */
export interface ApprovalRequest {
  /** Request ID */
  id: string;
  /** The action being requested */
  action: ActionCategory;
  /** Description of what's being done */
  description: string;
  /** Required permission level */
  requiredLevel: PermissionLevel;
  /** Current status */
  status: "pending" | "approved" | "rejected" | "expired";
  /** Who requested */
  requestedBy: Role;
  /** When requested */
  requestedAt: string;
  /** Who approved/rejected */
  reviewedBy?: string;
  /** When reviewed */
  reviewedAt?: string;
  /** Expiration time */
  expiresAt?: string;
  /** Context details */
  context?: Record<string, unknown>;
}

/**
 * In-memory approval queue.
 */
const approvalQueue: Map<string, ApprovalRequest> = new Map();

let approvalIdCounter = 0;

function generateApprovalId(): string {
  approvalIdCounter++;
  return `approval-${Date.now()}-${approvalIdCounter}`;
}

/**
 * Create an approval request.
 */
export function createApprovalRequest(
  action: ActionCategory,
  description: string,
  requiredLevel: PermissionLevel,
  options?: {
    requestedBy?: Role;
    expiresIn?: number; // seconds
    context?: Record<string, unknown>;
  },
): ApprovalRequest {
  const now = new Date();
  const expiresAt = options?.expiresIn
    ? new Date(now.getTime() + options.expiresIn * 1000).toISOString()
    : undefined;

  const request: ApprovalRequest = {
    id: generateApprovalId(),
    action,
    description,
    requiredLevel,
    status: "pending",
    requestedBy: options?.requestedBy ?? "system",
    requestedAt: now.toISOString(),
    expiresAt,
    context: options?.context,
  };

  approvalQueue.set(request.id, request);
  return request;
}

/**
 * Get pending approval requests.
 */
export function getPendingApprovals(): ApprovalRequest[] {
  const now = new Date();
  return [...approvalQueue.values()].filter((r) => {
    if (r.status !== "pending") return false;
    if (r.expiresAt && new Date(r.expiresAt) < now) {
      r.status = "expired";
      return false;
    }
    return true;
  });
}

/**
 * Approve a request.
 */
export function approveRequest(
  id: string,
  reviewedBy: string,
): ApprovalRequest | undefined {
  const request = approvalQueue.get(id);
  if (!request || request.status !== "pending") return undefined;

  request.status = "approved";
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date().toISOString();
  return request;
}

/**
 * Reject a request.
 */
export function rejectRequest(
  id: string,
  reviewedBy: string,
  reason?: string,
): ApprovalRequest | undefined {
  const request = approvalQueue.get(id);
  if (!request || request.status !== "pending") return undefined;

  request.status = "rejected";
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date().toISOString();
  request.context = { ...request.context, rejectionReason: reason };
  return request;
}

/**
 * Get approval statistics.
 */
export function getApprovalStats(): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
} {
  const requests = [...approvalQueue.values()];
  return {
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
    expired: requests.filter((r) => r.status === "expired").length,
  };
}

// ============================================================================
// Audit Interface
// ============================================================================

/**
 * Audit query options.
 */
export interface AuditQuery {
  /** Filter by action category */
  action?: ActionCategory;
  /** Filter by role */
  role?: Role;
  /** Filter by severity */
  severity?: EventSeverity;
  /** Time range start */
  from?: string;
  /** Time range end */
  to?: string;
  /** Maximum results */
  limit?: number;
}

/**
 * Audit event for the audit log.
 */
export interface AuditEvent {
  id: string;
  timestamp: string;
  action: ActionCategory;
  actor: Role;
  target?: string;
  result: "allowed" | "denied";
  requiredLevel: PermissionLevel;
  reason: string;
  severity: EventSeverity;
  metadata?: Record<string, unknown>;
}

/**
 * In-memory audit log.
 */
const auditLog: AuditEvent[] = [];

/**
 * Log an audit event.
 */
export function logAuditEvent(
  event: Omit<AuditEvent, "id" | "timestamp">,
): AuditEvent {
  const auditEvent: AuditEvent = {
    id: `audit-${Date.now()}-${auditLog.length}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
  auditLog.push(auditEvent);
  return auditEvent;
}

/**
 * Query the audit log.
 */
export function queryAuditLog(query: AuditQuery): AuditEvent[] {
  let results = [...auditLog];

  if (query.action) {
    results = results.filter((e) => e.action === query.action);
  }
  if (query.role) {
    results = results.filter((e) => e.actor === query.role);
  }
  if (query.severity) {
    results = results.filter((e) => e.severity === query.severity);
  }
  if (query.from) {
    results = results.filter((e) => e.timestamp >= query.from!);
  }
  if (query.to) {
    results = results.filter((e) => e.timestamp <= query.to!);
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (query.limit) {
    results = results.slice(0, query.limit);
  }

  return results;
}

/**
 * Get audit statistics.
 */
export function getAuditStats(): {
  total: number;
  byAction: Record<ActionCategory, number>;
  byResult: { allowed: number; denied: number };
} {
  const byAction: Record<string, number> = {};
  let allowed = 0;
  let denied = 0;

  for (const event of auditLog) {
    byAction[event.action] = (byAction[event.action] ?? 0) + 1;
    if (event.result === "allowed") allowed++;
    else denied++;
  }

  return {
    total: auditLog.length,
    byAction: byAction as Record<ActionCategory, number>,
    byResult: { allowed, denied },
  };
}
