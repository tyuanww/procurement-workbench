import type { ReviewStatus } from '@sw/domain';

type Reviewed = {
  readonly status: ReviewStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly updatedAt: string;
};

export function reviewed<T extends Reviewed>(row: T, stamp: { readonly actorId: string; readonly at: string; readonly status: ReviewStatus }): T {
  return { ...row, status: stamp.status, reviewedBy: stamp.actorId, reviewedAt: stamp.at, updatedAt: stamp.at };
}
