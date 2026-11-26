import type { BomLine, EntityId } from '@sw/domain';
import type { MaterialRow, WorkbookChange, WorkbookIssue, WorkbookTarget } from './model.js';

type Removal = Extract<MaterialRow, { operation: 'remove' }>;
type Upsert = Extract<MaterialRow, { operation: 'upsert' }>;
type Owners = readonly { readonly partCodeRaw: string; readonly ownerName: string | null }[];

type MaterialScope = { readonly materials: readonly MaterialRow[]; readonly target: Pick<WorkbookTarget, 'owners' | 'parts'>; readonly changes: WorkbookChange[]; readonly issues: WorkbookIssue[]; readonly batchId: EntityId; readonly name: string };

export function materialChanges(scope: MaterialScope): { readonly parts: readonly BomLine[] | undefined; readonly owners: Owners } {
  if (scope.materials.length === 0) return { parts: undefined, owners: [] };
  const lines = [...scope.target.parts];
  const owners: Owners[number][] = [];
  for (const row of scope.materials) updatePart({ scope, lines, owners, row });
  const withHeader = replaceQuantities({ scope, lines });
  const isModified = withHeader.length !== scope.target.parts.length || withHeader.some((line, index) => line !== scope.target.parts[index]);
  return { parts: isModified ? withHeader : undefined, owners };
}

function updatePart({ scope, lines, owners, row }: { readonly scope: MaterialScope; readonly lines: BomLine[]; readonly owners: Owners[number][]; readonly row: MaterialRow }): void {
  const matches = lines.filter((part) => part.partCodeRaw === row.partCode);
  if (matches.length > 1) {
    scope.issues.push({ sheet: '组成物料', row: row.row, field: '子件条码', message: '现有档案中有重复的子件条码，请先整理 BOM 后重新预览' });
    return;
  }
  const [prior] = matches;
  const oldOwner = scope.target.owners.get(row.partCode) ?? null;
  if (row.operation === 'remove') {
    removePart({ row, prior, oldOwner, owners, scope, lines });
    return;
  }
  if (prior === undefined && row.partName === null) {
    scope.issues.push({ sheet: '组成物料', row: row.row, field: '子件名称', message: '新增组成物料需要填写子件名称' });
    return;
  }
  const next = upsertPart({ prior, row, scope });
  if (prior === undefined) {
    const rowNo = lines.reduce((max, line) => Math.max(max, line.rowNo + 1), row.row);
    lines.push({ ...next, rowNo });
  } else if (next !== prior) {
    lines[lines.indexOf(prior)] = next;
  }
  if (row.owner !== null && row.owner !== oldOwner) {
    owners.push({ partCodeRaw: row.partCode, ownerName: row.owner });
    materialChange(scope.changes, { label: `${row.partCode} · 负责人`, before: oldOwner, after: row.owner });
  }
}

function replaceQuantities({ scope, lines }: { readonly scope: MaterialScope; readonly lines: readonly BomLine[] }): readonly BomLine[] {
  const header = quantityChanges(scope);
  const previousHeader = scope.target.parts[0];
  if (lines.length === 0 && previousHeader !== undefined) {
    materialChange(scope.changes, { label: '成品翻单次数', before: previousHeader.reorderCount, after: null });
    materialChange(scope.changes, { label: '累计数量', before: previousHeader.cumulativeQty, after: null });
  }
  return lines.map((line, index) => applyQuantities(line, {
    quantities: header,
    previousHeader: index === 0 && previousHeader?.partCodeRaw !== line.partCodeRaw ? previousHeader : undefined,
  }));
}

function removePart({ row, prior, oldOwner, owners, scope, lines }: { readonly row: Removal; readonly prior: BomLine | undefined; readonly oldOwner: string | null; readonly owners: Owners[number][]; readonly scope: MaterialScope; readonly lines: BomLine[] }): void {
  if (prior === undefined) return;
  lines.splice(lines.indexOf(prior), 1);
  const removed = oldOwner === null ? prior.partName : `${prior.partName}（负责人 ${oldOwner}）`;
  materialChange(scope.changes, { label: `${row.partCode} · 删除子件`, before: removed, after: null });
  if (oldOwner !== null) owners.push({ partCodeRaw: row.partCode, ownerName: null });
}

function upsertPart({ prior, row, scope }: { readonly prior: BomLine | undefined; readonly row: Upsert; readonly scope: MaterialScope }): BomLine {
  const base = prior ?? newPart(row, scope);
  const partName = row.partName ?? base.partName;
  const productName = row.productName ?? base.productName;
  materialChange(scope.changes, { label: `${row.partCode} · 子件名称`, before: prior?.partName ?? null, after: partName });
  previewProductName({ row, prior, productName, changes: scope.changes });
  if (partName === base.partName && productName === base.productName) return base;
  return { ...base, partName, productName, importBatchId: scope.batchId };
}

function previewProductName({ row, prior, productName, changes }: { readonly row: Upsert; readonly prior: BomLine | undefined; readonly productName: string; readonly changes: WorkbookChange[] }): void {
  if (row.productName === null) return;
  materialChange(changes, { label: `${row.partCode} · 产品名称`, before: prior?.productName ?? null, after: productName });
}

function newPart(row: Upsert, { name, batchId }: MaterialScope): BomLine {
  return {
    partCodeRaw: row.partCode, partName: row.partName ?? '', productName: name, productBarcodeRaw: row.barcode,
    reorderCount: null, cumulativeQty: null, importBatchId: batchId, rowNo: row.row, mergedFill: row.mergedFill,
  };
}

type Quantities = Pick<BomLine, 'reorderCount' | 'cumulativeQty'>;

function quantityChanges(scope: MaterialScope): Quantities {
  return {
    reorderCount: quantityChange(scope, { field: 'reorderCount', label: '成品翻单次数' }),
    cumulativeQty: quantityChange(scope, { field: 'cumulativeQty', label: '累计数量' }),
  };
}

function quantityChange(scope: MaterialScope, { field, label }: { readonly field: keyof Quantities; readonly label: string }): number | null {
  const rows = scope.materials.filter((row): row is Upsert => row.operation === 'upsert' && row[field] !== null);
  const [first] = rows;
  if (first === undefined) return null;
  const value = first[field];
  for (const row of rows) {
    if (row[field] !== value) scope.issues.push({ sheet: '组成物料', row: row.row, field: label, message: '同一产品的数量有多个不同值，请填写一致的数值或仅填写一行' });
  }
  const previous = scope.target.parts[0]?.[field] ?? null;
  materialChange(scope.changes, { label, before: previous, after: value });
  return previous === value ? null : value;
}

function applyQuantities(line: BomLine, { quantities, previousHeader }: { readonly quantities: Quantities; readonly previousHeader: BomLine | undefined }): BomLine {
  const baseline = previousHeader ?? line;
  const reorderCount = quantities.reorderCount ?? baseline.reorderCount;
  const cumulativeQty = quantities.cumulativeQty ?? baseline.cumulativeQty;
  return reorderCount === line.reorderCount && cumulativeQty === line.cumulativeQty ? line : { ...line, reorderCount, cumulativeQty };
}

function materialChange(changes: WorkbookChange[], { label, before, after }: { readonly label: string; readonly before: string | number | null; readonly after: string | number | null }): void {
  if (before === after) return;
  changes.push({ section: 'bom', label, before: before === null ? null : String(before), after: after === null ? null : String(after) });
}
