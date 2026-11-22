import {
  PRODUCT_CONTACT_ROLES,
  barcodeBase,
  comparableBarcode,
  countOpenPurchaseLines,
  materialLinkCoverage,
  normalizeText,
  purchaseDistribution,
  resolveFactoryStock,
  sharedParts,
  spuKey,
  withValue,
  withoutValue,
  type MissingReason,
  type Product,
  type Provenance,
  type PurchaseScope,
} from '@sw/domain';
import type { ProductArchiveFacts, ProductListSource } from '../../ports/product-queries.js';
import type { ProductCard, ProductMaterials, ProductOverview, ProductStock } from '../views.js';

const STOCK_RULE = 'factory_stock';
const IN_PROGRESS = '进行中';

export function overviewOf(facts: ProductArchiveFacts): ProductOverview {
  const product = facts.product;
  const purchases = purchaseDistribution({ lines: facts.purchaseLines, product, scope: 'all_channels' });
  return {
    product: productFields(product),
    images: facts.images.map((image) => ({ id: image.id, slot: image.slot, fileId: image.fileId, source: image.source, hidden: image.hiddenAt !== null })),
    contacts: PRODUCT_CONTACT_ROLES.map((role) => ({ role, people: peopleOf(facts, role) })),
    cards: {
      purchases: { open: countOpenPurchaseLines({ lines: facts.purchaseLines, product, scope: 'all_channels' }), total: facts.purchaseLines.length, ...purchases },
      stock: stockCard(facts),
      materials: materialsCard(facts),
    },
    bomHeader: facts.bomHeader,
    handlingHints: facts.handlingHints,
  };
}

export function stockOf(facts: ProductArchiveFacts): ProductStock {
  const resolved = resolveFactoryStock({ barcodeRaw: facts.product.barcodeRaw, approvedLinks: facts.approvedLinks, stockRows: facts.stockRows });
  return {
    ownWarehouse: { value: null, reason: 'no_source' },
    factory: {
      rows: resolved.kind === 'linked' ? linkedViews(facts, resolved.rows.map((row) => row.codeNorm)) : [],
      total: resolved.kind === 'linked' ? stockTotal(resolved.total, facts.asOf) : null,
      viaCodeLinks: facts.codeLinkViews,
    },
  };
}

function linkedViews(facts: ProductArchiveFacts, codes: readonly string[]): ProductStock['factory']['rows'] {
  return facts.stockViews.filter((row) => {
    const code = stockCode(row.payload.itemCodeRaw.value);
    return code !== null && codes.includes(code);
  });
}

function stockCode(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeText(value);
  return normalized === '' ? null : normalized;
}

export function materialsOf(facts: ProductArchiveFacts): ProductMaterials {
  const coverage = materialLinkCoverage(facts.parts);
  if ('kind' in coverage) return { kind: 'no_bom' };
  return { coverage: { linked: coverage.linked, total: coverage.total }, parts: facts.materialParts };
}

export function cardOf(source: ProductListSource, asOf: string): ProductCard {
  const product = { barcodeRaw: source.barcodeRaw };
  const coverage = materialLinkCoverage(source.parts);
  return {
    id: source.id,
    skuName: source.skuName,
    filingName: source.filingName,
    barcodeRaw: source.barcodeRaw,
    isChannelVariant: comparableBarcode(source.barcodeRaw) !== barcodeBase(source.barcodeRaw),
    netContent: source.netContent,
    casePack: source.casePack,
    thumbnail: source.thumbnail,
    openPurchaseLines: {
      allChannels: countOpenPurchaseLines({ lines: source.lines, product, scope: 'all_channels' }),
      reportedInProgress: inProgress(source.lines, product),
    },
    factoryStock: stockFigure(source, asOf),
    bomPartCount: 'kind' in coverage ? null : coverage.total,
    materialLinkCoverage: 'kind' in coverage ? null : { linked: coverage.linked, total: coverage.total },
    contactsAssigned: source.contactsAssigned,
  };
}

export function groupOf(sources: readonly ProductListSource[]): { readonly spuKey: string | null; readonly filingName: string | null; readonly count: number }[] {
  const groups = new Map<string, { spuKey: string | null; filingName: string | null; count: number }>();
  for (const source of sources) addGroup(groups, source);
  return [...groups.values()];
}

export function purchasesOf(facts: ProductArchiveFacts, scope: PurchaseScope): { readonly byStage: ProductOverview['cards']['purchases']['byStage']; readonly byReportedStatus: ProductOverview['cards']['purchases']['byReportedStatus'] } {
  return purchaseDistribution({ lines: facts.purchaseLines, product: facts.product, scope });
}

