import { barcodeBase, entityId, productId, productImageId, spuKey, type EntityId, type Product, type ProductId } from '@sw/domain';
import type { ProductArchivePayload } from '../../ports/parsed-rows.js';
import { isTextCell } from './parsed-cells.js';
import { mountsOf } from '../use-cases/archive-images.js';
import type { CommitContext, CommitResult } from './context.js';
import { findCommittedProduct, mergeExistingProduct } from './product-merge.js';

export async function commitProductArchive(ctx: CommitContext): Promise<CommitResult> {
  for (const row of ctx.rows) {
    if (row.action === 'skip') continue;
    await writeProduct(ctx, row);
  }
  return { affectedLineIds: [], presentLineIds: [] };
}

async function writeProduct(ctx: CommitContext, row: import('@sw/domain').ImportRow): Promise<void> {
  const payload = payloadOf(row.parsed);
  if (payload === null) return;
  const barcode = payload.barcodeRaw.value;
  if (barcode === null) return;
  const current = row.targetId === null ? await findCommittedProduct(ctx, barcode) : await ctx.tx.products.find(row.targetId);
  if (current === undefined) {
    await createProduct(ctx, { row, payload, barcode });
    return;
  }
  await mergeExistingProduct({ ctx, row, payload, current });
}

async function createProduct(ctx: CommitContext, input: { readonly row: import('@sw/domain').ImportRow; readonly payload: ProductArchivePayload; readonly barcode: string }): Promise<void> {
  const id = productId(`${input.row.id}:product`);
  await ctx.tx.products.save(newProduct({ id, payload: input.payload, barcode: input.barcode, at: ctx.at, batchId: ctx.batch.id }));
  await ctx.tx.imports.saveRow({ ...input.row, action: 'create', targetId: id });
  await saveContact({ ctx, productId: id, payload: input.payload });
  await saveNewImages({ ctx, productId: id, rowNo: input.row.rowNo });
}

async function saveNewImages({ ctx, productId: id, rowNo }: { readonly ctx: CommitContext; readonly productId: ProductId; readonly rowNo: number }): Promise<void> {
  const order = { inner: 0, outer: 0 };
  for (const mount of mountsOf(ctx.batch.fileMeta)) {
    if (mount.rowNo !== rowNo) continue;
    const slotOrder = order[mount.slot];
    order[mount.slot] = slotOrder + 1;
    await ctx.tx.productImages.save({
      id: productImageId({ productId: id, sha256: mount.sha256, slot: mount.slot }),
      productId: id,
      slot: mount.slot,
      fileId: entityId(mount.sha256),
      order: slotOrder,
      source: 'import',
      importBatchId: ctx.batch.id,
      uploadedBy: null,
      hiddenAt: null,
      hiddenBy: null,
      hiddenReason: null,
    });
  }
}

function payloadOf(value: unknown): ProductArchivePayload | null {
  if (!isRecord(value) || !('barcodeRaw' in value) || !('contactNameRaw' in value)) return null;
  if (!isProductArchive(value)) throw new Error('产品档案行无法读取');
  return value;
}

function isProductArchive(value: Record<string, unknown>): value is ProductArchivePayload {
  return archiveNames(value) && archivePack(value);
}

function archiveNames(value: Record<string, unknown>): boolean {
  return isTextCell(value.filingName) && isTextCell(value.filingNo) && isTextCell(value.skuName) && isTextCell(value.barcodeRaw);
}

function archivePack(value: Record<string, unknown>): boolean {
  return isTextCell(value.netContent) && isTextCell(value.casePack) && isTextCell(value.outerSize) && isTextCell(value.contactNameRaw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function newProduct(input: { readonly id: ProductId; readonly payload: ProductArchivePayload; readonly barcode: string; readonly at: string; readonly batchId: EntityId }): Product {
  const filingName = input.payload.filingName.value;
  return {
    id: input.id,
    createdAt: input.at,
    updatedAt: input.at,
    barcodeRaw: input.barcode,
    barcodeBase: barcodeBase(input.barcode),
    filingName,
    spuKey: spuKey(filingName),
    filingNo: input.payload.filingNo.value,
    skuName: input.payload.skuName.value ?? input.barcode,
    netContent: input.payload.netContent.value,
    casePack: input.payload.casePack.value,
    outerSize: input.payload.outerSize.value,
    productLine: null,
    fieldSources: {},
    importBatchId: input.batchId,
    rowNo: null,
    editedBy: null,
    editedAt: null,
  };
}

async function saveContact({ ctx, productId, payload }: { readonly ctx: CommitContext; readonly productId: ProductId; readonly payload: ProductArchivePayload }): Promise<void> {
  const name = payload.contactNameRaw.value;
  if (name === null) return;
  await ctx.tx.productContacts.replaceRole({ productId, role: 'product_info', people: [{
    productId,
    role: 'product_info',
    userId: null,
    nameRaw: name,
    note: null,
    source: 'import',
    updatedBy: ctx.batch.createdBy,
    updatedAt: ctx.at,
  }] });
}
