import { entityId, isNotProvided, normalizeText, orderLineId, parsePoCell, type EntityId, type OrderLine, type PurchaseOrder } from '@sw/domain';
import { procurementSourceFact, procurementSourceKey } from '../../shared/procurement-source.js';
import type { ProcurementFact, ProcurementPreview, ProcurementPreviewFact, ProcurementResolution, ProcurementReviewReason } from '../../ports/procurement-preview.js';
import type { ProcurementMaterials, ProcurementRepository } from '../../ports/procurement-repository.js';
import { ownerAssignmentsOf } from '../../shared/owner-assignment.js';
import { StateConflictError } from '../../shared/errors.js';
import type { CommitContext } from './context.js';
import { applyPoOwner } from './po-master-v1-relations.js';
import type { PoMasterSuppliers } from './po-master-suppliers.js';

type Identity = {
  readonly key: string;
  readonly poRaw: string;
  readonly poNorm: string;
  readonly poFormat: PurchaseOrder['poFormat'];
  readonly code: string;
};

type AssessedFact = { readonly fact: ProcurementPreviewFact } & (
  | { readonly identity: Identity }
  | { readonly identity: null; readonly reasons: readonly ProcurementReviewReason[] }
);

type ComponentCommit = {
  readonly ctx: CommitContext;
  readonly repo: ProcurementRepository;
  readonly preview: ProcurementPreview;
  readonly finishedBySource: ReadonlyMap<string, string>;
  readonly suppliers: PoMasterSuppliers;
};

export async function commitPoComponents(input: ComponentCommit): Promise<void> {
  const { ctx, repo, preview, suppliers } = input;
  const assessed = preview.componentFacts.map(assessFact);
  const duplicates = duplicateIdentities(assessed);
  const supplierConflictsByPo = await conflictingSuppliers(assessed, suppliers);
  const confirmedBySource = confirmedLinks(input);
  const poNumbers = [...new Set(assessed.flatMap(({ identity }) => identity === null ? [] : [identity.poNorm]))];
  const [blocked, existing] = await Promise.all([repo.blockedIdentities(), repo.materialsByPoNumbers(poNumbers)]);
  const materials = indexMaterials(existing);
  const observations = [];
  for (const item of assessed) {
    const finishedLineIds = [...confirmedBySource.get(procurementSourceKey(item.fact.source)) ?? []];
    const result = await resolveFact({ ctx, item, finishedLineIds, checks: { duplicates, supplierConflictsByPo, blocked }, materials, suppliers });
    if (result.materialLineId !== null) {
      await repo.linkFinishedLines({ materialLineId: result.materialLineId, finishedLineIds });
      suppliers.observe(item.fact.supplierRaw);
    }
    observations.push({ ...result, finishedLineIds: result.materialLineId === null ? [] : finishedLineIds, identityKey: item.identity?.key ?? null, fact: procurementSourceFact(item.fact), importBatchId: ctx.batch.id });
  }
  await repo.recordObservations(observations);
  await repo.recordFile({ fileId: ctx.batch.fileId, importBatchId: ctx.batch.id });
}

function assessFact(fact: ProcurementPreviewFact): AssessedFact {
  const po = assessPo(providedText(fact.poRaw));
  const code = normalizeCode(fact.componentCodeRaw);
  if (code !== null && 'poNorm' in po) return { fact, identity: { ...po, key: componentKey(po.poNorm, code), code } };
  const reasons: ProcurementReviewReason[] = [];
  if ('reason' in po) reasons.push(po.reason);
  if (code === null) reasons.push('invalid_component_code');
  return { fact, identity: null, reasons };
}

function assessPo(poRaw: string | null): Omit<Identity, 'key' | 'code'> | { readonly reason: ProcurementReviewReason } {
  if (poRaw === null) return { reason: 'missing_po' };
  const { poNorm, poFormat, relatedPoRaws, extraText } = parsePoCell(poRaw).value;
  if (poNorm === null) return { reason: 'missing_po' };
  if (poFormat === 'OTHER' || relatedPoRaws.length > 0 || extraText !== null) return { reason: 'invalid_po' };
  return { poRaw, poNorm, poFormat };
}

