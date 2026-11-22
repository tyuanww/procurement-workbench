export interface AuditEntry {
  readonly actorUserId: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly at: string;
}

export interface AuditLog {
  /** 只在工作单元内调用。工作单元回滚时这次记录也不留下。 */
  record(entry: AuditEntry): Promise<void>;
}
