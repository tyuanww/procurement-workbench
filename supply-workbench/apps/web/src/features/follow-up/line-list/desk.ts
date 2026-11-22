import { LINE_STAGES, lineStageLabel, type Lane, type LineStage } from '@sw/domain';
import { LaneSchema, LinesQuerySchema, LineStageSchema, type LinesQuery } from '@sw/contracts';
import { z } from 'zod';
import { columnsOf, type LineColumnView } from './columns.js';

const PAGE_CAP = 200;
const DEFAULT_LANE = 'finished';
const deskLaneSchema = z.union([LaneSchema, z.literal('all')]);
export const DEFAULT_PAGE_SIZE = 50;
const textField: z.ZodType<string> = z.string().min(1);
const overdueFlag = z.literal('1');
const overdueAlias = z.literal('true');
const pageField: z.ZodType<string> = z.string().regex(/^[1-9]\d*$/);
const sizeField: z.ZodType<number> = z.coerce.number().int().gte(1).lte(PAGE_CAP);

const OWNED_KEYS: ReadonlySet<string> = new Set([
  'lane',
  'q',
  'buyer',
  'supplierPartyId',
  'inTransitFactory',
  'stage',
  'stages',
  'overdue',
  'overdueOnly',
  'page',
  'pageSize',
]);

type SearchPair = {
  readonly key: string;
  readonly value: string;
};

type StageSlot =
  | { readonly kind: 'all' }
  | { readonly kind: 'one'; readonly stage: LineStage; readonly key: 'stage' | 'stages' }
  | { readonly kind: 'list'; readonly stages: readonly [LineStage, LineStage, ...LineStage[]] };

type DeskLane = Lane | 'all';

type DeskRecord = {
  readonly lane: DeskLane | undefined;
  readonly q: string | undefined;
  readonly buyer: string | undefined;
  readonly supplierPartyId: string | undefined;
  readonly inTransitFactory: LinesQuery['inTransitFactory'];
  readonly stage: StageSlot;
  readonly isOverdue: boolean;
  readonly pageToken: string | undefined;
  readonly pageSizeToken: string | undefined;
  readonly rest: readonly SearchPair[];
};

export type DeskChange =
  | { readonly kind: 'lane'; readonly value: unknown }
  | { readonly kind: 'text'; readonly value: unknown }
  | { readonly kind: 'stage'; readonly value: unknown }
  | { readonly kind: 'overdue'; readonly value: unknown }
  | { readonly kind: 'page'; readonly value: unknown }
  | { readonly kind: 'pageSize'; readonly value: unknown };

export type StageChoice = {
  readonly value: LineStage | '';
  readonly label: string;
};

// Joined stage names are the Select value. antd treats undefined as uncontrolled, and a real stage code would look selected.
export type StageControl =
  | { readonly kind: 'all'; readonly value: '' }
  | { readonly kind: 'one'; readonly value: LineStage }
  | { readonly kind: 'many'; readonly value: string };

export type DeskRead = {
  readonly lane: DeskLane;
  readonly q: string;
  readonly stage: StageControl;
  readonly isOverdue: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly columns: readonly LineColumnView[];
  readonly stageChoices: readonly StageChoice[];
  readonly requestQuery: string;
};

const STAGE_CHOICES: readonly StageChoice[] = [
  { value: '', label: '全部阶段' },
  ...LINE_STAGES.map((value) => ({ value, label: lineStageLabel(value) })),
];

export function readDesk(search: string): DeskRead {
  const record = parseDesk(search);
  const lane = record.lane ?? DEFAULT_LANE;
  return {
    lane,
    q: record.q ?? '',
    stage: stageControl(record.stage),
    isOverdue: record.isOverdue,
    page: pageNumber(record.pageToken),
    pageSize: pageSizeOf(record.pageSizeToken),
    columns: columnsOf(lane === 'all' ? DEFAULT_LANE : lane),
    stageChoices: STAGE_CHOICES,
    requestQuery: requestOf({ ...record, lane }),
  };
}

export function writeDesk(input: { readonly search: string; readonly change: DeskChange }): string {
  return addressOf(applyChange({ record: parseDesk(input.search), change: input.change }));
}

