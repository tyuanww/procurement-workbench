import { compareDates, type Settings } from '@sw/domain';
import type { UpdateSettings, UpdateSettingsDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError, ValidationFailedError } from '../../shared/errors.js';

const SETTINGS_ID = 'settings';

export const makeUpdateSettings =
  (deps: UpdateSettingsDeps): UpdateSettings =>
  async (input, actor) => {
    authorize(actor, 'admin');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.settings.get();
      const after = { ...before, ...input.patch };
      assertSettings(after);
      if (tx.settings.saveConditional !== undefined) {
        const isSaved = await tx.settings.saveConditional(after, before);
        if (!isSaved) throw new StateConflictError('settings.version');
      } else {
        await tx.settings.save(after);
      }
      await tx.audit.record(auditOf({ action: 'settings.update', subject: { id: SETTINGS_ID }, ctx: { actor, at, before, after, entity: '设置' } }));
    });
    return { updated: true };
  };

function assertSettings(settings: Settings): void {
  assertDayCount(settings.upcomingDays, 'upcomingDays');
  assertDayCount(settings.missingDateHintWindowDays, 'missingDateHintWindowDays');
  assertOptionalDayCount(settings.shippedNotReceivedAlertDays, 'shippedNotReceivedAlertDays');
  assertOptionalDayCount(settings.deliveryNoteAlertDays, 'deliveryNoteAlertDays');
  if (compareDates(settings.dateSanityRange.from, settings.dateSanityRange.to) > 0) {
    throw new ValidationFailedError('日期合理范围颠倒了', { field: 'dateSanityRange' });
  }
}

function assertOptionalDayCount(value: number | null, field: string): void {
  if (value === null) return;
  assertDayCount(value, field);
}

function assertDayCount(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) throw new ValidationFailedError('天数必须是非负整数', { field });
}
