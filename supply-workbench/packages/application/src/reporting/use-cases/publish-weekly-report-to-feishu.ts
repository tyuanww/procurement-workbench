import type { PublishWeeklyReportToFeishu, PublishWeeklyReportToFeishuDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { packWeekly, unpackWeekly, type StoredWeekly } from '../policies/stored-weekly.js';

export const makePublishWeeklyReportToFeishu =
  (deps: PublishWeeklyReportToFeishuDeps): PublishWeeklyReportToFeishu =>
  async (input, actor) => {
    authorize(actor, 'reports.generate');
    const stored = await deps.reports.get(input.reportId);
    const packed = unpackWeekly(stored.data);
    if (packed === null) throw new ValidationFailedError('周报数据无法读取');
    const published = await deps.publisher.publish(packed.report);
    const exports = [...packed.exports, { format: 'feishu', fileId: null, docUrl: published.docUrl }] satisfies StoredWeekly['exports'];
    await deps.uow.run(async (tx) => {
      await tx.weeklyReports.save({ ...stored, data: packWeekly({ report: packed.report, generatedByName: packed.generatedByName, exports }), updatedAt: deps.clock.now() });
    });
    return published;
  };
