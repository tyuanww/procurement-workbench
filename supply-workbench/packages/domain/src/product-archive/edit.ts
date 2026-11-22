import type { ImportIssue, Product, ProductContact } from '../entities/records.js';
import type { EntityId } from '../values/ids.js';
import { cellIssue } from '../identity/issue.js';
import type { ImageSlot, ImageSource } from '../vocabulary/index.js';

export const EDITABLE_PRODUCT_FIELDS = ['filingName', 'filingNo', 'skuName', 'netContent', 'casePack', 'outerSize', 'productLine'] as const;
export type EditableProductField = (typeof EDITABLE_PRODUCT_FIELDS)[number];
export type ProductPatch = Partial<Record<EditableProductField, string | null>>;

export function applyProductEdit({ current, patch, editor }: { readonly current: Product; readonly patch: ProductPatch; readonly editor: { readonly by: EntityId; readonly at: string } }): Product {
  const fieldSources = { ...current.fieldSources };
  let next = current;
  for (const field of EDITABLE_PRODUCT_FIELDS) {
    if (!Object.hasOwn(patch, field)) continue;
    const updated = written({ current: next, field, value: patch[field] });
    if (updated === next) continue;
    next = updated;
    fieldSources[field] = 'workbench';
  }
  return { ...next, fieldSources, editedBy: editor.by, editedAt: editor.at };
}

export type ReimportImage = {
  readonly slot: ImageSlot;
  readonly sha256: string;
  readonly source: ImageSource;
  readonly hiddenAt: string | null;
};

export type ReimportContact = Pick<ProductContact, 'role' | 'userId' | 'nameRaw' | 'source'>;

export type ReimportProduct = {
  readonly fields: ProductPatch;
  readonly images: readonly ReimportImage[];
  readonly contacts: readonly ReimportContact[];
};

export type ReimportPlan = {
  readonly fields: ProductPatch;
  readonly issues: readonly ImportIssue[];
  readonly images: readonly ReimportImage[];
  readonly contacts: readonly ReimportContact[];
};

export function mergeProductReimport(current: { readonly product: Product; readonly images: readonly ReimportImage[]; readonly contacts: readonly ReimportContact[] }, incoming: ReimportProduct): ReimportPlan {
  const fields: ProductPatch = {};
  const issues: ImportIssue[] = [];
  for (const field of EDITABLE_PRODUCT_FIELDS) keepOrReplace({ current: current.product, incoming: incoming.fields, field, fields, issues });
  return {
    fields,
    issues,
    images: mergeImages(current.images, incoming.images),
    contacts: mergeContacts(current.contacts, incoming.contacts),
  };
}

export function validateContacts(contact: { readonly userId: string | null; readonly nameRaw: string | null }): boolean {
  const name = contact.nameRaw?.trim() ?? '';
  return (contact.userId !== null && contact.userId !== '') || name !== '';
}

function written({ current, field, value }: { readonly current: Product; readonly field: EditableProductField; readonly value: string | null | undefined }): Product {
  if (value === undefined) return current;
  if (field === 'skuName') return value === null ? current : { ...current, skuName: value };
  return optionalField({ current, field, value });
}

function optionalField({ current, field, value }: { readonly current: Product; readonly field: Exclude<EditableProductField, 'skuName'>; readonly value: string | null }): Product {
  if (field === 'filingName') return { ...current, filingName: value };
  if (field === 'filingNo') return { ...current, filingNo: value };
  if (field === 'netContent') return { ...current, netContent: value };
  if (field === 'casePack') return { ...current, casePack: value };
  if (field === 'outerSize') return { ...current, outerSize: value };
  return { ...current, productLine: value };
}

function keepOrReplace(input: { readonly current: Product; readonly incoming: ProductPatch; readonly field: EditableProductField; readonly fields: ProductPatch; readonly issues: ImportIssue[] }): void {
  if (!Object.hasOwn(input.incoming, input.field)) return;
  if (input.current.fieldSources[input.field] === 'workbench') {
    input.issues.push(keptIssue({ field: input.field, current: input.current[input.field], incoming: input.incoming[input.field] }));
    return;
  }
  const value = input.incoming[input.field];
  if (value === undefined || (input.field === 'skuName' && value === null)) return;
  input.fields[input.field] = value;
}

function keptIssue({ field, current, incoming }: { readonly field: string; readonly current: string | null; readonly incoming: string | null | undefined }): ImportIssue {
  const issue = cellIssue({ code: 'PRODUCT_FIELD_KEPT', raw: incoming ?? null, column: field });
  return { ...issue, message: `${issue.message}；工作台「${show(current)}」，文件「${show(incoming)}」` };
}

function show(value: string | null | undefined): string {
  return value ?? '';
}

function mergeImages(current: readonly ReimportImage[], incoming: readonly ReimportImage[]): ReimportImage[] {
  const hidden = new Map(current.filter((image) => image.hiddenAt !== null).map((image) => [image.sha256, image.hiddenAt]));
  const uploads = current.filter((image) => image.source === 'upload');
  const imported = incoming.filter((image) => image.source === 'import').map((image) => hideAgain(image, hidden.get(image.sha256)));
  return [...uploads, ...imported];
}

function hideAgain(image: ReimportImage, hiddenAt: string | null | undefined): ReimportImage {
  if (hiddenAt === undefined) return image;
  return { ...image, hiddenAt };
}

function mergeContacts(current: readonly ReimportContact[], incoming: readonly ReimportContact[]): ReimportContact[] {
  const kept = current.filter((contact) => contact.source !== 'import' || contact.role !== 'product_info');
  return [...kept, ...incoming.filter((contact) => contact.source === 'import' && contact.role === 'product_info')];
}
