import { barcodeBase, entityId, productId, productImageId, spuKey, type EntityId, type Product, type ProductContact, type ProductImage } from '@sw/domain';
import { archiveFields, productContactDisplay, type ArchiveField, type ArchiveRow, type MaterialRow, type ParsedProductWorkbook, type ProductWorkbookStores, type WorkbookChange, type WorkbookIssue, type WorkbookProduct, type WorkbookTarget } from './model.js';
import { materialChanges } from './materials.js';

export type WorkbookScope = { readonly kind: 'catalog' } | { readonly kind: 'product'; readonly productId: Product['id']; readonly barcode: string };
export type WorkbookStamp = { readonly id: EntityId; readonly actorId: EntityId; readonly at: string; readonly scope: WorkbookScope };
type Candidate = { readonly archive: ArchiveRow | undefined; readonly materials: readonly MaterialRow[]; readonly barcode: string };
type Plan = ReturnType<typeof materialChanges> & {
  readonly view: WorkbookProduct;
  readonly id: Product['id'];
  readonly product: Product | undefined;
  readonly contact: ProductContact | undefined;
  readonly images: readonly ProductImage[];
  readonly comparison: unknown;
};

export function workbookBarcodes(workbook: ParsedProductWorkbook): string[] {
  return [...new Set([...workbook.products.map((row) => row.barcode), ...workbook.materials.map((row) => row.barcode)])].sort();
}

export async function planProductWorkbook(tx: ProductWorkbookStores, { workbook, stamp }: { readonly workbook: ParsedProductWorkbook; readonly stamp: WorkbookStamp }) {
  const issues = [...workbook.issues];
  const { scope } = stamp;
  if (scope.kind === 'product') issues.push(...outOfScopeRows(workbook, scope.barcode));
  const archives = new Map(workbook.products.map((row) => [row.barcode, row]));
  const materials = new Map<string, MaterialRow[]>();
  for (const row of workbook.materials) {
    const group = materials.get(row.barcode) ?? [];
    group.push(row);
    materials.set(row.barcode, group);
  }
  const plans: Plan[] = [];
  for (const barcode of workbookBarcodes(workbook)) {
    if (scope.kind === 'product' && barcode !== scope.barcode) continue;
    const candidate = { barcode, archive: archives.get(barcode), materials: materials.get(barcode) ?? [] };
    const target = await tx.productWorkbooks.target(barcode);
    const issue = targetIssue({ candidate, scope, product: target.product });
    if (issue !== undefined) {
      issues.push(issue);
      continue;
    }
    const plan = planCandidate({ candidate, target, issues, stamp });
    if (plan !== undefined) plans.push(plan);
  }
  const comparison = JSON.stringify(plans.map((plan) => plan.comparison));
  return { issues, plans, comparison };
}

function outOfScopeRows(workbook: ParsedProductWorkbook, expected: string): WorkbookIssue[] {
  const rows = workbook.barcodeRows ?? [
    ...workbook.products.map(({ barcode, row }) => ({ sheet: '产品档案', row, barcode })),
    ...workbook.materials.map(({ barcode, row }) => ({ sheet: '组成物料', row, barcode })),
  ];
  return rows.filter(({ barcode }) => barcode !== expected).map(({ sheet, row, barcode }) => ({
    sheet, row, field: '产品条码', message: `这一行的完整条码是 ${barcode}，此处只接受 ${expected}。`,
  }));
}

function planCandidate({ candidate, target, issues, stamp }: { readonly candidate: Candidate; readonly target: WorkbookTarget; readonly issues: WorkbookIssue[]; readonly stamp: WorkbookStamp }): Plan | undefined {
  const { archive, barcode } = candidate;
  const current = target.product;
  const name = archive?.fields.skuName ?? current?.skuName;
  if (name === undefined) {
    issues.push(missingProduct(candidate));
    return undefined;
  }
  const id = current?.id ?? productId(`${stamp.id}:product:${barcode}`);
  const changes: WorkbookChange[] = [];
  const product = productChanges({ current, id, barcode, archive, name, changes, stamp });
  const contacts = target.contacts.filter((person) => person.role === 'product_info');
  const contact = contactChange({ id, contacts, currentNames: target.contactNames, name: archive?.contact, changes, stamp });
  const images = imageChanges({ id, archive, target, changes, stamp });
  const { parts, owners } = materialChanges({ materials: candidate.materials, target, changes, issues, batchId: stamp.id, name });
  const view = { id: current?.id ?? null, barcode, name, changes };
  return { view, id, product, contact, images, parts, owners, comparison: comparisonOf({ view, contact, contacts, images }) };
}