function normalizeCode(value: string | null): string | null {
  const code = normalized(value)?.toUpperCase() ?? null;
  return code !== null && /^[A-Z0-9][A-Z0-9._-]*$/u.test(code) ? code : null;
}

function duplicateIdentities(items: readonly AssessedFact[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { identity } of items) {
    if (identity === null) continue;
    if (seen.has(identity.key)) duplicates.add(identity.key);
    seen.add(identity.key);
  }
  return duplicates;
}

type SupplierIdentity = { readonly name: string | null; readonly partyId: EntityId | null };

async function conflictingSuppliers(items: readonly AssessedFact[], lookup: PoMasterSuppliers): Promise<ReadonlySet<string>> {
  const suppliers = new Map<string, SupplierIdentity>();
  const conflicts = new Set<string>();
  for (const { identity, fact } of items) {
    if (identity === null) continue;
    const supplier = await supplierIdentity({ raw: fact.supplierRaw }, lookup);
    if (supplier === null) continue;
    if (supplierConflicts(suppliers.get(identity.poNorm), supplier)) conflicts.add(identity.poNorm);
    suppliers.set(identity.poNorm, supplier);
  }
  return conflicts;
}

async function supplierIdentity({ raw, approvedPartyId }: { readonly raw: string | null; readonly approvedPartyId?: EntityId | null | undefined }, suppliers: PoMasterSuppliers): Promise<SupplierIdentity | null> {
  const name = normalized(raw);
  const partyId = approvedPartyId ?? await suppliers.approvedPartyId(raw);
  return name === null && partyId === null ? null : { name, partyId };
}

function confirmedLinks({ preview, finishedBySource }: ComponentCommit): ReadonlyMap<string, ReadonlySet<string>> {
  const result = new Map<string, Set<string>>();
  for (const link of preview.links) {
    if (link.kind === 'candidate' || link.kind === 'group') continue;
    const lineId = finishedBySource.get(procurementSourceKey(link.finishedRow));
    if (lineId === undefined) continue;
    const key = procurementSourceKey(link.component);
    const ids = result.get(key) ?? new Set<string>();
    ids.add(lineId);
    result.set(key, ids);
  }
  return result;
}

async function resolveFact(input: {
  readonly ctx: CommitContext;
  readonly item: AssessedFact;
  readonly finishedLineIds: readonly string[];
  readonly checks: IdentityChecks;
  readonly materials: MaterialIndex;
  readonly suppliers: PoMasterSuppliers;
}): Promise<ProcurementResolution> {
  const { ctx, item, finishedLineIds, checks, materials, suppliers } = input;
  const { fact, identity } = item;
  const reasons: ProcurementReviewReason[] = finishedLineIds.length === 0 ? ['no_confirmed_finished_line'] : [];
  if (fact.quantityUnitConflict === true) reasons.push('quantity_unit_conflict');
  if (identity === null) return { materialLineId: null, reasons: [...item.reasons, ...reasons] };
  reasons.push(...reasonsFor(identity, checks));
  if (reasons.length > 0) return { materialLineId: null, reasons };
  const material = currentMaterial(materials, identity);
  if (material.kind === 'ambiguous') return { materialLineId: null, reasons: ['unresolved_history'] };
  const supplier = providedText(fact.supplierRaw);
  const previousSupplier = await supplierIdentity({ raw: material.po?.supplierRaw ?? null, approvedPartyId: material.po?.supplierPartyId }, suppliers);
  if (supplierConflicts(previousSupplier, await supplierIdentity({ raw: supplier }, suppliers))) return { materialLineId: null, reasons: ['supplier_conflict'] };
  const saved = await saveMaterial({ ctx, fact, identity, material, supplier, suppliers });
  materials.orders.set(saved.po.id, saved.po);
  return { materialLineId: saved.line.id, reasons: [] };
}

