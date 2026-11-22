import type { ImportBatchSummary, ImportRowView, OrderLineRow } from '@sw/contracts';

export type ConflictCandidate = {
  readonly id: string;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly barcodeRaw: string | null;
};

export function conflictCandidateOf(row: OrderLineRow): ConflictCandidate {
  return { id: row.id, poRaw: row.po.poRaw, nameRaw: row.nameRaw, barcodeRaw: row.barcodeRaw };
}

export function conflictQueryOf(row: ImportRowView): string {
  const payload = recordOf(row.parsed) ?? recordOf(row.raw);
  if (payload === undefined) return '';
  const po = recordOf(valueOf(payload.po));
  return firstText([textOf(po?.poRaw), cellText(payload.barcodeRaw), cellText(payload.nameRaw)]);
}

export function conflictChoicesOf(input: {
  readonly rows: readonly ImportRowView[];
  readonly decisions: ImportBatchSummary['decisions'];
}): Readonly<Record<string, string>> {
  const choices: Record<string, string> = {};
  for (const row of input.rows) {
    const resolution = input.decisions.conflictResolutions.find((item) => item.rowId === row.id);
    if (resolution !== undefined) choices[row.id] = resolution.targetOrderLineId ?? 'new';
  }
  return choices;
}

export function allConflictChoices(input: {
  readonly rows: readonly ImportRowView[];
  readonly choices: Readonly<Record<string, string>>;
}): boolean {
  return input.rows.every((row) => {
    const choice = input.choices[row.id];
    return choice !== undefined && choice !== '';
  });
}

export function conflictResolutionsOf(input: {
  readonly rows: readonly ImportRowView[];
  readonly choices: Readonly<Record<string, string>>;
}): readonly { readonly rowId: string; readonly targetOrderLineId: string | null }[] {
  return input.rows.flatMap((row) => {
    const choice = input.choices[row.id];
    if (choice === undefined || choice === '') return [];
    return [{ rowId: row.id, targetOrderLineId: choice === 'new' ? null : choice }];
  });
}

function cellText(value: unknown): string | null {
  const cell = recordOf(value);
  if (cell === undefined) return null;
  return textOf(cell.raw) ?? textOf(cell.value);
}

function valueOf(value: unknown): unknown {
  return recordOf(value)?.value;
}

function firstText(values: readonly (string | null)[]): string {
  return values.find((value) => value !== null) ?? '';
}

function textOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
