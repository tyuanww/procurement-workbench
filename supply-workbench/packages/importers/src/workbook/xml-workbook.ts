import { WorkbookUnreadableError } from '@sw/application/errors';
import type { WorkbookLike } from '../../../application/src/ports/workbook-reader.js';
import { buildSheet, cellKey, type CellDraft, type ImageAnchor, type MergeRange } from './sheet.js';
import { decodeXml, unzip, xmlText, type ZipFiles } from './zip-xml.js';

type SheetRef = { readonly name: string; readonly hidden: boolean; readonly path: string };

export function readXmlWorkbook(bytes: Uint8Array, fileName: string): WorkbookLike {
  const files = unzip(bytes);
  const workbook = xmlText(files, 'xl/workbook.xml');
  if (workbook === null) throw new WorkbookUnreadableError();
  const rels = xmlText(files, 'xl/_rels/workbook.xml.rels') ?? '';
  return {
    source: { kind: 'xlsx', fileName, ...coreTimes(files) },
    date1904: /date1904="(?:1|true)"/.test(workbook),
    sheets: sheetRefs(workbook, rels).map((sheet) => readSheet(files, sheet)),
  };
}

function coreTimes(files: ZipFiles): { readonly createdAt?: string; readonly modifiedAt?: string } {
  const core = xmlText(files, 'docProps/core.xml');
  if (core === null) return {};
  const createdAt = tag(core, 'dcterms:created');
  const modifiedAt = tag(core, 'dcterms:modified');
  return {
    ...(createdAt === null ? {} : { createdAt }),
    ...(modifiedAt === null ? {} : { modifiedAt }),
  };
}

function sheetRefs(workbook: string, rels: string): SheetRef[] {
  const targets = relationshipTargets(rels);
  return [...workbook.matchAll(/<sheet\b([^>]*)\/>/g)].map((match) => {
    const attrs = match[1] ?? '';
    const id = attr(attrs, 'r:id');
    return { name: decodeXml(attr(attrs, 'name')), hidden: /state="hidden"/.test(attrs), path: resolvePath('xl/workbook.xml', targets.get(id) ?? '') };
  });
}

function readSheet(files: ZipFiles, sheet: SheetRef) {
  const xml = xmlText(files, sheet.path) ?? '';
  const strings = sharedStrings(files);
  return buildSheet({
    name: sheet.name,
    hidden: sheet.hidden,
    cells: cellsOf(xml, strings),
    merges: mergesOf(xml),
    images: imagesOf(files, sheet.path),
  });
}

function sharedStrings(files: ZipFiles): string[] {
  const xml = xmlText(files, 'xl/sharedStrings.xml');
  if (xml === null) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const body = match[1] ?? '';
    return [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1] ?? '')).join('');
  });
}

function cellsOf(xml: string, strings: readonly string[]): Map<string, CellDraft> {
  const cells = new Map<string, CellDraft>();
  for (const match of xml.matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = match[1] ?? match[2] ?? '';
    const ref = attr(attrs, 'r');
    const draft = cellDraft({ attrs, body: match[3] ?? '', strings });
    if (draft !== null && ref !== '') cells.set(cellKey(rowOf(ref), colOf(ref)), draft);
  }
  return cells;
}

function cellDraft({ attrs, body, strings }: { readonly attrs: string; readonly body: string; readonly strings: readonly string[] }): CellDraft | null {
  const formula = tag(body, 'f');
  const raw = tag(body, 'v') ?? inlineText(body);
  if (raw === null && formula === null) return null;
  const kind = kindOf(attr(attrs, 't'), raw);
  return {
    kind,
    value: valueOf({ kind, raw, strings }),
    text: textOf({ kind, raw, strings }),
    ...(formula === null ? {} : { formula }),
  };
}

