export type DateKind = 'confirmed' | 'required' | 'promised' | 'firstDelivery';

export type DateLine = {
  readonly kind: DateKind;
  readonly label: string;
  readonly text: string;
  readonly source?: string;
  readonly overdue?: boolean;
};

const ORDER: readonly DateKind[] = ['confirmed', 'required', 'promised', 'firstDelivery'];

const LABEL: Record<DateKind, string> = {
  confirmed: '确认',
  required: '需求',
  promised: '承诺',
  firstDelivery: '首批',
};

export function dateStackLines(input: Partial<Record<DateKind, { readonly text: string; readonly source?: string; readonly overdue?: boolean }>>): DateLine[] {
  return ORDER.flatMap((kind) => {
    const item = input[kind];
    if (item === undefined) return [];
    const line: DateLine = { kind, label: LABEL[kind], text: item.text };
    return [{ ...line, ...(item.source === undefined ? {} : { source: item.source }), ...(item.overdue === undefined ? {} : { overdue: item.overdue }) }];
  });
}
