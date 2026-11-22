import { TODO_REASONS, todoReasonText } from '@sw/domain';

export function actionReasonText(code: string): string {
  if (code === 'overdue') return '未发逾期';
  if (code === 'due_today') return '确认日为今天';
  return todoReasonText(code);
}

export function orderCodes(codes: readonly string[]): string[] {
  const unique = distinct(codes);
  const known = TODO_REASONS.filter((reason) => unique.includes(reason));
  const rest = unique.filter((code) => !known.some((reason) => reason === code));
  return [...known, ...rest];
}

function distinct(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  return codes.filter((code) => {
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}
