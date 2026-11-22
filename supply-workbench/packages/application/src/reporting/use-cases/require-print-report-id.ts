export function requirePrintReportId(reportId: string | undefined): string {
  if (reportId === undefined) throw new Error('打印导出缺少周报 id');
  return reportId;
}
