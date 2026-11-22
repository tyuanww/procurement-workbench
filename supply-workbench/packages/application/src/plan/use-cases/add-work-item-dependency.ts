import { ForbiddenError } from '../../shared/errors.js';
import type { WorkItemDependency } from '../../../../domain/src/entities/work-items.js';
import { authorize } from '../../shared/authorize.js';
import type { AddWorkItemDependency, AddWorkItemDependencyDeps } from '../boundary.js';
import { assertDependencyAllowed } from '../policies/dependencies.js';
import { newWorkItemEvent } from '../policies/events.js';
import { auditOf } from '../../shared/audit.js';

const DEPENDENCY_KIND = 'finish_to_start' as const;

export const makeAddWorkItemDependency =
  (deps: AddWorkItemDependencyDeps): AddWorkItemDependency =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    return deps.uow.run(async (tx) => {
      await tx.workItemDependencies.lockGraph();
      const from = await tx.workItems.get(input.fromItemId);
      const to = await tx.workItems.get(input.toItemId);
      if (from.subjectType === 'product_development' || to.subjectType === 'product_development') throw new ForbiddenError('product-development.manage');
      const existing = await tx.workItemDependencies.findPair({ fromItemId: from.id, toItemId: to.id, kind: DEPENDENCY_KIND });
      if (existing !== undefined) return { dependencyId: existing.id, created: false };
      assertDependencyAllowed({ edges: await tx.workItemDependencies.listAll(), fromItemId: from.id, toItemId: to.id });
      const dependency: WorkItemDependency = { id: deps.ids.next(), fromItemId: from.id, toItemId: to.id, kind: DEPENDENCY_KIND, createdAt: at };
      await tx.workItemDependencies.save(dependency);
      await tx.workItemEvents.append(newWorkItemEvent({
        id: deps.ids.next(),
        workItemId: to.id,
        kind: 'dependency_changed',
        field: 'dependency',
        oldValue: null,
        newValue: { fromItemId: from.id, toItemId: to.id, kind: DEPENDENCY_KIND },
        actorUserId: actor.id,
        note: null,
        createdAt: at,
      }));
      await tx.audit.record(auditOf({ action: 'work_item.dependency_add', subject: dependency, ctx: { actor, at, entity: '排期依赖' } }));
      return { dependencyId: dependency.id, created: true };
    });
  };
