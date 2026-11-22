import { localDate, type LocalDate } from '@sw/domain';

const PAD = 2;

export function systemClock(timeZone: string) {
  return {
    now: () => new Date().toISOString(),
    today(): LocalDate {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const year = parts.find((part) => part.type === 'year')?.value;
      const month = parts.find((part) => part.type === 'month')?.value;
      const day = parts.find((part) => part.type === 'day')?.value;
      if (year === undefined || month === undefined || day === undefined) throw new Error('业务日无法从时区算出');
      return localDate(`${year}-${month.padStart(PAD, '0')}-${day.padStart(PAD, '0')}`);
    },
  };
}
