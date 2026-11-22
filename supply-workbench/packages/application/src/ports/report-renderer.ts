import type { WeeklyReportData } from '../reporting/views.js';

export type ReportFormat = 'xlsx' | 'pdf' | 'png';

export interface ReportRenderer {
  readonly format: ReportFormat;
  /** 只吃周报纯数据，不读库。 */
  render(data: WeeklyReportData): Promise<Uint8Array>;
}
