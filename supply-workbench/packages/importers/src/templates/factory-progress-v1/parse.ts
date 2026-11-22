import { cellIssue, DEFAULT_SETTINGS, type ImportIssue } from '@sw/domain';
import type { FactoryProgressParsed, ImportParseContext, PendingCodeLink } from '../../../../application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { applyDerivedZero } from './derived.js';
import { findSheet, groupSheets } from './detect.js';
import { stampFingerprints, type DraftRow } from './fingerprint.js';
import { parseCustomerSupplied, parseDemand, parseInTransit, parsePackagingCombo, parseSchedule, parseShipment, parseStock } from './parsers/index.js';
import { SHEETS, DEMAND_SHEET_NAME } from './spec/index.js';

export function parseFactoryProgress(book: WorkbookLike, ctx: ImportParseContext): FactoryProgressParsed {
  const groups = groupSheets(book);
  const fileIssues = groups.missingRequired.map((name) => cellIssue({ code: 'HEADER_NOT_FOUND', raw: name }));
  const range = ctx.dateSanityRange ?? DEFAULT_SETTINGS.dateSanityRange;
  const factoryName = ctx.factoryNameRaw ?? null;
  const required = readRequired({ book, range, factoryName, fileIssues });
  const schedule = readSheet({
    book,
    title: SHEETS.schedule.title,
    fileIssues,
    parse: (sheet) => parseSchedule({ sheet, date1904: book.date1904, dateSanityRange: range }),
  });
  const combo = readSheet({
    book,
    title: SHEETS.packagingCombo.title,
    fileIssues,
    parse: (sheet) => parsePackagingCombo({ sheet, date1904: book.date1904, dateSanityRange: range }),
  });
  const supplied = readSheet({
    book,
    title: SHEETS.customerSupplied.title,
    fileIssues,
    parse: (sheet) => parseCustomerSupplied({ sheet, date1904: book.date1904, dateSanityRange: range }),
  });
  const demand = readDemand({ book, dateSanityRange: range, fileIssues });
  return assembled({ groups, fileIssues, transit: required.transit, shipment: required.shipment, stock: required.stock, schedule, combo, supplied, demand });
}

function readRequired(input: { readonly book: WorkbookLike; readonly range: typeof DEFAULT_SETTINGS.dateSanityRange; readonly factoryName: string | null; readonly fileIssues: ImportIssue[] }) {
  return {
    transit: readSheet({ book: input.book, title: SHEETS.inTransit.title, fileIssues: input.fileIssues, parse: (sheet) => parseInTransit({ sheet, date1904: input.book.date1904, dateSanityRange: input.range, factoryName: input.factoryName }) }),
    shipment: readSheet({ book: input.book, title: SHEETS.shipment.title, fileIssues: input.fileIssues, parse: (sheet) => parseShipment({ sheet, date1904: input.book.date1904, dateSanityRange: input.range }) }),
    stock: readSheet({ book: input.book, title: SHEETS.stock.title, fileIssues: input.fileIssues, parse: (sheet) => parseStock({ sheet, date1904: input.book.date1904, dateSanityRange: input.range }) }),
  };
}
function assembled(input: {
  readonly groups: ReturnType<typeof groupSheets>;
  readonly fileIssues: ImportIssue[];
  readonly transit: ReturnType<typeof parseInTransit>;
  readonly shipment: ReturnType<typeof parseShipment>;
  readonly stock: ReturnType<typeof parseStock>;
  readonly schedule: ReturnType<typeof parseSchedule>;
  readonly combo: ReturnType<typeof parsePackagingCombo>;
  readonly supplied: ReturnType<typeof parseCustomerSupplied>;
  readonly demand: ReturnType<typeof readDemand>;
}): FactoryProgressParsed {
  return {
    template: 'factory-progress-v1',
    coverage: 'full_snapshot',
    candidateKeyVersion: 'factory-progress-v1',
    ignoredSheets: input.groups.ignored,
    fileIssues: input.fileIssues,
    codeLinks: [...input.transit.links, ...input.shipment.links, ...input.stock.links, ...input.demand.links],
    inTransit: stampFingerprints(applyDerivedZero({ rows: input.transit.rows, shipments: input.shipment.rows, stock: input.stock.rows })),
    shipments: stampFingerprints(input.shipment.rows),
    stock: stampFingerprints(input.stock.rows),
    schedule: stampFingerprints(input.schedule.rows),
    demand: stampFingerprints(input.demand.rows),
    packagingCombo: stampFingerprints(input.combo.rows),
    customerSupplied: stampFingerprints(input.supplied.rows),
  };
}

function readDemand({ book, dateSanityRange, fileIssues }: { readonly book: WorkbookLike; readonly dateSanityRange: typeof DEFAULT_SETTINGS.dateSanityRange; readonly fileIssues: ImportIssue[] }) {
  const rows: DraftRow<ReturnType<typeof parseDemand>['rows'][number]['payload']>[] = [];
  const links: PendingCodeLink[] = [];
  for (const sheet of book.sheets) {
    if (!DEMAND_SHEET_NAME.test(sheet.name.trim())) continue;
    const parsed = parseDemand({ sheet, date1904: book.date1904, dateSanityRange });
    if (parsed.missingHeader) fileIssues.push(cellIssue({ code: 'HEADER_NOT_FOUND', raw: sheet.name }));
    rows.push(...parsed.rows);
    links.push(...parsed.links);
  }
  return { rows, links };
}

function readSheet<T>(input: {
  readonly book: WorkbookLike;
  readonly title: string;
  readonly fileIssues: ImportIssue[];
  readonly parse: (sheet: NonNullable<ReturnType<typeof findSheet>>) => { readonly rows: DraftRow<T>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean };
}) {
  const sheet = findSheet(input.book, input.title);
  if (sheet === undefined) return { rows: [], links: [], missingHeader: false };
  const parsed = input.parse(sheet);
  if (parsed.missingHeader) input.fileIssues.push(cellIssue({ code: 'HEADER_NOT_FOUND', raw: input.title }));
  return parsed;
}