function kindOf(type: string, raw: string | null): CellDraft['kind'] {
  if (raw === null) return 'empty';
  if (type === 's' || type === 'inlineStr' || type === 'str') return 'string';
  if (type === 'b') return 'bool';
  if (type === 'e') return 'error';
  return 'number';
}

function valueOf({ kind, raw, strings }: { readonly kind: CellDraft['kind']; readonly raw: string | null; readonly strings: readonly string[] }): CellDraft['value'] {
  if (raw === null || kind === 'empty') return null;
  if (kind === 'string') return strings[Number(raw)] ?? raw;
  if (kind === 'bool') return raw === '1';
  if (kind === 'error') return raw;
  return Number(raw);
}

function textOf({ kind, raw, strings }: { readonly kind: CellDraft['kind']; readonly raw: string | null; readonly strings: readonly string[] }): string {
  const value = valueOf({ kind, raw, strings });
  if (value === null) return '';
  if (kind === 'bool') return value === true ? 'TRUE' : 'FALSE';
  return String(value);
}

function mergesOf(xml: string): MergeRange[] {
  return [...xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map((match) => ({
    c1: colOf(match[1] ?? ''),
    r1: Number(match[2]),
    c2: colOf(match[3] ?? ''),
    r2: Number(match[4]),
  }));
}

function imagesOf(files: ZipFiles, sheetPath: string): ImageAnchor[] {
  const relPath = relsPath(sheetPath);
  const rels = xmlText(files, relPath);
  if (rels === null) return [];
  const drawing = [...relationshipTargets(rels).values()].find((target) => target.includes('drawing'));
  if (drawing === undefined) return [];
  const drawingPath = resolvePath(sheetPath, drawing);
  const drawingXml = xmlText(files, drawingPath);
  if (drawingXml === null) return [];
  const media = relationshipTargets(xmlText(files, relsPath(drawingPath)) ?? '');
  const anchors = drawingXml.matchAll(/<(?:[\w.-]+:)?(?:two|one)CellAnchor\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:two|one)CellAnchor>/g);
  return [...anchors].flatMap((anchor): ImageAnchor[] => {
    const body = anchor[1] ?? '';
    const embed = attr(body, '[\\w.-]+:embed');
    if (embed === '') return [];
    const target = media.get(embed);
    const from = tag(body, '(?:[\\w.-]+:)?from') ?? '';
    const row = Number(tag(from, '(?:[\\w.-]+:)?row') ?? '0') + 1;
    const col = Number(tag(from, '(?:[\\w.-]+:)?col') ?? '0') + 1;
    if (target === undefined) return [{ row, col, fileName: '', data: new Uint8Array(), unresolved: true }];
    const path = resolvePath(drawingPath, target);
    return [{ row, col, fileName: path.split('/').pop() ?? path, data: files.get(path) ?? new Uint8Array() }];
  });
}

function relationshipTargets(rels: string): Map<string, string> {
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)>/g)) {
    const attrs = match[1] ?? '';
    const id = attr(attrs, 'Id');
    const target = attr(attrs, 'Target');
    if (id !== '' && target !== '' && attr(attrs, 'TargetMode') !== 'External') targets.set(id, decodeXml(target));
  }
  return targets;
}

function relsPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return `${path.slice(0, slash)}/_rels/${path.slice(slash + 1)}.rels`;
}

function resolvePath(from: string, target: string): string {
  const base = target.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') base.pop();
    else if (part !== '.' && part !== '') base.push(part);
  }
  return base.join('/');
}

function inlineText(body: string): string | null {
  const inline = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
  if (inline === null) return null;
  return [...(inline[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1] ?? '')).join('');
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return match === null ? null : decodeXml(match[1] ?? '');
}

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? '';
}

function rowOf(ref: string): number {
  return Number(ref.replace(/[A-Z]/g, ''));
}

function colOf(ref: string): number {
  let col = 0;
  for (const ch of ref.replace(/\d/g, '')) col = col * 26 + ch.charCodeAt(0) - 64;
  return col;
}
