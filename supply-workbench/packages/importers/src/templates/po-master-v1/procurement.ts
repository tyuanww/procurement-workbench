import { isNotProvided, normalizeProcurementReference as normalizeReference, procurementOaReferences } from '@sw/domain';
import type { PoMasterParsed, ProcurementPreview } from '../../../../application/src/ports/parsed-rows.js';
import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ProcurementProjectDate } from '../../../../application/src/ports/procurement-preview.js';
import type { DateParseOptions } from '../../normalize/date.js';
import { readComponentSheets, readProjectDateGroups } from './procurement-sheets.js';

type FinishedRow = ProcurementPreview['finishedRows'][number];
type ComponentFact = ProcurementPreview['componentFacts'][number];
type Link = ProcurementPreview['links'][number];
type OaReference = FinishedRow['oaRefs'][number];
type FactScope = { readonly fact: ComponentFact; readonly isShared: boolean };

export function readProcurementPreview(input: { readonly sheets: readonly SheetLike[]; readonly rows: PoMasterParsed['rows'] }): ProcurementPreview | undefined {
  const componentFacts = readComponentSheets(input.sheets);
  if (componentFacts === undefined) return undefined;
  const finishedRows = input.rows.filter((row) => !row.issues.some((issue) => issue.code === 'ROW_NO_IDENTITY')).map(finishedRow);
  return { finishedRows, componentFacts, links: linkFacts(finishedRows, componentFacts) };
}

export function attachProjectDates(input: { readonly sheets: readonly SheetLike[]; readonly rows: PoMasterParsed['rows']; readonly options: DateParseOptions }): PoMasterParsed['rows'] {
  if (!input.sheets.some((sheet) => sheet.name.trim().endsWith('项目进度表') || sheet.name.trim() === '已完结订单情况')) return input.rows;
  const finished = input.rows.filter((row) => row.skipReason === null).map(finishedRow);
  const byProduct = indexByProduct(finished);
  const byRow = new Map<number, Map<string, ProcurementProjectDate>>();
  for (const group of readProjectDateGroups(input.sheets, input.options)) {
    for (const row of projectDateRows({ group, byProduct })) {
      const dates = byRow.get(row.source.rowNo) ?? new Map<string, ProcurementProjectDate>();
      for (const date of group.dates) {
        const source = date.source;
        dates.set(JSON.stringify([date.field, source.sheetName, source.rowNo, source.column]), date);
      }
      byRow.set(row.source.rowNo, dates);
    }
  }
  return input.rows.map((row) => {
    const dates = byRow.get(row.rowNo);
    return dates === undefined ? row : { ...row, payload: { ...row.payload, projectDates: [...dates.values()] } };
  });
}

function projectDateRows({ group, byProduct }: {
  readonly group: { readonly product: string; readonly refs: readonly OaReference[] };
  readonly byProduct: ReadonlyMap<string, readonly FinishedRow[]>;
}): readonly FinishedRow[] {
  const products = group.refs.length === 1 ? productCodes(group.product) : [productCode(group.product)];
  return [...products].flatMap((code) => {
    const matching = (byProduct.get(code) ?? []).filter((row) => group.refs.some((ref) => row.oaRefs.some((candidate) => sameOaScope(ref, candidate))));
    const [row] = matching;
    return matching.length === 1 && row !== undefined ? [row] : [];
  });
}

function finishedRow({ sheetName, rowNo, payload }: PoMasterParsed['rows'][number]): FinishedRow {
  return {
    source: { sheetName, rowNo },
    oaRaw: payload.oaDemandRef.raw,
    oaRefs: procurementOaReferences(payload.oaDemandRef.raw),
    productCodeRaw: payload.barcodeRaw.raw,
    productNameRaw: payload.nameRaw.raw,
    poRaw: payload.po.raw,
    quantity: payload.qtyOrdered.value,
  };
}

function linkFacts(rows: readonly FinishedRow[], facts: readonly ComponentFact[]): Link[] {
  const byCode = indexByProduct(rows);
  const links: Link[] = [];
  for (const fact of facts) {
    const scope = { fact, isShared: hasSharedContext(fact) };
    const products = productsForFact(byCode, scope);
    const matches = matchReferences(products, scope);
    const { matched } = matches;
    const kind = matchKind(matched, scope.isShared);
    for (const row of matched) {
      links.push(link(row, { fact, kind }));
    }
    for (const row of products) {
      if (!matched.has(row) && (matches.ambiguous.has(row) || !matches.inScope.has(row))) links.push(link(row, { fact, kind: 'candidate' }));
    }
  }
  return links;
}

function matchKind(rows: ReadonlySet<FinishedRow>, isShared: boolean): Link['kind'] {
  if (rows.size === 1) return 'direct';
  return isShared || indexByProduct([...rows]).size === 1 ? 'shared' : 'group';
}

