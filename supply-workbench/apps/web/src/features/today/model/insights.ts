import type { BoardItem } from './types.js';
import { actionReasonText } from './codes.js';

export type TodayInsight = {
  readonly total: number;
  readonly urgent: number;
  readonly overdue: number;
  readonly missingDate: number;
};

export type TodayKpiKey = 'total' | 'urgent' | 'overdue' | 'missing';

export type TodayKpiItem = {
  readonly key: TodayKpiKey;
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
};

export function todayInsights(items: readonly BoardItem[]): TodayInsight {
  return {
    total: items.length,
    urgent: items.filter((item) => item.severity >= 2).length,
    overdue: items.filter((item) => item.reasons.includes('overdue')).length,
    missingDate: items.filter((item) => item.reasons.includes('missing_date')).length,
  };
}

export function todayPageKpi(insight: TodayInsight): readonly TodayKpiItem[] {
  return [
    { key: 'total', label: '今日待办', value: insight.total },
    { key: 'urgent', label: '高优先', value: insight.urgent },
    { key: 'overdue', label: actionReasonText('overdue'), value: insight.overdue },
    { key: 'missing', label: '缺确认日期', value: insight.missingDate },
  ];
}
