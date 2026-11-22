import { normalizeText, type EntityId, type FactoryReportRow, type OrderLine } from '@sw/domain';
import type { LinkFactoryRow, LinkFactoryRowDeps } from '../boundary.js';
import type { LinkFactoryRowInput } from '../views.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { NotFoundError, ValidationFailedError } from '../../shared/errors.js';
import { refreshLineProjection } from '../../shared/line-projection.js';

const TABLE_KIND = {
  'in-transit': 'in_transit',
  shipment: 'shipment',
  stock: 'stock',
  schedule: 'schedule',
  demand: 'demand',
  'packaging-combo': 'packaging_combo',
} as const;

export const makeLinkFactoryRow =
  (deps: LinkFactoryRowDeps): LinkFactoryRow =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const row = await rowInTable(tx, input);
      const line = await tx.orderLines.get(input.orderLineId);
      const after = { ...row, linkedOrderLineId: line.id, linkStatus: 'manual' as const, linkReason: null };
      await tx.factoryReports.save(after);
      if (input.approveCodeLink === true) await approvePair(tx, { ids: deps.ids, row, line, actorId: actor.id, at });
      await refreshLineProjection(tx, [line.id]);
      await tx.audit.record(auditOf({ action: 'factory-row.link', subject: after, ctx: { actor, at, before: row, after, entity: '上报行' } }));
    });
    return { rowId: input.rowId, kind: TABLE_KIND[input.table] };
  };

async function rowInTable(tx: UnitOfWorkStores, input: LinkFactoryRowInput): Promise<FactoryReportRow> {
  const row = await tx.factoryReports.get(input.rowId);
  if (row.kind !== TABLE_KIND[input.table]) throw new NotFoundError('上报行', input.rowId);
  return row;
}

async function approvePair(tx: UnitOfWorkStores, ctx: { readonly ids: IdGenerator; readonly row: FactoryReportRow; readonly line: OrderLine; readonly actorId: EntityId; readonly at: string }): Promise<void> {
  const left = await onlyCode(tx, firstCode(ctx.row.inTransit?.barcodeRaw, ctx.row.inTransit?.itemCodeRaw));
  const right = await onlyCode(tx, firstCode(ctx.line.itemCodeRaw, ctx.line.barcodeRaw));
  if (left.id === right.id) throw new ValidationFailedError('对照需要两边不同的编码');
  const existing = await tx.codeLinks.listApproved();
  if (existing.some((link) => samePair({ link, from: left.id, to: right.id }))) return;
  await tx.codeLinks.save({
    id: ctx.ids.next(),
    createdAt: ctx.at,
    updatedAt: ctx.at,
    fromCodeId: left.id,
    toCodeId: right.id,
    status: 'approved',
    evidence: { rowId: ctx.row.id, orderLineId: ctx.line.id },
    reviewedBy: ctx.actorId,
    reviewedAt: ctx.at,
  });
}

async function onlyCode(tx: UnitOfWorkStores, raw: string | null) {
  if (raw === null) throw new ValidationFailedError('对照两边的编码都要已经在编码表里');
  const found = await tx.itemCodes.listByNorm(normalizeText(raw));
  const code = found[0];
  if (code === undefined || found.length !== 1) throw new ValidationFailedError('对照两边的编码都要已经在编码表里');
  return code;
}

function firstCode(primary: string | null | undefined, secondary: string | null | undefined): string | null {
  if (primary !== null && primary !== undefined && primary !== '') return primary;
  if (secondary !== null && secondary !== undefined && secondary !== '') return secondary;
  return null;
}

function samePair({ link, from, to }: { readonly link: { readonly fromCodeId: string; readonly toCodeId: string }; readonly from: string; readonly to: string }): boolean {
  return (link.fromCodeId === from && link.toCodeId === to) || (link.fromCodeId === to && link.toCodeId === from);
}
