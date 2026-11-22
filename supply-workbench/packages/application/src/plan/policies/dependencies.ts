import { ValidationFailedError } from '../../shared/errors.js';

type Edge = {
  readonly fromItemId: string;
  readonly toItemId: string;
};

export type DependencyCandidate = {
  readonly edges: readonly Edge[];
  readonly fromItemId: string;
  readonly toItemId: string;
};

/** finish_to_start 边 from → to 表示 from 完成后 to 才能开始；新边不能自环，也不能成环。 */
export function assertDependencyAllowed(input: DependencyCandidate): void {
  if (input.fromItemId === input.toItemId) throw new ValidationFailedError('依赖不能指向自己');
  if (reaches({ edges: input.edges, start: input.toItemId, target: input.fromItemId })) {
    throw new ValidationFailedError('依赖会形成环', { fromItemId: input.fromItemId, toItemId: input.toItemId });
  }
}

function reaches(input: { readonly edges: readonly Edge[]; readonly start: string; readonly target: string }): boolean {
  const seen = new Set<string>([input.start]);
  const queue: string[] = [input.start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of successors(input.edges, current)) {
      if (next === input.target) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

function successors(edges: readonly Edge[], fromItemId: string): readonly string[] {
  return edges.filter((edge) => edge.fromItemId === fromItemId).map((edge) => edge.toItemId);
}
