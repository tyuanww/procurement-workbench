export type NudgeLine = {
  readonly poRaw: string;
  readonly nameRaw: string;
  readonly qty: number | null;
  readonly unit?: string;
  readonly dueDate: string | null;
  readonly status: 'unconfirmed' | 'confirmed' | 'overdue' | 'due_today' | 'shipped';
  readonly overdueDays: number | null;
};

export function nudgeText(input: { readonly waitingName: string; readonly buyerName: string; readonly lines: readonly NudgeLine[] }): string {
  const body = input.lines.map((line, index) => `${index + 1}. ${lineOf(line)}`).join('\n');
  const closing = input.buyerName.trim() === '' ? '谢谢！' : `谢谢！— ${input.buyerName}`;
  return `【采购工作台】${input.waitingName}您好，以下批次请协助确认：\n${body}\n${closing}`;
}

export function followUpCount(lines: readonly NudgeLine[], recordFollowUp: boolean): number {
  return recordFollowUp ? lines.length : 0;
}

function lineOf(line: NudgeLine): string {
  if (line.unit !== undefined) return `${line.poRaw} ${line.nameRaw} 未发 ${line.qty ?? '—'} ${line.unit}，确认到货 ${line.dueDate ?? '—'}，${replyText(line.status)}。`;
  return `${line.poRaw} ${line.nameRaw} ${line.qty ?? '—'}，确认到货 ${line.dueDate ?? '—'}，${statusText(line)}，${replyText(line.status)}。`;
}

function statusText(line: NudgeLine): string {
  if (line.status === 'overdue') return `已逾期 ${line.overdueDays ?? 0} 天`;
  if (line.status === 'due_today') return '今天应到';
  if (line.status === 'unconfirmed') return '尚未确认到货日';
  if (line.status === 'shipped') return '已发待收';
  return '已确认未到';
}

function replyText(status: NudgeLine['status']): string {
  if (status === 'shipped') return '请回复收货情况';
  if (status === 'unconfirmed') return '请回复可到货日期';
  return '请回复发货情况';
}