function parseDesk(search: string): DeskRecord {
  const params = deskAddress(search);
  return {
    lane: takeField({ raw: params.get('lane'), field: deskLaneSchema }),
    q: takeField({ raw: params.get('q'), field: textField }),
    buyer: takeField({ raw: params.get('buyer'), field: textField }),
    supplierPartyId: takeField({ raw: params.get('supplierPartyId'), field: textField }),
    inTransitFactory: takeField({ raw: params.get('inTransitFactory'), field: LinesQuerySchema.shape.inTransitFactory }),
    stage: stageSlot({ stages: stageTokens(params.get('stages')), single: params.get('stage') }),
    isOverdue: isOverdueAddress({ overdue: params.get('overdue'), overdueOnly: params.get('overdueOnly') }),
    pageToken: pageTokenOf(params.get('page')),
    pageSizeToken: takeRaw(params.get('pageSize')),
    rest: restPairs(params),
  };
}

export function deskAddress(search: string): URLSearchParams {
  const params = new URLSearchParams(search);
  if (params.get('view') === 'factory_a' && params.get('q') === '甲代工厂' && !params.has('inTransitFactory')) {
    params.delete('q');
    params.set('inTransitFactory', 'factory_a');
  }
  return params;
}

function restPairs(params: URLSearchParams): readonly SearchPair[] {
  const rest: SearchPair[] = [];
  for (const [key, value] of params) {
    if (OWNED_KEYS.has(key)) continue;
    rest.push({ key, value });
  }
  return rest;
}

function takeField<T>(input: { readonly raw: string | null; readonly field: z.ZodType<T> }): T | undefined {
  const parsed = input.field.safeParse(input.raw);
  if (!parsed.success) return undefined;
  return parsed.data;
}

function takeRaw(raw: string | null): string | undefined {
  if (raw === null || raw === '') return undefined;
  return raw;
}

function isOverdueAddress(input: { readonly overdue: string | null; readonly overdueOnly: string | null }): boolean {
  if (overdueFlag.safeParse(input.overdue).success) return true;
  return overdueAlias.safeParse(input.overdueOnly).success;
}

function stageTokens(raw: string | null): readonly LineStage[] {
  if (raw === null || raw === '') return [];
  return uniqueStages(raw.split(','));
}

function uniqueStages(tokens: readonly string[]): readonly LineStage[] {
  const found: LineStage[] = [];
  for (const token of tokens) {
    const parsed = LineStageSchema.safeParse(token.trim());
    if (!parsed.success) continue;
    if (found.includes(parsed.data)) continue;
    found.push(parsed.data);
  }
  return found;
}

function stageSlot(input: { readonly stages: readonly LineStage[]; readonly single: string | null }): StageSlot {
  const fromList = listSlot(input.stages);
  if (fromList !== undefined) return fromList;
  const single = takeField({ raw: input.single, field: LineStageSchema });
  if (single !== undefined) return { kind: 'one', stage: single, key: 'stage' };
  return { kind: 'all' };
}

function listSlot(stages: readonly LineStage[]): StageSlot | undefined {
  const first = stages[0];
  if (first === undefined) return undefined;
  const second = stages[1];
  if (second === undefined) return { kind: 'one', stage: first, key: 'stages' };
  return { kind: 'list', stages: [first, second, ...stages.slice(2)] };
}

function applyChange(input: { readonly record: DeskRecord; readonly change: DeskChange }): DeskRecord {
  switch (input.change.kind) {
    case 'lane':
      return applyLane({ record: input.record, value: input.change.value });
    case 'text':
      return applyText({ record: input.record, value: input.change.value });
    case 'stage':
      return applyStage({ record: input.record, value: input.change.value });
    case 'overdue':
      return applyOverdue({ record: input.record, value: input.change.value });
    case 'page':
      return applyPage({ record: input.record, value: input.change.value });
    case 'pageSize':
      return applyPageSize({ record: input.record, value: input.change.value });
    default: {
      const unreachable: never = input.change;
      return unreachable;
    }
  }
}

function applyLane(input: { readonly record: DeskRecord; readonly value: unknown }): DeskRecord {
  const parsed = deskLaneSchema.safeParse(input.value);
  const lane = parsed.success ? parsed.data : DEFAULT_LANE;
  return { ...input.record, lane, pageToken: undefined };
}

function applyText(input: { readonly record: DeskRecord; readonly value: unknown }): DeskRecord {
  if (typeof input.value !== 'string') return input.record;
  if (input.value === '') return withoutPage({ ...input.record, q: undefined });
  return withoutPage({ ...input.record, q: input.value });
}