function targetIssue({ candidate, scope, product }: {
  readonly candidate: Candidate;
  readonly scope: WorkbookScope;
  readonly product: Product | undefined;
}): WorkbookIssue | undefined {
  if (scope.kind === 'catalog') {
    return product === undefined ? undefined : barcodeIssue(candidate, `完整条码 ${candidate.barcode} 已存在。请从对应商品详情选择「更新此产品」。`);
  }
  return product?.id === scope.productId ? undefined : barcodeIssue(candidate, '此条码对应的产品已变更，请从对应商品详情重新上传。');
}

function barcodeIssue({ archive, materials }: Candidate, message: string): WorkbookIssue {
  return {
    sheet: archive === undefined ? '组成物料' : '产品档案',
    row: archive?.row ?? materials[0]?.row ?? null,
    field: '产品条码',
    message,
  };
}

function missingProduct({ archive, materials }: Candidate): WorkbookIssue {
  return archive === undefined
    ? { sheet: '组成物料', row: materials[0]?.row ?? null, field: '产品条码', message: '此完整条码未建档，请先在「产品档案」填写对应的产品和 SKU 名称' }
    : { sheet: '产品档案', row: archive.row, field: 'SKU名称', message: '新增商品需要填写 SKU 名称' };
}

function comparisonOf({ view, contact, contacts, images }: { readonly view: WorkbookProduct; readonly contact: ProductContact | undefined; readonly contacts: readonly ProductContact[]; readonly images: readonly ProductImage[] }) {
  return {
    view,
    contact: contact === undefined ? undefined : contacts.map(({ nameRaw, userId, note, source, updatedBy, updatedAt }) =>
      JSON.stringify([nameRaw, userId, note, source, updatedBy, updatedAt])).sort(),
    hiddenImages: images.filter(({ hiddenAt }) => hiddenAt !== null).map(({ id, fileId }) => [id, fileId]),
  };
}

function productChanges({ current, id, barcode, archive, name, changes, stamp }: { readonly current: Product | undefined; readonly id: Product['id']; readonly barcode: string; readonly archive: ArchiveRow | undefined; readonly name: string; readonly changes: WorkbookChange[]; readonly stamp: WorkbookStamp }): Product | undefined {
  if (archive === undefined) return undefined;
  const fields = changedFields({ current, archive, changes });
  if (current !== undefined && Object.keys(fields).length === 0) return undefined;
  const initial: Product = current ?? {
    id, barcodeRaw: barcode, barcodeBase: barcodeBase(barcode), skuName: name, createdAt: stamp.at, updatedAt: stamp.at,
    filingName: null, filingNo: null, spuKey: null, netContent: null, casePack: null, outerSize: null,
    productLine: null, fieldSources: {}, importBatchId: null, rowNo: null, editedBy: null, editedAt: null,
  };
  const next = { ...initial, ...fields, updatedAt: stamp.at };
  const fieldSources = { ...initial.fieldSources };
  const workbookFieldSources = { ...initial.workbookFieldSources };
  const source = { kind: 'product_workbook' as const, receiptId: stamp.id, rowNo: archive.row, at: stamp.at,
    anchorProductId: stamp.scope.kind === 'product' ? stamp.scope.productId : null };
  for (const field of Object.keys(fields)) {
    fieldSources[field] = 'import';
    workbookFieldSources[field] = source;
  }
  return { ...next, spuKey: spuKey(next.filingName), fieldSources, workbookFieldSources };
}

function changedFields({ current, archive, changes }: { readonly current: Product | undefined; readonly archive: ArchiveRow; readonly changes: WorkbookChange[] }) {
  const changed: Partial<Record<ArchiveField, string>> = {};
  for (const key in archiveFields) {
    if (!isArchiveField(key)) continue;
    const field = key;
    const after = archive.fields[field];
    const before = current?.[field] ?? null;
    if (after === undefined || after === before) continue;
    changed[field] = after;
    changes.push({ section: 'product', label: archiveFields[field], before, after });
  }
  return changed;
}

