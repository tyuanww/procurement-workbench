import { expect, it } from 'vitest';
import { ISSUE_CODES, type IssueCode } from '../../packages/domain/src/index.js';
import { toIssueRecord } from '../../packages/persistence/src/mappers/issues.js';

it('问题码汇总保留全部已登记的问题和各自计数', () => {
  const supplied: Partial<Record<IssueCode, number>> = {};
  for (const code of ISSUE_CODES) supplied[code] = code === 'HEADER_NOT_FOUND' ? 2 : 0;
  const counts = toIssueRecord(supplied);
  expect(counts).toEqual(supplied);
});
