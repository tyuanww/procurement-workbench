import type { KpiMeasure } from '@sw/domain';
import type { KpiFigure } from '../../master-data/index.js';

export function figure(measure: KpiMeasure): KpiFigure {
  return { numerator: measure.numerator, denominator: measure.denominator, n: measure.n };
}

/** 改期和异常没有供应商。对不上时分子是 null，不是 0。 */
export function unattributed(): KpiFigure {
  return { numerator: null, denominator: null, n: 0 };
}
