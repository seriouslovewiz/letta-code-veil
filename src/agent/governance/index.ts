/**
 * Governance module — RBAC, action policies, and audit interface.
 */

export type {
  ActionCategory,
  ApprovalRequest,
  AuditEvent,
  AuditQuery,
  PermissionLevel,
  PermissionRule,
  Role,
} from "./rbac";

export {
  approveRequest,
  createApprovalRequest,
  DEFAULT_POLICIES,
  getApprovalStats,
  getAuditStats,
  getPendingApprovals,
  hasPermission,
  logAuditEvent,
  queryAuditLog,
  rejectRequest,
} from "./rbac";
