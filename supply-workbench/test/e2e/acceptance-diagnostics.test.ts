import { describe, expect, it } from 'vitest';
import { acceptanceSummary, browserFailureLocation, failureMessage } from '../../e2e/acceptance-diagnostics.ts';

const sha = 'a'.repeat(40);

describe('采购浏览器验收摘要', () => {
  it('失败时显示可定位的断言和最近完成的检查，不渲染错误里的 HTML', () => {
    const message = [
      'locator.waitFor: Error: expected a visible button',
      'Call log:',
      '  - received <button aria-label="清除"> & no result',
      '4', '5', '6', '7', '8', '9', '10', '11th line',
    ].join('\n');
    const summary = acceptanceSummary({
      sha,
      result: 'fail',
      stage: '执行采购浏览器验收',
      browser: {
        result: 'fail',
        failure: message,
        failureAt: 'e2e/planning-acceptance.ts:31:12',
        checks: { shell: {}, frontendCloseout: {} },
      },
    });

    expect(summary).toContain(`被测提交：\`${sha}\``);
    expect(summary).toContain('结果：失败（执行采购浏览器验收）');
    expect(summary).toContain('断言位置：`e2e/planning-acceptance.ts:31:12`');
    expect(summary).toContain('最近记录的检查：`frontendCloseout`');
    expect(summary).toContain('locator.waitFor: Error: expected a visible button');
    expect(summary).toContain('&lt;button aria-label="清除"&gt; &amp; no result');
    expect(summary).not.toContain('<button');
    expect(summary).not.toContain('11th line');
    expect(summary).toContain('preaccept/result.json');
  });

  it('浏览器尚无子进程报告时仍显示失败阶段和日志入口', () => {
    const summary = acceptanceSummary({
      sha, result: 'fail', stage: '执行采购浏览器验收', browser: undefined,
      error: 'spawnSync <browser> ETIMEDOUT', cleanupError: 'pg_ctl stop failed',
    });

    expect(summary).toContain('结果：失败（执行采购浏览器验收）');
    expect(summary).toContain('spawnSync &lt;browser&gt; ETIMEDOUT');
    expect(summary).toContain('清理失败：pg_ctl stop failed');
    expect(summary).toContain('完整错误见失败步骤日志');
    expect(summary).not.toContain('断言位置');
  });

  it('通过时显示被测提交且不提示失败', () => {
    const summary = acceptanceSummary({ sha, result: 'pass' });
    expect(summary).toContain(`被测提交：\`${sha}\``);
    expect(summary).toContain('结果：通过');
    expect(summary).not.toContain('失败');
  });

  it('浏览器已写出断言时仍报告后续子进程超时', () => {
    const summary = acceptanceSummary({
      sha, result: 'fail', stage: '执行采购浏览器验收',
      browser: { result: 'fail', failure: '找不到第 2 批' },
      error: 'spawnSync node ETIMEDOUT',
    });

    expect(summary).toContain('找不到第 2 批');
    expect(summary).toContain('运行器错误：spawnSync node ETIMEDOUT');
  });
});

it('浏览器包裹断言错误时保留原位置和原因', () => {
  const cause = new Error('locator.waitFor: timed out');
  cause.stack = `${cause.message}\n    at checkArrival (file:///workbench/e2e/arrival-acceptance.ts:137:12)`;
  const error = new Error('找不到第 2 批', { cause });
  error.stack = `${error.message}\n    at checkArrival (file:///workbench/e2e/arrival-acceptance.ts:140:9)`;

  expect(browserFailureLocation(error)).toBe('e2e/arrival-acceptance.ts:137:12');
  expect(failureMessage(error)).toBe('找不到第 2 批\n原因：locator.waitFor: timed out');
});

it.each([
  'file:///home/runner/work/workbench/supply-workbench/e2e/planning-acceptance.ts:31:12',
  String.raw`D:\a\workbench\supply-workbench\e2e\planning-acceptance.ts:31:12`,
])('归一化 Linux 和 Windows 的浏览器断言路径', (path) => {
  const error = new Error('locator timed out');
  error.stack = `TimeoutError: locator timed out\n    at Locator.click (node:internal/example:1:1)\n    at checkSchedule (${path})\n    at async runAcceptance (file:///workbench/e2e/preaccept-ui.ts:10:5)`;
  expect(browserFailureLocation(error)).toBe('e2e/planning-acceptance.ts:31:12');
});
