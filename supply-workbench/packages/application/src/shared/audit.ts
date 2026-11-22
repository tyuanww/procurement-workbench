import type { AuditEntry } from '../ports/audit-log.js';

type AuditSubject = { readonly id: string };

type AuditContext = {
  readonly actor: { readonly id: string };
  readonly at: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly entity?: string;
};

const ENTITY_LABELS: Record<string, string> = {
  user: '用户',
  settings: '设置',
};

export function auditOf({ action, subject, ctx }: { readonly action: string; readonly subject: AuditSubject; readonly ctx: AuditContext }): AuditEntry {
  const prefix = action.split('.')[0] ?? action;
  return {
    actorUserId: ctx.actor.id,
    action,
    entity: ctx.entity ?? ENTITY_LABELS[prefix] ?? prefix,
    entityId: subject.id,
    before: ctx.before ?? null,
    after: ctx.after === undefined ? subject : ctx.after,
    at: ctx.at,
  };
}
