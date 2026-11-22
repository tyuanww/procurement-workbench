import { expect, it } from 'vitest';
import { entityId, type Role, type User } from '../../packages/domain/src/index.js';
import { activeAdminActor } from '../../packages/application/src/shared/scheduled-actor.js';
import { requirePrintReportId } from '../../packages/application/src/reporting/use-cases/require-print-report-id.js';
import { unconfiguredFeishuPublisher } from '../../packages/application/src/reporting/unconfigured-feishu-publisher.js';
import { FeishuNotConfiguredError } from '../../packages/application/src/shared/errors.js';
import type { WeeklyReportData } from '../../packages/application/src/reporting/views.js';

it('定时任务使用第一个在职管理员', async () => {
  const actor = await activeAdminActor({
    list: async () => [
      user({ id: 'inactive', isActive: false, roles: ['admin'] }),
      user({ id: 'buyer', isActive: true, roles: ['buyer'] }),
      user({ id: 'admin', isActive: true, roles: ['admin', 'manager'] }),
    ],
  });
  expect(actor).toEqual({ id: 'admin', name: 'admin', roles: ['admin', 'manager'] });
});

it('没有在职管理员时定时任务不能记账', async () => {
  await expect(activeAdminActor({ list: async () => [user({ id: 'former', isActive: false, roles: ['admin'] })] })).rejects.toThrow('没有在职管理员，定时任务无法记账');
});

it('打印导出必须带着周报 id', () => {
  expect(requirePrintReportId('report-1')).toBe('report-1');
  expect(() => requirePrintReportId(undefined)).toThrow('打印导出缺少周报 id');
});

it('没配置飞书时发布直接失败', async () => {
  await expect(unconfiguredFeishuPublisher().publish(emptyReport())).rejects.toBeInstanceOf(FeishuNotConfiguredError);
});

function user(input: { readonly id: string; readonly isActive: boolean; readonly roles: readonly Role[] }): User {
  return { id: entityId(input.id), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', name: input.id, roles: input.roles, feishuOpenId: null, active: input.isActive };
}

function emptyReport(): WeeklyReportData {
  const none = { value: 0, previous: null };
  return {
    overview: { dueBatches: none, onTime: { value: { rate: null, n: 0 }, previous: null }, overdue: none, exceptionsOpened: 0, exceptionsClosed: 0, missingDateRate: null },
    risks: [],
    stuck: [],
    suppliers: [],
    buyers: [],
    exceptions: { opened: 0, closed: 0 },
    dueNextWeek: [],
    notes: { sources: [], basedOnWorkbenchRecords: true },
  };
}
