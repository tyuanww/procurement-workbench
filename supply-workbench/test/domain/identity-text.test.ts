import { expect, it } from 'vitest';
import { cellIssue, isNotProvided, issueLabel, normalizeText } from '../../packages/domain/src/index.js';

it('比较用文本先做 NFKC，再把连续空白压成一个空格，不改大小写', () => {
  expect(normalizeText('  店铺甲\n\n海葡萄  ')).toBe('店铺甲 海葡萄');
  expect(normalizeText('Ａｂ  ｃ')).toBe('Ab c');
  expect(normalizeText('po  1')).toBe('po 1');
  expect(normalizeText('A　　B')).toBe('A B');
});

it('空、斜杠、横线和全角斜杠是未填写，不报问题码', () => {
  expect(isNotProvided('')).toBe(true);
  expect(isNotProvided('  ')).toBe(true);
  expect(isNotProvided('/')).toBe(true);
  expect(isNotProvided('-')).toBe(true);
  expect(isNotProvided('—')).toBe(true);
  expect(isNotProvided('／')).toBe(true);
  expect(isNotProvided('不下单')).toBe(false);
});

it('问题码的级别和中文名来自目录，列先空着', () => {
  const issue = cellIssue({ code: 'DATE_NO_YEAR', raw: '7月30日' });
  expect(issue).toEqual({
    code: 'DATE_NO_YEAR',
    severity: 'warning',
    column: null,
    message: issueLabel('DATE_NO_YEAR'),
    raw: '7月30日',
  });
});
