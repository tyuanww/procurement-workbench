import { entityId, mergeProductReimport, productImageId, type EntityId, type Product, type ProductId, type ProductImage, type ReimportContact, type ReimportImage } from '@sw/domain';
import type { ImportRow } from '@sw/domain';
import type { ProductArchivePayload } from '../../ports/parsed-rows.js';
import { mountsOf } from '../use-cases/archive-images.js';
import type { CommitContext } from './context.js';

export async function mergeExistingProduct(input: { readonly ctx: CommitContext; readonly row: ImportRow; readonly payload: ProductArchivePayload; readonly current: Product }): Promise<void> {
  const images = await input.ctx.tx.productImages.listByProduct(input.current.id);
  const contacts = await input.ctx.tx.productContacts.listByProduct(input.current.id);
  const incomingImages = imagesOf(input.ctx, input.row.rowNo);
  const plan = mergeProductReimport(
    { product: input.current, images: images.map(reimportImage), contacts: contacts.map(reimportContact) },
    { fields: fieldsOf(input.payload), images: incomingImages, contacts: contactOf(input.payload) },
  );
  await input.ctx.tx.products.save({ ...applied(input.current, plan.fields), updatedAt: input.ctx.at });
  await replaceImportImages({ ctx: input.ctx, productId: input.current.id, current: images, planned: plan.images });
  await replaceImportContacts({ ctx: input.ctx, productId: input.current.id, planned: plan.contacts });
  await input.ctx.tx.imports.saveRow({ ...input.row, action: 'update', targetId: input.current.id, issues: [...input.row.issues, ...plan.issues] });
}

export async function findCommittedProduct(ctx: CommitContext, barcode: string): Promise<Product | undefined> {
  for (const batch of await ctx.tx.imports.list()) {
    if (batch.id === ctx.batch.id || batch.template !== 'product-archive-v1' || batch.status !== 'committed') continue;
    const found = await productInBatch({ ctx, batchId: batch.id, barcode });
    if (found !== undefined) return found;
  }
  return undefined;
}

async function productInBatch({ ctx, batchId, barcode }: { readonly ctx: CommitContext; readonly batchId: string; readonly barcode: string }): Promise<Product | undefined> {
  for (const row of await ctx.tx.imports.listRows(batchId)) {
    if (row.targetId === null || barcodeOf(row.parsed) !== barcode) continue;
    const product = await ctx.tx.products.find(row.targetId);
    if (product !== undefined) return product;
  }
  return undefined;
}

async function replaceImportImages(input: { readonly ctx: CommitContext; readonly productId: ProductId; readonly current: readonly ProductImage[]; readonly planned: readonly ReimportImage[] }): Promise<void> {
  for (const image of input.current) {
    if (image.source !== 'import' || image.hiddenAt !== null) continue;
    if (input.planned.some((item) => item.sha256 === image.fileId && item.slot === image.slot)) continue;
    await input.ctx.tx.productImages.save({ ...image, hiddenAt: input.ctx.at, hiddenBy: input.ctx.batch.createdBy, hiddenReason: '再次导入替换' });
  }
  await savePlannedImages({ ctx: input.ctx, productId: input.productId, planned: input.planned });
}

async function savePlannedImages({ ctx, productId, planned }: { readonly ctx: CommitContext; readonly productId: ProductId; readonly planned: readonly ReimportImage[] }): Promise<void> {
  const order = { inner: 0, outer: 0 };
  for (const image of planned) {
    if (image.source !== 'import') continue;
    const slotOrder = order[image.slot];
    order[image.slot] = slotOrder + 1;
    await ctx.tx.productImages.save({
      id: productImageId({ productId, sha256: image.sha256, slot: image.slot }),
      productId,
      slot: image.slot,
      fileId: entityId(image.sha256),
      order: slotOrder,
      source: 'import',
      importBatchId: ctx.batch.id,
      uploadedBy: null,
      hiddenAt: image.hiddenAt,
      hiddenBy: null,
      hiddenReason: null,
    });
  }
}

async function replaceImportContacts({ ctx, productId, planned }: { readonly ctx: CommitContext; readonly productId: ProductId; readonly planned: readonly ReimportContact[] }): Promise<void> {
  const imported = planned.filter((contact) => contact.source === 'import' && contact.role === 'product_info');
  if (imported.length === 0) return;
  await ctx.tx.productContacts.replaceRole({ productId, role: 'product_info', people: imported.map((contact) => ({
    productId,
    role: 'product_info' as const,
    userId: contact.userId,
    nameRaw: contact.nameRaw,
    note: null,
    source: 'import' as const,
    updatedBy: ctx.batch.createdBy,
    updatedAt: ctx.at,
  })) });
}

function imagesOf(ctx: CommitContext, rowNo: number): ReimportImage[] {
  return mountsOf(ctx.batch.fileMeta).filter((mount) => mount.rowNo === rowNo).map((mount) => ({
    slot: mount.slot,
    sha256: mount.sha256,
    source: 'import' as const,
    hiddenAt: null,
  }));
}

function contactOf(payload: ProductArchivePayload): ReimportContact[] {
  const name = payload.contactNameRaw.value;
  if (name === null) return [];
  return [{ role: 'product_info', userId: null, nameRaw: name, source: 'import' }];
}

function fieldsOf(payload: ProductArchivePayload) {
  return {
    filingName: payload.filingName.value,
    filingNo: payload.filingNo.value,
    skuName: payload.skuName.value,
    netContent: payload.netContent.value,
    casePack: payload.casePack.value,
    outerSize: payload.outerSize.value,
  };
}

function applied(current: Product, fields: { readonly filingName?: string | null; readonly filingNo?: string | null; readonly skuName?: string | null; readonly netContent?: string | null; readonly casePack?: string | null; readonly outerSize?: string | null }): Product {
  return {
    ...current,
    workbookFieldSources: retainedWorkbookSources(current, fields),
    filingName: fields.filingName === undefined ? current.filingName : fields.filingName,
    filingNo: fields.filingNo === undefined ? current.filingNo : fields.filingNo,
    skuName: fields.skuName ?? current.skuName,
    netContent: fields.netContent === undefined ? current.netContent : fields.netContent,
    casePack: fields.casePack === undefined ? current.casePack : fields.casePack,
    outerSize: fields.outerSize === undefined ? current.outerSize : fields.outerSize,
  };
}

function retainedWorkbookSources(current: Product, fields: object): NonNullable<Product['workbookFieldSources']> {
  const retained = { ...current.workbookFieldSources };
  for (const field of Object.keys(fields)) delete retained[field];
  return retained;
}

function reimportImage(image: ProductImage): ReimportImage {
  return { slot: image.slot, sha256: image.fileId, source: image.source, hiddenAt: image.hiddenAt };
}

function reimportContact(contact: { readonly role: ReimportContact['role']; readonly userId: EntityId | null; readonly nameRaw: string | null; readonly source: ReimportContact['source'] }): ReimportContact {
  return { role: contact.role, userId: contact.userId, nameRaw: contact.nameRaw, source: contact.source };
}

function barcodeOf(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.barcodeRaw) || typeof value.barcodeRaw.value !== 'string') return null;
  return value.barcodeRaw.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
