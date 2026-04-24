import { describe, expect, it } from "bun:test";
import {
  type ActionCategory,
  approveRequest,
  createApprovalRequest,
  DEFAULT_POLICIES,
  getApprovalStats,
  getAuditStats,
  getPendingApprovals,
  hasPermission,
  logAuditEvent,
  queryAuditLog,
  type Role,
  rejectRequest,
} from "../../agent/governance/rbac";

describe("Permission policies", () => {
  it("has default policies defined", () => {
    expect(DEFAULT_POLICIES.length).toBeGreaterThan(0);
    expect(DEFAULT_POLICIES.some((p) => p.action === "memory_write")).toBe(
      true,
    );
    expect(DEFAULT_POLICIES.some((p) => p.action === "bash_command")).toBe(
      true,
    );
  });

  it("public memory read requires no permission", () => {
    const result = hasPermission("user", "memory_read", {
      sensitivity: "public",
    });
    expect(result.allowed).toBe(true);
    expect(result.requiredLevel).toBe("none");
  });

  it("sensitive memory read requires user permission", () => {
    const result = hasPermission("user", "memory_read", {
      sensitivity: "sensitive",
    });
    expect(result.requiredLevel).toBe("user");
  });

  it("private memory write requires admin permission", () => {
    const result = hasPermission("user", "memory_write", {
      sensitivity: "private",
    });
    expect(result.allowed).toBe(false);
    expect(result.requiredLevel).toBe("admin");
  });

  it("admin can do anything user can", () => {
    const userResult = hasPermission("user", "memory_write", {
      sensitivity: "sensitive",
    });
    const adminResult = hasPermission("admin", "memory_write", {
      sensitivity: "sensitive",
    });

    expect(userResult.allowed).toBe(true);
    expect(adminResult.allowed).toBe(true);
  });

  it("bash commands require user permission", () => {
    const result = hasPermission("user", "bash_command");
    expect(result.requiredLevel).toBe("user");
    expect(result.allowed).toBe(true);
  });

  it("low-risk reflection proposals need no approval", () => {
    const result = hasPermission("user", "reflection_apply", { risk: "low" });
    expect(result.requiredLevel).toBe("none");
  });

  it("high-risk reflection proposals need admin", () => {
    const result = hasPermission("user", "reflection_apply", { risk: "high" });
    expect(result.requiredLevel).toBe("admin");
    expect(result.allowed).toBe(false);
  });

  it("governance changes require admin", () => {
    const userResult = hasPermission("user", "governance_change");
    const adminResult = hasPermission("admin", "governance_change");

    expect(userResult.allowed).toBe(false);
    expect(adminResult.allowed).toBe(true);
  });
});

describe("Approval workflow", () => {
  it("creates an approval request", () => {
    const request = createApprovalRequest(
      "memory_write",
      "Write to private memory file",
      "admin",
    );

    expect(request.id).toBeDefined();
    expect(request.status).toBe("pending");
    expect(request.requiredLevel).toBe("admin");
  });

  it("gets pending approvals", () => {
    createApprovalRequest("bash_command", "Run dangerous script", "user");
    const pending = getPendingApprovals();
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });

  it("approves a request", () => {
    const request = createApprovalRequest(
      "memory_delete",
      "Delete old memory",
      "user",
    );

    const approved = approveRequest(request.id, "admin-user");
    expect(approved!.status).toBe("approved");
    expect(approved!.reviewedBy).toBe("admin-user");
  });

  it("rejects a request", () => {
    const request = createApprovalRequest(
      "bash_command",
      "Run forbidden command",
      "user",
    );

    const rejected = rejectRequest(
      request.id,
      "admin-user",
      "Command too dangerous",
    );
    expect(rejected!.status).toBe("rejected");
  });

  it("handles expiration", () => {
    const request = createApprovalRequest(
      "memory_write",
      "Temporary write",
      "user",
      { expiresIn: -1 }, // Already expired
    );

    const pending = getPendingApprovals();
    expect(pending.find((r) => r.id === request.id)).toBeUndefined();
  });

  it("gets approval statistics", () => {
    const stats = getApprovalStats();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.approved).toBe("number");
  });
});

describe("Audit logging", () => {
  it("logs an audit event", () => {
    const event = logAuditEvent({
      action: "memory_write",
      actor: "user",
      target: "knowledge/test.md",
      result: "allowed",
      requiredLevel: "none",
      reason: "Public memory write",
      severity: "info",
    });

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.action).toBe("memory_write");
  });

  it("queries the audit log", () => {
    logAuditEvent({
      action: "bash_command",
      actor: "user",
      result: "allowed",
      requiredLevel: "user",
      reason: "User approved",
      severity: "warning",
    });

    const results = queryAuditLog({ action: "bash_command" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.action).toBe("bash_command");
  });

  it("filters by role", () => {
    logAuditEvent({
      action: "governance_change",
      actor: "admin",
      result: "allowed",
      requiredLevel: "admin",
      reason: "Admin change",
      severity: "critical",
    });

    const results = queryAuditLog({ role: "admin" });
    expect(results.every((e) => e.actor === "admin")).toBe(true);
  });

  it("filters by severity", () => {
    logAuditEvent({
      action: "memory_delete",
      actor: "user",
      result: "denied",
      requiredLevel: "admin",
      reason: "Insufficient permissions",
      severity: "critical",
    });

    const results = queryAuditLog({ severity: "critical" });
    expect(results.every((e) => e.severity === "critical")).toBe(true);
  });

  it("limits results", () => {
    for (let i = 0; i < 5; i++) {
      logAuditEvent({
        action: "memory_read",
        actor: "user",
        result: "allowed",
        requiredLevel: "none",
        reason: "Test",
        severity: "info",
      });
    }

    const results = queryAuditLog({ action: "memory_read", limit: 2 });
    expect(results.length).toBe(2);
  });

  it("gets audit statistics", () => {
    const stats = getAuditStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.byResult.allowed).toBeGreaterThanOrEqual(0);
    expect(stats.byResult.denied).toBeGreaterThanOrEqual(0);
  });
});

describe("Permission integration", () => {
  it("combines permission check with audit logging", () => {
    const role: Role = "user";
    const action: ActionCategory = "memory_write";
    const sensitivity = "sensitive" as const;

    const check = hasPermission(role, action, { sensitivity });

    logAuditEvent({
      action,
      actor: role,
      result: check.allowed ? "allowed" : "denied",
      requiredLevel: check.requiredLevel,
      reason: check.reason,
      severity: check.allowed ? "info" : "warning",
    });

    const logs = queryAuditLog({ action });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