function matchReferences(products: readonly FinishedRow[], { fact, isShared }: FactScope) {
  const matched = new Set<FinishedRow>();
  const ambiguous = new Set<FinishedRow>();
  const inScope = new Set<FinishedRow>();
  for (const reference of fact.oa.refs) {
    const scoped = products.filter((row) => row.oaRefs.some((candidate) => sameOaScope(reference, candidate)));
    for (const row of scoped) inScope.add(row);
    const applicable = isShared ? scoped : narrowToPoProduct(scoped, fact.poRaw);
    for (const sameCode of indexByProduct(applicable).values()) {
      const eligible = narrowToOrderLine(sameCode, { poRaw: fact.poRaw, reference });
      const destination = eligible.length === 1 ? matched : ambiguous;
      eligible.forEach((row) => destination.add(row));
    }
  }
  return { matched, ambiguous, inScope };
}

function sameOaScope(a: OaReference, b: OaReference): boolean {
  if (a.main !== b.main) return false;
  const aKey = normalizeReference(a.raw);
  const bKey = normalizeReference(b.raw);
  return aKey === bKey || aKey.startsWith(`${bKey}-`) || bKey.startsWith(`${aKey}-`);
}

function hasSharedContext(fact: ComponentFact): boolean {
  const childName = normalizeReference(fact.componentNameRaw ?? '');
  return /(?:共用|通用|共款|共享|两款)/u.test(childName);
}

function narrowToNamedProduct(rows: readonly FinishedRow[], componentNameRaw: string | null): readonly FinishedRow[] {
  const childName = normalizeReference(componentNameRaw ?? '');
  const named = rows.filter((row) => namesProduct(childName, row.productNameRaw));
  const namedCodes = new Set(named.map((row) => productCode(row.productCodeRaw)));
  return namedCodes.size === 1 ? rows.filter((row) => namedCodes.has(productCode(row.productCodeRaw))) : rows;
}

function narrowToPoProduct(rows: readonly FinishedRow[], poRaw: string | null): readonly FinishedRow[] {
  if (new Set(rows.map((row) => productCode(row.productCodeRaw))).size <= 1) return rows;
  const samePo = rows.filter((row) => sameSinglePo(row.poRaw, poRaw));
  return samePo.length === 1 ? samePo : rows;
}

function namesProduct(childName: string, raw: string | null): boolean {
  const productName = normalizeReference(raw ?? '');
  return productName !== '' && (childName === productName || childName.startsWith(`${productName}-`));
}

function narrowToOrderLine(rows: readonly FinishedRow[], input: { readonly poRaw: string | null; readonly reference: OaReference }): readonly FinishedRow[] {
  if (rows.length <= 1) return rows;
  const exactOa = rows.filter((row) => row.oaRefs.some(({ raw }) => normalizeReference(raw) === normalizeReference(input.reference.raw)));
  const exactPo = rows.filter((row) => sameSinglePo(row.poRaw, input.poRaw));
  if (exactOa.length === 0) return exactPo.length === 0 ? rows : exactPo;
  if (exactPo.length === 0) return exactOa;
  const both = exactOa.filter((row) => exactPo.includes(row));
  return both.length === 0 ? rows : both;
}

function sameSinglePo(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const po = normalizeReference(a);
  return /^[A-Z0-9-]+$/u.test(po) && po === normalizeReference(b);
}

function indexByProduct(rows: readonly FinishedRow[]): Map<string, FinishedRow[]> {
  const indexed = new Map<string, FinishedRow[]>();
  for (const row of rows) {
    const code = productCode(row.productCodeRaw);
    if (code === '') continue;
    const group = indexed.get(code);
    if (group === undefined) indexed.set(code, [row]);
    else group.push(row);
  }
  return indexed;
}

function productCode(raw: string | null): string {
  return raw === null || isNotProvided(raw) ? '' : raw.normalize('NFKC').trim().toUpperCase();
}

function productCodes(raw: string | null): ReadonlySet<string> {
  return new Set((raw ?? '').split(/[\s,，;；、/]+/u).map(productCode));
}

function productsForFact(indexed: ReadonlyMap<string, readonly FinishedRow[]>, { fact, isShared }: FactScope): readonly FinishedRow[] {
  const tokens = productCodes(fact.productCodes.raw);
  const scoped = [...tokens].flatMap((code) => indexed.get(code) ?? []);
  return isShared ? scoped : narrowToNamedProduct(scoped, fact.componentNameRaw);
}

function link(row: FinishedRow, { fact, kind }: { readonly fact: ComponentFact; readonly kind: Link['kind'] }): Link {
  return { finishedRow: row.source, component: fact.source, kind };
}
