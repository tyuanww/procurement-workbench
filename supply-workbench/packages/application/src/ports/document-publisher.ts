import type { WeeklyReportData } from '../reporting/views.js';

export interface DocumentPublisher {
  /** 没配置飞书时抛 FeishuNotConfiguredError，不返回空链接。 */
  publish(data: WeeklyReportData): Promise<{ readonly docUrl: string }>;
}
