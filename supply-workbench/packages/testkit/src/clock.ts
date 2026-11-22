import { localDate, type LocalDate } from '@sw/domain';
import { deliveryBatchId, entityId, orderLineId, productId } from './ids.js';

const MS_PER_SECOND = 1000;
const PAD = 2;

export class FixedClock {
  constructor(
    private instant: string,
    private readonly timeZone = 'Asia/Shanghai',
  ) {}

  set(instant: string): void {
    this.instant = instant;
  }

  advance(seconds: number): void {
    this.instant = new Date(Date.parse(this.instant) + seconds * MS_PER_SECOND).toISOString();
  }

  now(): string {
    return this.instant;
  }

  today(): LocalDate {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(this.instant));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year === undefined || month === undefined || day === undefined) {
      throw new Error('业务日无法从时区算出');
    }
    return localDate(`${year}-${month.padStart(PAD, '0')}-${day.padStart(PAD, '0')}`);
  }
}

export class SequentialIds {
  private nextNumber = 1;

  next(): ReturnType<typeof entityId> {
    return entityId(this.token());
  }

  orderLine(): ReturnType<typeof orderLineId> {
    return orderLineId(this.token());
  }

  product(): ReturnType<typeof productId> {
    return productId(this.token());
  }

  deliveryBatch(): ReturnType<typeof deliveryBatchId> {
    return deliveryBatchId(this.token());
  }

  private token(): string {
    const id = `id-${this.nextNumber}`;
    this.nextNumber += 1;
    return id;
  }
}
