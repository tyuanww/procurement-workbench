import { businessTimeZone } from '../../../shared/business-time-zone.js';

const DAY_MS = 86_400_000;

export function businessToday(timeZone = businessTimeZone(), now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function receiptDefaults(input: { readonly plannedQty: number; readonly receivedQty: number; readonly today: string; readonly lane: 'finished' | 'material' }): { readonly qty: number; readonly receivedOn: string; readonly category: 'finished' | 'packaging'; readonly note: string } {
  return {
    qty: input.plannedQty - input.receivedQty,
    receivedOn: input.today,
    category: input.lane === 'finished' ? 'finished' : 'packaging',
    note: '',
  };
}

export function receiptErrors(input: { readonly qty: number; readonly receivedOn: string; readonly today: string }): string[] {
  const errors: string[] = [];
  if (!(input.qty > 0)) errors.push('数量必须大于 0');
  if (input.receivedOn > input.today) errors.push('收货日不能晚于今天');
  return errors;
}

export function dateChangeErrors(input: { readonly isFirst: boolean; readonly reason: string }): string[] {
  if (input.isFirst || input.reason.trim() !== '') return [];
  return ['改已有确认日必须写原因'];
}

export function shipmentDefaults(input: { readonly plannedQty: number; readonly shippedQty: number; readonly today: string }) {
  return { qty: input.plannedQty - input.shippedQty, shippedOn: input.today, note: '' };
}

export function shipmentErrors(input: { readonly qty: number; readonly shippedOn: string; readonly today: string }): string[] {
  const errors: string[] = [];
  if (!(input.qty > 0)) errors.push('数量必须大于 0');
  if (Date.parse(input.shippedOn) > Date.parse(input.today) + DAY_MS) errors.push('发货日不能晚于明天');
  return errors;
}

export function followUpErrors(input: { readonly text: string }): string[] {
  if (input.text.trim() === '') return ['跟进内容必填'];
  return [];
}

export function exceptionErrors(input: { readonly note: string }): string[] {
  if (input.note.trim() === '') return ['说明必填'];
  return [];
}
