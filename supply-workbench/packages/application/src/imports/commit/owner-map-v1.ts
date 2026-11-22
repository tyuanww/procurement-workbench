import { entityId, parsePoCell } from '@sw/domain';
import type { ImportRow, OrderLine } from '@sw/domain';
import type { OwnerMapPayload } from '../../ports/parsed-rows.js';
import { applyOwnerAssignment, ownerAssignmentsOf, type DesiredOwner } from '../../shared/owner-assignment.js';
import type { CommitContext, CommitResult } from './context.js';

/**
 * 负责人映射导入：按采购订单号找订单行，按负责人姓名精确匹配在职用户。
 * 匹配到唯一用户才写 assigned 并同步 buyer_user_id；零个或多个都进 pending，绝不写假负责人。
 * applyOwnerAssignment 保证手工归属优先、pending 不降级 assigned，重复提交是幂等的。
 */
export async function commitOwnerMap(ctx: CommitContext): Promise<CommitResult> {
  const affected: string[] = [];
  for (const row of ctx.rows) {
    const payload = payloadOf(row);
    if (payload === null) continue;
    const poNorm = poNormOf(payload.poRaw);
    if (poNorm === null) continue;
    const lines = await linesOfPo({ ctx, poNorm });
    affected.push(...await assignLines({ ctx, lines, ownerNameRaw: payload.ownerNameRaw }));
  }
  return { affectedLineIds: affected, presentLineIds: [] };
}

function payloadOf(row: ImportRow): OwnerMapPayload | null {
  if (row.action === 'skip') return null;
  const value = row.parsed;
  if (!isRecord(value)) return null;
  const poRaw = textAt(value, 'poRaw');
  const ownerNameRaw = textAt(value, 'ownerNameRaw');
  if (poRaw === null || ownerNameRaw === null || ownerNameRaw === '') return null;
  return { poRaw, ownerNameRaw };
}

function poNormOf(poRaw: string): string | null {
  const parsed = parsePoCell(poRaw);
  return parsed.value.poNorm === null || parsed.value.poNorm === '' ? null : parsed.value.poNorm;
}

async function linesOfPo(input: { readonly ctx: CommitContext; readonly poNorm: string }): Promise<readonly OrderLine[]> {
  const lines: OrderLine[] = [];
  for (const order of await input.ctx.tx.purchaseOrders.listByPoNorm(input.poNorm)) {
    lines.push(...await input.ctx.tx.orderLines.listByPurchaseOrder(order.id));
  }
  return lines;
}

async function assignLines(input: {
  readonly ctx: CommitContext;
  readonly lines: readonly OrderLine[];
  readonly ownerNameRaw: string;
}): Promise<string[]> {
  const ids: string[] = [];
  const desired = await desiredOf({ ctx: input.ctx, ownerNameRaw: input.ownerNameRaw });
  for (const line of input.lines) {
    await applyOwnerAssignment({ tx: input.ctx.tx, nextId: () => assignmentIdOf(input.ctx, line), at: input.ctx.at, line, desired });
    ids.push(line.id);
  }
  return ids;
}

async function desiredOf(input: { readonly ctx: CommitContext; readonly ownerNameRaw: string }): Promise<DesiredOwner> {
  const users = await ownerAssignmentsOf(input.ctx.tx).findUsersByName(input.ownerNameRaw);
  const user = users[0];
  if (users.length === 1 && user !== undefined) {
    return { status: 'assigned', ownerUserId: user.id, ownerNameRaw: user.name, source: 'mapping_import', sourceRef: input.ctx.batch.id };
  }
  return { status: 'pending', ownerUserId: null, ownerNameRaw: input.ownerNameRaw, source: 'mapping_import', sourceRef: input.ctx.batch.id };
}

function assignmentIdOf(ctx: CommitContext, line: OrderLine) {
  return entityId(`owner-map:${ctx.batch.id}:${line.id}`);
}

function textAt(value: Record<string, unknown>, key: string): string | null {
  const found = value[key];
  return typeof found === 'string' ? found : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
