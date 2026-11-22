import type { ExportWeeklyReport, ExportWeeklyReportDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { unpackWeekly } from '../policies/stored-weekly.js';

export const makeExportWeeklyReport =
  (deps: ExportWeeklyReportDeps): ExportWeeklyReport =>
  async (input, actor) => {
    authorize(actor, 'reports.export');
    const stored = await deps.reports.get(input.reportId);
    const packed = unpackWeekly(stored.data);
    if (packed === null) throw new ValidationFailedError('周报数据无法读取');
    const renderer = deps.renderers.find((item) => item.format === input.format);
    if (renderer === undefined) throw new ValidationFailedError('没有这种导出格式');
    const bytes = await renderer.render(packed.report);
    const file = await deps.files.put({ bytes, originalName: fileName(stored.weekStart, input.format), mime: mimeOf(input.format) });
    const exported = [...packed.exports, { format: input.format, fileId: file.sha256, docUrl: null }];
    await deps.reports.save({ ...stored, exports: exported, updatedAt: deps.clock.now() });
    return { fileId: file.sha256, fileName: file.originalName };
  };

function fileName(weekStart: string, format: string): string {
  return `weekly-${weekStart}.${format}`;
}

function mimeOf(format: 'xlsx' | 'pdf' | 'png'): string {
  if (format === 'pdf') return 'application/pdf';
  if (format === 'png') return 'image/png';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}
