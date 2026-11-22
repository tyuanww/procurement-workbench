import type { OwnerAssignmentSource, OwnerAssignmentStatus } from '@sw/domain';

export type OwnerCoverage = {
  /** 订单行总数（可按采购员范围过滤）。 */
  readonly total: number;
  /** 有当前 assigned 记录的行数。 */
  readonly assigned: number;
  /** 既没有 assigned 也没有 pending 的行数。 */
  readonly unassigned: number;
  /** 有当前 pending 记录（名字没匹配上）的行数。 */
  readonly pending: number;
};

export type OwnerCoverageQuery = {
  /** 不传就是全量；采购员看自己的范围。 */
  readonly buyerUserId?: string | undefined;
};

export type OwnerAssignmentView = {
  readonly lineId: string;
  readonly status: OwnerAssignmentStatus;
  readonly source: OwnerAssignmentSource;
  readonly owner: { readonly id: string; readonly name: string } | null;
  readonly ownerNameRaw: string | null;
  readonly effectiveAt: string;
};

export type PendingOwnerView = {
  readonly id: string;
  readonly lineId: string;
  readonly nameRaw: string;
  readonly source: OwnerAssignmentSource;
  readonly effectiveAt: string;
};

/** 覆盖率和待审核队列的只读端口，由持久层实现。 */
export interface OwnerCoverageQueries {
  coverage(query: OwnerCoverageQuery): Promise<OwnerCoverage>;
  pending(): Promise<readonly PendingOwnerView[]>;
}

export type AssignOwnerInput = {
  readonly lineIds: readonly string[];
  readonly ownerUserId: string;
};

export type ResolvePendingOwnerInput = {
  /** 待审核记录里的原始姓名。 */
  readonly ownerNameRaw: string;
  readonly ownerUserId: string;
};
