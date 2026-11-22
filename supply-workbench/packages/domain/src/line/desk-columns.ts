import type { Lane } from '../vocabulary/identity.js';

export const LINE_DESK_PINNED_KEY = 'po';

export const LINE_DESK_COLUMN_KEYS = [
  'po',
  'name',
  'supplier',
  'factory',
  'receiver',
  'qtyOrdered',
  'received',
  'factoryDelivered',
  'stage',
  'nextDue',
  'factoryRequired',
  'daysInStage',
  'buyer',
  'status',
] as const;

export type LineDeskColumnKey = (typeof LINE_DESK_COLUMN_KEYS)[number];

export type LineDeskColumn = {
  readonly key: LineDeskColumnKey;
  readonly title: string;
};

const DESK_COLUMNS: readonly {
  readonly key: LineDeskColumnKey;
  readonly title: Readonly<Partial<Record<Lane, string>>>;
}[] = [
  { key: 'po', title: { finished: '采购单号', material: '物料采购单号' } },
  { key: 'name', title: { finished: '品名', material: '材料品名' } },
  { key: 'supplier', title: { finished: '供应商', material: '供应商' } },
  { key: 'factory', title: { finished: '工厂' } },
  { key: 'receiver', title: { material: '收货代工厂' } },
  { key: 'qtyOrdered', title: { finished: '订单数量', material: '需求量' } },
  { key: 'received', title: { finished: '已收（工作台）', material: '已收' } },
  { key: 'factoryDelivered', title: { finished: '代工厂已交货' } },
  { key: 'stage', title: { finished: '阶段', material: '阶段' } },
  { key: 'nextDue', title: { finished: '下一到货', material: '下一到货' } },
  { key: 'factoryRequired', title: { material: '代工厂需求日' } },
  { key: 'daysInStage', title: { finished: '卡了几天', material: '卡了几天' } },
  { key: 'buyer', title: { finished: '负责人', material: '负责人' } },
  { key: 'status', title: { finished: '总表状态' } },
];

export function lineDeskColumns(lane: Lane): readonly LineDeskColumn[] {
  return DESK_COLUMNS.flatMap((column) => titled(column, lane));
}

export function visibleLineDeskColumns(input: { readonly lane: Lane | undefined; readonly hiddenKeys: readonly string[] }): readonly LineDeskColumn[] {
  const hidden = new Set(input.hiddenKeys);
  const lane = input.lane ?? 'finished';
  return lineDeskColumns(lane).filter((column) => column.key === LINE_DESK_PINNED_KEY || !hidden.has(column.key));
}

export function isLineDeskColumnKey(value: string): value is LineDeskColumnKey {
  return LINE_DESK_COLUMN_KEYS.some((key) => key === value);
}

export function lineColumnsInOrder(input: { readonly lane: Lane | undefined; readonly keys: readonly string[] }): readonly LineDeskColumn[] {
  const catalog = new Map(lineDeskColumns(input.lane ?? 'finished').map((column) => [column.key, column]));
  const seen = new Set<LineDeskColumnKey>();
  const columns: LineDeskColumn[] = [];
  for (const key of input.keys) {
    const column = columnFor({ key, catalog, seen });
    if (column !== undefined) columns.push(column);
  }
  return columns;
}

function columnFor(input: { readonly key: string; readonly catalog: ReadonlyMap<LineDeskColumnKey, LineDeskColumn>; readonly seen: Set<LineDeskColumnKey> }): LineDeskColumn | undefined {
  if (!isLineDeskColumnKey(input.key) || input.seen.has(input.key)) return undefined;
  const column = input.catalog.get(input.key);
  if (column === undefined) return undefined;
  input.seen.add(input.key);
  return column;
}

function titled(column: (typeof DESK_COLUMNS)[number], lane: Lane): readonly LineDeskColumn[] {
  const title = column.title[lane];
  if (title === undefined) return [];
  return [{ key: column.key, title }];
}
