import { ISSUE_CODES, type IssueCode } from '@sw/domain';
import type { ImportExisting, ImportTemplate } from '../../../application/src/ports/import-template.js';
import type { WorkbookLike } from '../../../application/src/ports/workbook-reader.js';
import type { BomPayload, ParsedImport, ParsedRow, PoMasterPayload, ProductArchivePayload } from '../../../application/src/ports/parsed-rows.js';
import { expect, it } from 'vitest';

const parseContext = { uploadedAt: '2026-10-12T00:00:00.000Z', factoryPartyId: null };

export function describeImportTemplateContract(
  template: ImportTemplate,
  files: { readonly ownFile: WorkbookLike; readonly foreignFile: WorkbookLike },
): void {
  it('别的模板的文件识别分为 0', () => {
    expect(template.detect(files.foreignFile).score).toBe(0);
  });
  it('同一文件解析两次结果完全相同', () => {
    const first = template.parse(files.ownFile, parseContext);
    expect(template.parse(files.ownFile, parseContext)).toEqual(first);
  });
  it('问题码都在问题码目录里', () => {
    for (const code of issueCodes(template.parse(files.ownFile, parseContext))) {
      expect(ISSUE_CODES).toContain(code);
    }
  });
  it('用模板自己的身份做 existing 再 diff，已导入的行不变，跳过的行仍跳过', () => {
    const parsed = template.parse(files.ownFile, parseContext);
    const identities = template.identityOf(parsed);
    const existing = identities.length > 0 ? template.existingFrom(identities) : existingFromParsed(parsed);
    const actions = actionsOf(template.diff(parsed, existing));
    expect(actions.filter((action) => action !== 'skip').every((action) => action === 'unchanged')).toBe(true);
    expect(actions.includes('create')).toBe(false);
  });
}

/** 模板自己给内容指纹时用指纹；没有指纹的模板用位置键或业务键模拟已导入。 */
export function existingFromParsed(parsed: ParsedImport): ImportExisting {
  if (parsed.template === 'po-master-v1') {
    return { poMaster: parsed.rows.map(poIdentity), factoryFingerprints: [], products: [], bomKeys: [] };
  }
  if (parsed.template === 'product-archive-v1') {
    return { poMaster: [], factoryFingerprints: [], products: parsed.rows.map(productIdentity), bomKeys: [] };
  }
  if (parsed.template === 'bom-v1') {
    return { poMaster: [], factoryFingerprints: [], products: [], bomKeys: parsed.rows.map(bomIdentity) };
  }
  if (parsed.template === 'factory-progress-v1') {
    return { poMaster: [], factoryFingerprints: factoryIdentities(parsed), products: [], bomKeys: [] };
  }
  if (parsed.template === 'owner-map-v1') {
    return { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };
  }
  return { poMaster: [], factoryFingerprints: rowIdentities(parsed), products: [], bomKeys: [] };
}

function rowIdentities(parsed: { readonly rows: readonly { readonly sheetName: string; readonly rowNo: number }[] }): readonly string[] {
  return parsed.rows.map(identityOf);
}

function poIdentity(row: ParsedRow<PoMasterPayload>) {
  return { candidateKey: identityOf(row), values: row.payload };
}

function productIdentity(row: ParsedRow<ProductArchivePayload>) {
  return { barcodeRaw: row.payload.barcodeRaw.value ?? identityOf(row), keptFields: [] as const };
}

function bomIdentity(row: ParsedRow<BomPayload>) {
  return { productBarcodeRaw: row.payload.productBarcodeRaw, partCodeRaw: row.payload.partCodeRaw };
}

function factoryIdentities(parsed: Extract<ParsedImport, { template: 'factory-progress-v1' }>): readonly string[] {
  return [
    ...parsed.inTransit,
    ...parsed.shipments,
    ...parsed.stock,
    ...parsed.schedule,
    ...parsed.demand,
    ...parsed.packagingCombo,
    ...parsed.customerSupplied,
  ].map(identityOf);
}

function identityOf(row: { readonly sheetName: string; readonly rowNo: number }): string {
  return `${row.sheetName}:${row.rowNo}`;
}

function issueCodes(parsed: ParsedImport): readonly IssueCode[] {
  return rowsOf(parsed).flatMap((row) => row.issues.map((issue) => issue.code));
}

function actionsOf(parsed: ParsedImport): readonly (string | null)[] {
  return rowsOf(parsed).map((row) => row.action);
}

function rowsOf(parsed: ParsedImport): readonly { readonly issues: readonly { readonly code: IssueCode }[]; readonly action: string | null }[] {
  if (parsed.template !== 'factory-progress-v1') return parsed.rows;
  return [
    ...parsed.inTransit,
    ...parsed.shipments,
    ...parsed.stock,
    ...parsed.schedule,
    ...parsed.demand,
    ...parsed.packagingCombo,
    ...parsed.customerSupplied,
  ];
}
