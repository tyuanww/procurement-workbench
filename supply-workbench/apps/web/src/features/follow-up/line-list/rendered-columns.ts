import { LINE_DESK_PINNED_KEY } from '@sw/domain';
import type { LineColumnKey } from './columns.js';

export const NARROW_PHONE_MAX_WIDTH = 340;

const PHONE_COLUMNS: readonly LineColumnKey[] = ['po', 'name', 'stage', 'nextDue', 'daysInStage'];

export type LineTableLayout = 'desk' | 'phone' | 'narrow';

type ColumnLike = {
  readonly key: string;
  readonly title: string;
};

export function lineTableLayout(input: { readonly band: string; readonly isNarrow: boolean }): LineTableLayout {
  if (input.band !== 'phone') return 'desk';
  return input.isNarrow ? 'narrow' : 'phone';
}

export function exportAddress(input: { readonly query: string; readonly columns: readonly { readonly key: string }[] }): string {
  const params = new URLSearchParams(input.query);
  params.delete('hide');
  if (input.columns.length === 0) params.delete('columns');
  else params.set('columns', input.columns.map((column) => column.key).join(','));
  const query = params.toString();
  return query === '' ? '/api/v1/lines/export.xlsx' : `/api/v1/lines/export.xlsx?${query}`;
}

export function renderedLineColumns<T extends ColumnLike>(input: {
  readonly columns: readonly T[];
  readonly hiddenKeys: readonly string[];
  readonly layout: LineTableLayout;
}): readonly T[] {
  if (input.layout === 'desk') return deskColumns(input);
  return phoneColumns({ columns: input.columns, layout: input.layout });
}

function deskColumns<T extends ColumnLike>(input: { readonly columns: readonly T[]; readonly hiddenKeys: readonly string[] }): readonly T[] {
  const hidden = new Set(input.hiddenKeys);
  return input.columns.filter((column) => column.key === LINE_DESK_PINNED_KEY || !hidden.has(column.key));
}

function phoneColumns<T extends ColumnLike>(input: { readonly columns: readonly T[]; readonly layout: 'phone' | 'narrow' }): readonly T[] {
  const keys = input.layout === 'narrow' ? PHONE_COLUMNS.filter((key) => key !== 'nextDue') : PHONE_COLUMNS;
  const byKey = new Map(input.columns.map((column) => [column.key, column]));
  return keys.flatMap((key) => oneColumn(byKey, key));
}

function oneColumn<T extends ColumnLike>(byKey: ReadonlyMap<string, T>, key: LineColumnKey): readonly T[] {
  const column = byKey.get(key);
  return column === undefined ? [] : [column];
}
