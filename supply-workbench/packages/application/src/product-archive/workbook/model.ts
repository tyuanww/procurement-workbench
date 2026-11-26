import type { BomLine, EntityId, ImageSlot, Product, ProductContact, ProductId, ProductImage } from '@sw/domain';
import type { ProductArchiveOwnerRepository } from '../boundary.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';

export const archiveFields = {
  filingName: '备案名称',
  filingNo: '备案号',
  skuName: 'SKU名称',
  netContent: '净含量',
  casePack: '箱规',
  outerSize: '外包装尺寸（长*宽*高）（单位：mm）',
  productLine: '产品线',
} as const;

export type ArchiveField = keyof typeof archiveFields;
export type WorkbookIssue = { readonly sheet: string; readonly row: number | null; readonly field: string | null; readonly message: string };
export type WorkbookChange = {
  readonly section: 'product' | 'image' | 'bom';
  readonly label: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly beforeImageUrl?: string;
  readonly afterImageUrl?: string;
};
export type WorkbookProduct = {
  readonly id: string | null;
  readonly barcode: string;
  readonly name: string;
  readonly changes: readonly WorkbookChange[];
};
export type ProductWorkbookPreview = {
  readonly id: string;
  readonly fileName: string;
  readonly status: 'ready' | 'blocked' | 'unchanged' | 'committed' | 'stale';
  readonly products: readonly WorkbookProduct[];
  readonly issues: readonly WorkbookIssue[];
};

export type ArchiveRow = {
  readonly row: number;
  readonly barcode: string;
  readonly fields: Readonly<Partial<Record<ArchiveField, string>>>;
  readonly contact: string | null;
  readonly imageOperations: Readonly<Partial<Record<ImageSlot, 'hide' | 'replace'>>>;
  readonly images: readonly { readonly slot: ImageSlot; readonly sha256: string }[];
};
export type MaterialRow = {
  readonly row: number;
  readonly barcode: string;
  readonly partCode: string;
} & ({
  readonly operation: 'remove';
} | {
  readonly operation: 'upsert';
  readonly productName: string | null;
  readonly partName: string | null;
  readonly reorderCount: number | null;
  readonly cumulativeQty: number | null;
  readonly mergedFill: boolean;
  readonly owner: string | null;
});
export type WorkbookBarcodeRow = { readonly sheet: string; readonly row: number; readonly barcode: string };
export type ParsedProductWorkbook = {
  readonly products: readonly ArchiveRow[];
  readonly materials: readonly MaterialRow[];
  readonly issues: readonly WorkbookIssue[];
  readonly barcodeRows?: readonly WorkbookBarcodeRow[];
};

export type WorkbookSession = {
  readonly anchorId: ProductId | null;
  readonly createdBy: EntityId;
  readonly fileHash: string;
  readonly workbook: ParsedProductWorkbook;
  readonly preview: ProductWorkbookPreview;
  readonly comparison: string;
};

export type WorkbookTarget = {
  readonly product: Product | undefined;
  readonly images: readonly ProductImage[];
  readonly contacts: readonly ProductContact[];
  readonly contactNames: Readonly<Record<string, string>>;
  readonly parts: readonly BomLine[];
  readonly owners: ReadonlyMap<string, string>;
};

export interface ProductWorkbookRepository {
  lockUpload(input: { readonly anchorId: ProductId | null; readonly actorId: EntityId; readonly fileHash: string }): Promise<void>;
  lockProducts(barcodes: readonly string[]): Promise<void>;
  find(input: { readonly id: string; readonly anchorId: ProductId | null; readonly actorId: EntityId; readonly lock: boolean }): Promise<WorkbookSession | undefined>;
  lastUpload(input: { readonly anchorId: ProductId | null; readonly actorId: EntityId; readonly fileHash: string }): Promise<WorkbookSession | undefined>;
  save(session: WorkbookSession): Promise<void>;
  target(barcode: string): Promise<WorkbookTarget>;
}

export type ProductWorkbookStores = UnitOfWorkStores & {
  readonly productOwners: ProductArchiveOwnerRepository;
  readonly productWorkbooks: ProductWorkbookRepository;
};

export function productContactDisplay(contacts: readonly { readonly userId: string | null; readonly nameRaw: string | null }[], userNames: ReadonlyMap<string, string>): string | null {
  const names = new Set(contacts.flatMap(({ userId, nameRaw }) => {
    const name = (userId === null ? nameRaw : userNames.get(userId) ?? nameRaw)?.trim();
    return name ? [name] : [];
  }));
  return [...names].sort((left, right) => left.localeCompare(right, 'zh-CN')).join('、') || null;
}
