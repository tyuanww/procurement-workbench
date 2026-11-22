import { isOpenBatch, type EntityId, type FollowUp } from '@sw/domain';
import type { AddFollowUpInput } from '../views.js';
import type { Actor } from '../../shared/actor.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { auditOf } from '../../shared/audit.js';
import { assertLineRefs, requiredText } from './line-ref.js';

type AppendInput = {
  readonly input: AddFollowUpInput;
  readonly actor: Actor;
  readonly at: string;
  readonly id: EntityId;
};

export async function appendFollowUp(tx: UnitOfWorkStores, ctx: AppendInput): Promise<void> {
  const text = requiredText(ctx.input.text, 'text');
  const { line, batch } = await assertLineRefs(tx, ctx.input);
  if (ctx.input.nextFollowUpAt !== undefined) {
    if (batch === undefined || !isOpenBatch(batch.status) || line.cancelledAt !== null || line.buyerUserId === null) {
      throw new ValidationFailedError('请为开放且已分派的要货批次设置下次跟进', { field: 'nextFollowUpAt' });
    }
    if (line.buyerUserId !== ctx.actor.id && !ctx.actor.roles.includes('admin')) {
      throw new ValidationFailedError('请由该订单的采购负责人设置下次跟进', { field: 'nextFollowUpAt' });
    }
  }
  const row = followUpOf(ctx, text);
  await tx.followUps.save(row);
  await tx.audit.record(
    auditOf({ action: 'follow_up.create', subject: row, ctx: { actor: ctx.actor, at: ctx.at, entity: '跟进记录' } }),
  );
}

function followUpOf(ctx: AppendInput, text: string): FollowUp {
  return {
    id: ctx.id,
    createdAt: ctx.at,
    updatedAt: ctx.at,
    orderLineId: ctx.input.orderLineId,
    batchId: ctx.input.batchId ?? null,
    kind: ctx.input.kind,
    text,
    ...(ctx.input.nextFollowUpAt === undefined ? {} : { nextFollowUpAt: ctx.input.nextFollowUpAt }),
    partyId: ctx.input.partyId ?? null,
    createdBy: ctx.actor.id,
  };
}
