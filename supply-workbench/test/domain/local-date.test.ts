import { expect, it } from 'vitest';
import { isLocalDate, localDate, missing, parseLocalDate } from '../../packages/domain/src/values/index.js';
import { DEFAULT_SETTINGS, UNDO_WINDOW_SECONDS } from '../../packages/domain/src/policies.js';
import { DomainRuleViolation } from '../../packages/domain/src/errors.js';

it('合法业务日可以通过', () => {
  expect(parseLocalDate('2026-10-12').ok).toBe(true);
  expect(parseLocalDate('2024-02-29').ok).toBe(true);
  expect(parseLocalDate('2000-02-29').ok).toBe(true);
  expect(localDate('2020-01-01')).toBe('2020-01-01');
  expect(isLocalDate('2026-10-12')).toBe(true);
});

it('2026-02-30 和格式不对的日期不通过', () => {
  expect(parseLocalDate('2026-02-30')).toEqual({ ok: false, reason: 'not_a_date' });
  expect(parseLocalDate('2023-02-29')).toEqual({ ok: false, reason: 'not_a_date' });
  expect(parseLocalDate('1900-02-29')).toEqual({ ok: false, reason: 'not_a_date' });
  expect(parseLocalDate('2026-04-31')).toEqual({ ok: false, reason: 'not_a_date' });
  expect(parseLocalDate('2026-13-01')).toEqual({ ok: false, reason: 'not_a_date' });
  expect(parseLocalDate('2026-00-10')).toEqual({ ok: false, reason: 'not_a_date' });
  expect(parseLocalDate('2026-1-01')).toEqual({ ok: false, reason: 'format' });
  expect(parseLocalDate('2026/10/12')).toEqual({ ok: false, reason: 'format' });
  expect(parseLocalDate('')).toEqual({ ok: false, reason: 'format' });
  expect(isLocalDate('2026-02-30')).toBe(false);
});

it('策略默认值和文档一致', () => {
  expect(UNDO_WINDOW_SECONDS).toBe(10);
  expect(DEFAULT_SETTINGS.upcomingDays).toBe(3);
  expect(DEFAULT_SETTINGS.missingDateHintWindowDays).toBe(7);
  expect(DEFAULT_SETTINGS.dateSanityRange.from).toBe('2020-01-01');
  expect(DEFAULT_SETTINGS.dateSanityRange.to).toBe('2030-12-31');
  expect(DEFAULT_SETTINGS.shippedNotReceivedAlertDays).toBeNull();
});

it('缺失值不是 0', () => {
  expect(missing('no_source').value).toBeNull();
  expect(missing('unparseable', '7月30日').raw).toBe('7月30日');
});

it('两次构造的领域错误不共享 details', () => {
  const first = new DomainRuleViolation({ code: 'STATE_CONFLICT', message: 'a' });
  const second = new DomainRuleViolation({ code: 'STATE_CONFLICT', message: 'b' });
  expect(first.details).not.toBe(second.details);
});

it('领域规则错误带着规定的错误码', () => {
  const error = new DomainRuleViolation({ code: 'DATE_CHANGE_REASON_REQUIRED', message: '要写原因' });
  expect(error.code).toBe('DATE_CHANGE_REASON_REQUIRED');
  expect(error).toBeInstanceOf(Error);
});