function applyStage(input: { readonly record: DeskRecord; readonly value: unknown }): DeskRecord {
  if (isClearedStage(input.value)) return withoutPage({ ...input.record, stage: { kind: 'all' } });
  const parsed = LineStageSchema.safeParse(input.value);
  if (!parsed.success) return input.record;
  return withoutPage({ ...input.record, stage: { kind: 'one', stage: parsed.data, key: 'stage' } });
}

function isClearedStage(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function applyOverdue(input: { readonly record: DeskRecord; readonly value: unknown }): DeskRecord {
  if (typeof input.value !== 'boolean') return input.record;
  return withoutPage({ ...input.record, isOverdue: input.value });
}

function withoutPage(record: DeskRecord): DeskRecord {
  return { ...record, pageToken: undefined };
}

function applyPage(input: { readonly record: DeskRecord; readonly value: unknown }): DeskRecord {
  if (typeof input.value !== 'number') return input.record;
  if (!Number.isSafeInteger(input.value) || input.value < 1) return input.record;
  return { ...input.record, pageToken: String(input.value) };
}

function applyPageSize(input: { readonly record: DeskRecord; readonly value: unknown }): DeskRecord {
  const parsed = sizeField.safeParse(input.value);
  if (!parsed.success) return input.record;
  return { ...input.record, pageSizeToken: String(parsed.data), pageToken: undefined };
}

function addressOf(record: DeskRecord): string {
  const next = commonParams(record);
  setStage({ next, stage: record.stage });
  if (record.isOverdue) next.set('overdue', '1');
  setText({ next, key: 'page', value: record.pageToken });
  setText({ next, key: 'pageSize', value: record.pageSizeToken });
  for (const { key, value } of record.rest) next.append(key, value);
  return next.toString();
}

function requestOf(record: DeskRecord): string {
  const next = commonParams(record);
  if (record.lane === 'all') next.delete('lane');
  if (record.isOverdue) next.set('overdueOnly', 'true');
  const stages = stageParam(record.stage);
  if (stages !== undefined) next.set('stages', stages);
  next.set('page', record.pageToken ?? '1');
  next.set('pageSize', String(pageSizeOf(record.pageSizeToken)));
  return next.toString();
}

function commonParams(record: DeskRecord): URLSearchParams {
  const next = new URLSearchParams();
  setText({ next, key: 'lane', value: record.lane });
  setText({ next, key: 'q', value: record.q });
  setText({ next, key: 'buyer', value: record.buyer });
  setText({ next, key: 'supplierPartyId', value: record.supplierPartyId });
  setText({ next, key: 'inTransitFactory', value: record.inTransitFactory });
  return next;
}

function stageParam(stage: StageSlot): string | undefined {
  if (stage.kind === 'all') return undefined;
  if (stage.kind === 'one') return stage.stage;
  return stage.stages.join(',');
}

function setStage(input: { readonly next: URLSearchParams; readonly stage: StageSlot }): void {
  if (input.stage.kind === 'all') return;
  if (input.stage.kind === 'one') {
    input.next.set(input.stage.key, input.stage.stage);
    return;
  }
  input.next.set('stages', input.stage.stages.join(','));
}

function setText(input: { readonly next: URLSearchParams; readonly key: string; readonly value: string | undefined }): void {
  if (input.value === undefined) return;
  input.next.set(input.key, input.value);
}

function stageControl(slot: StageSlot): StageControl {
  if (slot.kind === 'list') {
    return { kind: 'many', value: slot.stages.map((item) => lineStageLabel(item)).join('、') };
  }
  if (slot.kind === 'one') return { kind: 'one', value: slot.stage };
  return { kind: 'all', value: '' };
}

function pageTokenOf(raw: string | null): string | undefined {
  const parsed = pageField.safeParse(raw);
  if (!parsed.success) return undefined;
  if (!Number.isSafeInteger(Number(parsed.data))) return undefined;
  return parsed.data;
}

function pageNumber(token: string | undefined): number {
  if (token === undefined) return 1;
  const parsed = Number(token);
  if (!Number.isSafeInteger(parsed)) return 1;
  return parsed;
}

function pageSizeOf(token: string | undefined): number {
  if (token === undefined) return DEFAULT_PAGE_SIZE;
  const parsed = sizeField.safeParse(token);
  if (parsed.success) return parsed.data;
  const oversized = Number(token);
  if (Number.isSafeInteger(oversized) && oversized > PAGE_CAP) return PAGE_CAP;
  return DEFAULT_PAGE_SIZE;
}