type IdentityChecks = {
  readonly duplicates: ReadonlySet<string>;
  readonly supplierConflictsByPo: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
};

function reasonsFor(identity: Identity, checks: IdentityChecks): ProcurementReviewReason[] {
  const reasons: ProcurementReviewReason[] = [];
  if (checks.duplicates.has(identity.key)) reasons.push('duplicate_identity');
  if (checks.supplierConflictsByPo.has(identity.poNorm)) reasons.push('supplier_conflict');
  if (checks.blocked.has(identity.key)) reasons.push('unresolved_history');
  return reasons;
}

type CurrentMaterial =
  | { readonly kind: 'unambiguous'; readonly po: PurchaseOrder | undefined; readonly line: OrderLine | undefined }
  | { readonly kind: 'ambiguous' };

type MaterialIndex = {
  readonly orders: Map<string, PurchaseOrder>;
  readonly linesByIdentity: ReadonlyMap<string, readonly OrderLine[]>;
};

function indexMaterials({ orders, lines }: ProcurementMaterials): MaterialIndex {
  const byId = new Map<string, PurchaseOrder>(orders.map((po) => [po.id, po]));
  const linesByIdentity = new Map<string, OrderLine[]>();
  for (const line of lines) {
    const poNorm = byId.get(line.purchaseOrderId)?.poNorm;
    const code = normalizeCode(line.itemCodeRaw ?? line.barcodeRaw);
    if (poNorm == null || code === null) continue;
    const key = componentKey(poNorm, code);
    const matches = linesByIdentity.get(key) ?? [];
    matches.push(line);
    linesByIdentity.set(key, matches);
  }
  return { orders: byId, linesByIdentity };
}

function currentMaterial(materials: MaterialIndex, identity: Identity): CurrentMaterial {
  const matches = materials.linesByIdentity.get(identity.key) ?? [];
  const [line] = matches;
  if (matches.length > 1 || (line !== undefined && line.candidateKey !== identity.key)) return { kind: 'ambiguous' };
  const poId = line?.purchaseOrderId ?? materialPoId(identity);
  return { kind: 'unambiguous', po: materials.orders.get(poId), line };
}

function componentKey(po: string, code: string): string {
  return JSON.stringify(['procurement-component', po, code]);
}

type SaveInput = {
  readonly ctx: CommitContext;
  readonly fact: ProcurementPreviewFact;
  readonly identity: Identity;
  readonly material: Extract<CurrentMaterial, { kind: 'unambiguous' }>;
  readonly supplier: string | null;
  readonly suppliers: PoMasterSuppliers;
};

async function saveMaterial({ ctx, fact, identity, material, supplier, suppliers }: SaveInput): Promise<{ readonly po: PurchaseOrder; readonly line: OrderLine }> {
  const existingPo = material.po;
  const po = existingPo === undefined
    ? materialPo({ ctx, identity, supplierRaw: supplier, supplierPartyId: await suppliers.approvedPartyId(supplier) })
    : await fillSupplier({ po: existingPo, supplier, suppliers, at: ctx.at });
  if (po !== existingPo) await ctx.tx.purchaseOrders.save(po);

  const previous = material.line;
  const line = previous === undefined
    ? newMaterial({ fact, identity, po, at: ctx.at })
    : await updateMaterial({ ctx, previous, fact });
  if (previous === undefined) await ctx.tx.orderLines.save(line);
  if (previous === undefined || fact.status === 'active') await assignBuyer({ ctx, line, fact });
  return { po, line };
}

async function assignBuyer({ ctx, line, fact }: { readonly ctx: CommitContext; readonly line: OrderLine; readonly fact: ProcurementPreviewFact }): Promise<void> {
  const buyer = providedText(fact.buyerRaw);
  if (buyer === null || line.cancelledAt !== null) return;
  const owner = await ownerAssignmentsOf(ctx.tx).findCurrent(line.id);
  if (owner?.source === 'manual' || (owner?.source === 'mapping_import' && owner.status === 'assigned')) return;
  const lookupName = fact.buyerFromRichText === true ? buyer.replace(/^[@＠]\s*/u, '') : buyer;
  await applyPoOwner({ ctx, lineId: line.id, name: buyer, lookupName });
}