function isArchiveField(key: string): key is ArchiveField {
  return Object.hasOwn(archiveFields, key);
}

function contactChange({ id, contacts, currentNames, name, changes, stamp }: { readonly id: Product['id']; readonly contacts: readonly ProductContact[]; readonly currentNames: WorkbookTarget['contactNames']; readonly name: string | null | undefined; readonly changes: WorkbookChange[]; readonly stamp: WorkbookStamp }): ProductContact | undefined {
  if (name === null || name === undefined) return undefined;
  const before = productContactDisplay(contacts, new Map(Object.entries(currentNames)));
  if (before === name) return undefined;
  changes.push({ section: 'product', label: '项目推荐人', before, after: name });
  return { productId: id, role: 'product_info', source: 'import', nameRaw: name, userId: null, note: null, updatedBy: stamp.actorId, updatedAt: stamp.at };
}

const IMAGE_LABELS = { inner: '内包装图片', outer: '外包装图片' };

function imageChanges({ id, archive, target, changes, stamp }: { readonly id: Product['id']; readonly archive: ArchiveRow | undefined; readonly target: WorkbookTarget; readonly changes: WorkbookChange[]; readonly stamp: WorkbookStamp }): ProductImage[] {
  if (archive === undefined) return [];
  const existing = [...target.images].sort((first, second) => first.order - second.order || first.id.localeCompare(second.id));
  const writes = changedImages({ existing, archive, changes, stamp });
  const order = {
    inner: nextOrder(existing, 'inner'),
    outer: nextOrder(existing, 'outer'),
  };
  for (const incoming of archive.images) {
    const { slot, sha256 } = incoming;
    if (existing.some((image) => image.slot === slot && image.fileId === sha256)) continue;
    writes.push({
      id: productImageId({ productId: id, sha256, slot }),
      productId: id, slot, fileId: entityId(sha256), order: order[slot], source: 'import',
      importBatchId: stamp.id, uploadedBy: null, hiddenAt: null, hiddenBy: null, hiddenReason: null,
    });
    order[slot] += 1;
    changes.push({ section: 'image', label: IMAGE_LABELS[slot], before: null, after: '新增图片', afterImageUrl: imageUrl(stamp, sha256) });
  }
  return writes;
}

function changedImages({ existing, archive, changes, stamp }: { readonly existing: readonly ProductImage[]; readonly archive: ArchiveRow; readonly changes: WorkbookChange[]; readonly stamp: WorkbookStamp }): ProductImage[] {
  const writes: ProductImage[] = [];
  for (const image of existing) {
    const operation = archive.imageOperations[image.slot];
    if (operation === undefined) continue;
    const label = IMAGE_LABELS[image.slot];
    const url = imageUrl(stamp, image.fileId);
    const isIncluded = archive.images.some(({ slot, sha256 }) => slot === image.slot && sha256 === image.fileId);
    if (operation === 'replace' && isIncluded) {
      if (!shouldRestore(image, [...existing, ...writes])) continue;
      writes.push({ ...image, hiddenAt: null, hiddenBy: null, hiddenReason: null });
      changes.push({ section: 'image', label, before: '隐藏', after: '恢复图片', afterImageUrl: url });
    } else if (image.hiddenAt === null) {
      writes.push({ ...image, hiddenAt: stamp.at, hiddenBy: stamp.actorId, hiddenReason: operation === 'hide' ? 'Excel 导入明确隐藏' : 'Excel 导入替换' });
      changes.push({ section: 'image', label, before: '可见图片', after: '隐藏', beforeImageUrl: url });
    }
  }
  return writes;
}

function shouldRestore(image: ProductImage, images: readonly ProductImage[]): boolean {
  return image.hiddenAt !== null && !images.some((other) => other.slot === image.slot && other.fileId === image.fileId && other.hiddenAt === null);
}

function nextOrder(images: readonly ProductImage[], slot: ProductImage['slot']): number {
  return images.filter((image) => image.slot === slot).reduce((max, image) => Math.max(max, image.order + 1), 0);
}

function imageUrl({ scope, id }: WorkbookStamp, sha256: string): string {
  const prefix = scope.kind === 'catalog' ? '/api/v1/products' : `/api/v1/products/${encodeURIComponent(scope.productId)}`;
  return `${prefix}/workbook-imports/${encodeURIComponent(id)}/images/${encodeURIComponent(sha256)}`;
}
