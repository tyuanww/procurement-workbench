import { describe, expect, it } from 'vitest';
import { unexpectedHttpErrors, type ExpectedServerError, type ResponseError } from '../../e2e/http-error-guard.js';

const EXPECTED: readonly ExpectedServerError[] = [
  { status: 500, path: '/api/v1/lines?' },
];

describe('验收错误响应', () => {
  it('允许认证错误、找不到和匹配验收路由的 500', () => {
    const responses: readonly ResponseError[] = [
      { status: 401, url: 'http://test/api/v1/me' },
      { status: 404, url: 'http://test/api/v1/missing' },
      { status: 500, url: 'http://test/api/v1/lines?pageSize=50' },
    ];
    expect(unexpectedHttpErrors({ responses, expected: EXPECTED })).toEqual([]);
  });

  it('拒绝没有被验收路由覆盖的 500 和其他错误响应', () => {
    const responses: readonly ResponseError[] = [
      { status: 500, url: 'http://test/api/v1/products' },
      { status: 502, url: 'http://test/api/v1/lines?pageSize=50' },
    ];
    expect(unexpectedHttpErrors({ responses, expected: EXPECTED })).toEqual(responses);
  });
});
