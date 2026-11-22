import type { LocalDate } from '@sw/domain';
import type { PageQuery } from '../shared/page.js';
import type { ManagementMeetingSnapshot } from './management-meeting.js';
import type { UserRef } from '../shared/refs.js';
import type { BuyerLoadRow, StuckDashboard, SupplierKpiRow } from '../performance/index.js';
import type { FreshnessSource } from '../platform/index.js';

export type WeekDelta<T> = { readonly value: T; readonly previous: T | null };

export type WeeklyOverview = {
  readonly dueBatches: WeekDelta<number>;
  readonly onTime: WeekDelta<{ readonly rate: number | null; readonly n: number }>;
  readonly overdue: WeekDelta<number>;
  readonly exceptionsOpened: number;
  readonly exceptionsClosed: number;
  readonly missingDateRate: number | null;
};

export type WeeklyReportData = {
  readonly overview: WeeklyOverview;
  readonly risks: readonly { readonly batchId: string; readonly orderLineId: string; readonly overdueDays: number | null; readonly nameRaw: string | null }[];
  readonly stuck: StuckDashboard['distribution'];
  readonly suppliers: readonly SupplierKpiRow[];
  readonly buyers: readonly BuyerLoadRow[];
  readonly exceptions: { readonly opened: number; readonly closed: number };
  readonly dueNextWeek: readonly { readonly batchId: string; readonly dueDate: LocalDate; readonly nameRaw: string | null }[];
  readonly managementMeeting?: readonly ManagementMeetingSnapshot[];
  readonly notes: { readonly sources: readonly FreshnessSource[]; readonly basedOnWorkbenchRecords: true };
};

export type WeeklyReport = {
  readonly id: string;
  readonly weekStart: LocalDate;
  readonly weekEnd: LocalDate;
  readonly generatedAt: string;
  readonly generatedBy: UserRef;
  readonly supersededBy: string | null;
  readonly dataWatermark: readonly FreshnessSource[];
  readonly data: WeeklyReportData;
};

export type WeeklyReportListItem = {
  readonly id: string;
  readonly weekStart: LocalDate;
  readonly weekEnd: LocalDate;
  readonly generatedAt: string;
  readonly generatedBy: UserRef;
  readonly supersededBy: string | null;
  readonly exports: readonly { readonly format: 'xlsx' | 'pdf' | 'png' | 'feishu'; readonly fileId: string | null; readonly docUrl: string | null }[];
};

export type GenerateWeeklyReportInput = { readonly weekStart: LocalDate };
export type WeeklyReportIdInput = { readonly reportId: string };
export type ExportWeeklyReportInput = { readonly reportId: string; readonly format: 'xlsx' | 'pdf' | 'png' };
export type ExportFileResult = { readonly fileId: string; readonly fileName: string };
export type FeishuPublishResult = { readonly docUrl: string };
export type WeeklyReportListQuery = PageQuery;