function inProgress(lines: ProductListSource['lines'], product: { readonly barcodeRaw: string }): number {
  return lines.filter((line) => line.reportedStatus === IN_PROGRESS && countOpenPurchaseLines({ lines: [line], product, scope: 'all_channels' }) === 1).length;
}

function addGroup(groups: Map<string, { spuKey: string | null; filingName: string | null; count: number }>, source: ProductListSource): void {
  const key = spuKey(source.filingName);
  const id = key ?? '';
  const current = groups.get(id);
  if (current === undefined) {
    groups.set(id, { spuKey: key, filingName: key === null ? null : source.filingName, count: 1 });
    return;
  }
  groups.set(id, { ...current, count: current.count + 1 });
}

function stockCard(facts: ProductArchiveFacts): ProductOverview['cards']['stock'] {
  const resolved = resolveFactoryStock({ barcodeRaw: facts.product.barcodeRaw, approvedLinks: facts.approvedLinks, stockRows: facts.stockRows });
  if (resolved.kind === 'missing') return { kind: 'missing', reason: resolved.missing.reason, nextStep: resolved.nextStep };
  return { kind: 'linked', total: stockTotal(resolved.total, facts.asOf), rowCount: resolved.rows.length };
}

function materialsCard(facts: ProductArchiveFacts): ProductOverview['cards']['materials'] {
  const coverage = materialLinkCoverage(facts.parts);
  if ('kind' in coverage) return { kind: 'no_bom' };
  return { partCount: coverage.total, linked: coverage.linked, sharedPartCount: sharedParts(facts.bomUses).length };
}

function peopleOf(facts: ProductArchiveFacts, role: ProductArchiveFacts['contacts'][number]['role']): ProductOverview['contacts'][number]['people'] {
  return facts.contacts.filter((contact) => contact.role === role).map((contact) => ({
    userId: contact.userId,
    name: contact.nameRaw,
    source: contact.source,
    note: contact.note,
    updatedBy: contact.updatedBy,
    updatedAt: contact.updatedAt,
  }));
}

function productFields(product: Product): ProductOverview['product'] {
  return {
    id: product.id,
    barcodeRaw: product.barcodeRaw,
    barcodeBase: product.barcodeBase,
    filingName: textField({ product, field: 'filingName', value: product.filingName }),
    filingNo: textField({ product, field: 'filingNo', value: product.filingNo }),
    skuName: textField({ product, field: 'skuName', value: product.skuName }),
    netContent: textField({ product, field: 'netContent', value: product.netContent }),
    casePack: textField({ product, field: 'casePack', value: product.casePack }),
    outerSize: textField({ product, field: 'outerSize', value: product.outerSize }),
    productLine: textField({ product, field: 'productLine', value: product.productLine }),
    spuKey: spuKey(product.filingName),
  };
}

function textField({ product, field, value }: { readonly product: Product; readonly field: string; readonly value: string | null }): ProductOverview['product']['skuName'] {
  const provenance = provenanceOf(product, field);
  return value === null ? withoutValue({ reason: 'not_provided', provenance }) : withValue(value, provenance);
}

function provenanceOf(product: Product, field: string): Provenance {
  const at = product.editedAt ?? product.updatedAt;
  if (product.fieldSources[field] === 'workbench' && product.editedBy !== null) return { kind: 'manual', by: product.editedBy, at };
  if (product.importBatchId !== null && product.rowNo !== null) {
    return { kind: 'import', importBatchId: product.importBatchId, template: 'product-archive-v1', sheet: '', rowNo: product.rowNo, at };
  }
  return { kind: 'system', rule: 'product_field', at };
}

function stockFigure(source: ProductListSource, asOf: string): ProductCard['factoryStock'] {
  const resolved = resolveFactoryStock({ barcodeRaw: source.barcodeRaw, approvedLinks: source.approvedLinks, stockRows: source.stockRows });
  if (resolved.kind === 'missing') return missingStock(resolved.missing.reason, asOf);
  return stockTotal(resolved.total, asOf);
}

function stockTotal(total: number | null, asOf: string): ProductCard['factoryStock'] {
  if (total === null) return missingStock('no_matching_record', asOf);
  return withValue(total, { kind: 'system', rule: STOCK_RULE, at: asOf });
}

function missingStock(reason: MissingReason, asOf: string): ProductCard['factoryStock'] {
  return { value: null, missingReason: reason, provenance: { kind: 'system', rule: STOCK_RULE, at: asOf } };
}
