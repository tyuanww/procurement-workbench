import { isNotProvided, normalizeText, procurementOaReferences } from '@sw/domain';
import type { ProcurementPreview } from '../../../../application/src/ports/parsed-rows.js';
import type { ProcurementProjectDate } from '../../../../application/src/ports/procurement-preview.js';
import type { CellLike, SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import { parseDate, type DateParseOptions } from '../../normalize/date.js';
import { parseQty } from '../../normalize/qty.js';
import { compactHeader } from './columns.js';

type ComponentFact = ProcurementPreview['componentFacts'][number];
type CellSource = NonNullable<ComponentFact['oa']['source']>;
type Worksheet = {
  readonly sheet: SheetLike;
  readonly headerRow: number;
  readonly columns: ReadonlyMap<string, number>;
  readonly mergeAnchors: ReadonlyMap<string, SheetLike['merges'][number]>;
};
type Slot = { readonly worksheet: Worksheet; readonly rowNo: number };

const HEADER_ROWS = 5;
const HEADER_COLUMNS = 40;
const OA_HEADER = 'oa需求流程编号';
const PRODUCT_CODE_HEADER = '产品69码';
const COMPONENT_CODE_HEADER = '子部件代码';
const COMPONENT_NAME_HEADER = '需采购子件名称';
const COUNT_WITH_UNIT = /^(-?[0-9０-９,，]+(?:[.．][0-9０-９]+)?\s*(?:万|[wW])?)\s*(个|件|套|片|张|支|盒|瓶|袋|箱|卷|只|枚|颗|条|包|千克|公斤|克|毫升|升|吨|kg|g|ml|l|t)$/iu;

export function readComponentSheets(sheets: readonly SheetLike[]): ComponentFact[] | undefined {
  const sources = sheets.filter((sheet) => sheetStatus(sheet) !== undefined);
  if (sources.length === 0) return undefined;
  return sources.flatMap((sheet) => readSheet(sheet));
}

const PROJECT_DATE_HEADERS: readonly (readonly [ProcurementProjectDate['field'], readonly string[]])[] = [
  ['releasedOn', ['需求下发时间', '需求下发日期']],
  ['projectOrderedOn', ['下单日期', '下单时间', '采购下单日期', '采购下单时间']],
  ['projectTargetOn', ['需求交付日期', '需求交付时间']],
];

type DateGroup = {
  readonly product: string;
  readonly refs: ReturnType<typeof procurementOaReferences>;
  readonly dates: readonly ProcurementProjectDate[];
};

export function readProjectDateGroups(sheets: readonly SheetLike[], options: DateParseOptions): DateGroup[] {
  return sheets.flatMap((sheet) => {
    if (sheetStatus(sheet) === undefined) return [];
    const worksheet = locateColumns(sheet);
    if (worksheet === undefined) return [];
    const groups: DateGroup[] = [];
    for (let rowNo = worksheet.headerRow + 1; rowNo <= sheet.rowCount; rowNo += 1) {
      const slot = { worksheet, rowNo };
      const product = textAt(slot, PRODUCT_CODE_HEADER);
      const refs = procurementOaReferences(textAt(slot, OA_HEADER));
      if (product === null || refs.length === 0) continue;
      const dates = projectDatesAt(slot, options);
      if (dates.length > 0) groups.push({ product, refs, dates });
    }
    return groups;
  });
}

function projectDatesAt(slot: Slot, options: DateParseOptions): ProcurementProjectDate[] {
  return PROJECT_DATE_HEADERS.flatMap(([field, names]) => {
    for (const name of names) {
      const located = locatedText(slot, name);
      const cell = cellAt(slot, name);
      if (located.source === null || located.raw === null || cell === null) continue;
      const parsed = parseDate(cell, options);
      return [{ field, source: located.source, raw: located.raw, value: parsed.value }];
    }
    return [];
  });
}

function sheetStatus(sheet: SheetLike): ComponentFact['status'] | undefined {
  const name = sheet.name.trim();
  if (name === '已完结订单情况') return 'completed';
  return name.endsWith('项目进度表') ? 'active' : undefined;
}

function readSheet(sheet: SheetLike): ComponentFact[] {
  const status = sheetStatus(sheet);
  const worksheet = locateColumns(sheet);
  if (worksheet === undefined || status === undefined) return [];
  const facts: ComponentFact[] = [];
  for (let rowNo = worksheet.headerRow + 1; rowNo <= sheet.rowCount; rowNo += 1) {
    const fact = readComponent({ worksheet, rowNo }, status);
    if (fact !== undefined) facts.push(fact);
  }
  return facts;
}

function locateColumns(sheet: SheetLike): Worksheet | undefined {
  for (let rowNo = 1; rowNo <= Math.min(HEADER_ROWS, sheet.rowCount); rowNo += 1) {
    const columns = new Map<string, number>();
    for (let column = 1; column <= HEADER_COLUMNS; column += 1) {
      const raw = sheet.cell(rowNo, column)?.text;
      if (raw !== undefined && raw !== '') columns.set(compactHeader(raw).toLowerCase(), column);
    }
    if ((columns.has(OA_HEADER) || columns.has(PRODUCT_CODE_HEADER)) && (columns.has(COMPONENT_CODE_HEADER) || columns.has(COMPONENT_NAME_HEADER))) {
      const mergeAnchors = new Map(sheet.merges.map((range) => [`${range.r1}:${range.c1}`, range]));
      return { sheet, headerRow: rowNo, columns, mergeAnchors };
    }
  }
  return undefined;
}

function readComponent(slot: Slot, status: ComponentFact['status']): ComponentFact | undefined {
  const componentCode = cellAt(slot, COMPONENT_CODE_HEADER);
  const componentName = cellAt(slot, COMPONENT_NAME_HEADER);
  const po = cellAt(slot, '采购订单po单号');
  if (![componentCode, componentName, po].some(ownsComponentValue)) return undefined;
  const componentCodeRaw = rawText(componentCode);
  const componentNameRaw = rawText(componentName);
  if (componentCodeRaw === COMPONENT_CODE_HEADER || componentNameRaw === COMPONENT_NAME_HEADER) return undefined;
  const oa = locatedText(slot, OA_HEADER);
  const buyer = cellAt(slot, '对应采购员');
  const buyerRaw = rawText(buyer);
  const buyerRichText = buyer?.richText ?? null;
  return {
    source: { sheetName: slot.worksheet.sheet.name, rowNo: slot.rowNo },
    status,
    oa: { ...oa, refs: procurementOaReferences(oa.raw) },
    productCodes: locatedText(slot, PRODUCT_CODE_HEADER),
    componentCodeRaw,
    componentNameRaw,
    poRaw: rawText(po),
    supplierRaw: textAt(slot, '供应商'),
    ...(buyerRaw === null && buyerRichText !== null ? { buyerRaw: buyerRichText, buyerFromRichText: true } : { buyerRaw }),
    deliveryProgressRaw: textAt(slot, '实际交付进度'),
    ...quantityAt(slot),
  };
}

function ownsComponentValue(cell: CellLike | null): boolean {
  return cell !== null && cell.mergedFrom === undefined && !isNotProvided(cell.text);
}

function quantityAt(slot: Slot): Pick<ComponentFact, 'quantity' | 'quantityRaw' | 'unitRaw' | 'quantityUnitConflict'> {
  const cell = cellAt(slot, '采购数量');
  const unitRaw = unitAt(slot);
  if (cell === null) return { quantityRaw: null, quantity: null, unitRaw };
  const quantityRaw = cell.text === '' ? null : cell.text;
  const inline = COUNT_WITH_UNIT.exec(cell.text.trim());
  const amount = inline?.[1];
  const inlineUnit = inline?.[2];
  if (amount === undefined || inlineUnit === undefined) return { quantityRaw, quantity: parseQty(cell).value, unitRaw };
  const columnUnit = unitRaw === null || isNotProvided(unitRaw) ? null : unitRaw;
  const quantity = parseQty({ ...cell, kind: 'string', value: amount, text: amount }).value;
  return { quantityRaw, ...inlineQuantity({ quantity, inlineUnit, columnUnit }) };
}

function unitAt(slot: Slot): string | null {
  return textAt(slot, '采购数量单位') ?? textAt(slot, '采购单位') ?? textAt(slot, '单位');
}

function inlineQuantity({ quantity, inlineUnit, columnUnit }: { readonly quantity: number | null; readonly inlineUnit: string; readonly columnUnit: string | null }): Pick<ComponentFact, 'quantity' | 'unitRaw' | 'quantityUnitConflict'> {
  if (columnUnit !== null && normalizeText(columnUnit).toLowerCase() !== inlineUnit.toLowerCase()) {
    return { quantity: null, unitRaw: columnUnit, quantityUnitConflict: true };
  }
  return { quantity, unitRaw: columnUnit ?? inlineUnit };
}

function textAt(slot: Slot, name: string): string | null {
  return rawText(cellAt(slot, name));
}

function rawText(cell: CellLike | null): string | null {
  return cell === null || cell.text === '' ? null : cell.text;
}

function cellAt({ worksheet, rowNo }: Slot, name: string): CellLike | null {
  const column = worksheet.columns.get(name);
  if (column === undefined) return null;
  const cell = worksheet.sheet.cell(rowNo, column);
  return cell?.mergedFrom !== undefined && cell.mergedFrom.col !== column ? null : cell;
}

function locatedText(slot: Slot, name: string): { readonly raw: string | null; readonly source: CellSource | null } {
  const column = slot.worksheet.columns.get(name);
  if (column === undefined) return { raw: null, source: null };
  const cell = cellAt(slot, name);
  if (cell === null || cell.text === '') return { raw: null, source: null };
  const rowNo = cell.mergedFrom?.row ?? slot.rowNo;
  const range = slot.worksheet.mergeAnchors.get(`${rowNo}:${column}`);
  return {
    raw: cell.text,
    source: {
      sheetName: slot.worksheet.sheet.name,
      rowNo,
      column,
      range: range === undefined ? null : { startRow: range.r1, endRow: range.r2, startColumn: range.c1, endColumn: range.c2 },
    },
  };
}