async function fillSupplier({ po, supplier, suppliers, at }: { readonly po: PurchaseOrder; readonly supplier: string | null; readonly suppliers: PoMasterSuppliers; readonly at: string }): Promise<PurchaseOrder> {
  const supplierRaw = po.supplierRaw ?? supplier;
  const supplierPartyId = po.supplierPartyId ?? await suppliers.approvedPartyId(supplierRaw);
  if (supplierRaw === po.supplierRaw && supplierPartyId === po.supplierPartyId) return po;
  return { ...po, supplierRaw, supplierPartyId, updatedAt: at };
}

async function updateMaterial({ ctx, previous, fact }: { readonly ctx: CommitContext; readonly previous: OrderLine; readonly fact: ProcurementFact }): Promise<OrderLine> {
  if (fact.status === 'completed') return previous;
  const next = { ...previous, ...sourceFields(fact), updatedAt: ctx.at };
  if (next.nameRaw === previous.nameRaw && next.qtyOrdered === previous.qtyOrdered && next.unit === previous.unit) return previous;
  if (ctx.tx.orderLines.saveConditional === undefined) await ctx.tx.orderLines.save(next);
  else if (!await ctx.tx.orderLines.saveConditional(next, previous.updatedAt)) throw new StateConflictError('order_line.updated_at');
  return next;
}

function materialPoId(identity: Identity) {
  return entityId(`procurement-po:${identity.poNorm}`);
}

function materialPo({ ctx, identity, supplierRaw, supplierPartyId }: { readonly ctx: CommitContext; readonly identity: Identity; readonly supplierRaw: PurchaseOrder['supplierRaw']; readonly supplierPartyId: PurchaseOrder['supplierPartyId'] }): PurchaseOrder {
  return {
    id: materialPoId(identity), createdAt: ctx.at, updatedAt: ctx.at,
    poRaw: identity.poRaw, poNorm: identity.poNorm, poFormat: identity.poFormat, relatedPoRaws: [],
    supplierRaw, supplierPartyId, lane: 'material', oaDemandRef: null,
  };
}

function newMaterial({ fact, identity, po, at }: { readonly fact: ProcurementFact; readonly identity: Identity; readonly po: PurchaseOrder; readonly at: string }): OrderLine {
  return {
    id: orderLineId(`procurement-component:${identity.poNorm}:${identity.code}`), createdAt: at, updatedAt: at, purchaseOrderId: po.id,
    lane: 'material', itemId: null, itemCodeRaw: providedText(fact.componentCodeRaw), barcodeRaw: null,
    ...sourceFields(fact),
    buyerUserId: null, receiverPartyId: null, origin: 'import_procurement_component',
    candidateKey: identity.key, currentSnapshotId: null, missingInLatestImport: false, latestImportPresence: 'not_applicable',
    cancelledAt: null, cancelReason: null, stage: 'no_batch', stageChangedAt: at, nextDueBatchId: null, nextDueDate: null,
  };
}

function sourceFields(fact: ProcurementFact): Pick<OrderLine, 'nameRaw' | 'qtyOrdered' | 'unit'> {
  return { nameRaw: providedText(fact.componentNameRaw), qtyOrdered: fact.quantity, unit: providedText(fact.unitRaw) };
}

function supplierConflicts(existing: SupplierIdentity | null | undefined, incoming: SupplierIdentity | null): boolean {
  if (existing == null || incoming === null) return false;
  if (existing.partyId !== null && incoming.partyId !== null) return existing.partyId !== incoming.partyId;
  return existing.name !== null && incoming.name !== null && existing.name !== incoming.name;
}

function providedText(value: string | null): string | null {
  return value === null || isNotProvided(value) ? null : value.trim();
}

function normalized(value: string | null): string | null {
  const text = providedText(value);
  return text === null ? null : normalizeText(text);
}
