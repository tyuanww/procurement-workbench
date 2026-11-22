import { addDays, localDate, type LocalDate } from '@sw/domain';

const EPOCH_1900 = localDate('1899-12-30');
const EPOCH_1904 = localDate('1904-01-01');

export function excelSerialToLocalDate(serial: number, date1904 = false): LocalDate {
  if (!Number.isFinite(serial)) throw new Error('Excel 序列号不是数字');
  return addDays(date1904 ? EPOCH_1904 : EPOCH_1900, Math.trunc(serial));
}
