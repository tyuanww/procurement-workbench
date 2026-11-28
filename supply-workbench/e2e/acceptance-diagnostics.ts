import { stripVTControlCharacters } from 'node:util';

export type AcceptanceSummary = { sha: string } & (
  | { result: 'pass' }
  | { result: 'fail'; stage: string; browser: unknown }
);

export function browserFailureLocation(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  for (const line of error.stack?.split('\n').slice(1) ?? []) {
    const location = /^\s+at .*[/\\]e2e[/\\]([\w-]+\.ts:\d+:\d+)\)?\s*$/u.exec(line)?.[1];
    if (location) return `e2e/${location}`;
  }
  return undefined;
}

export function acceptanceSummary(summary: AcceptanceSummary): string {
  const lines = [
    '### 采购浏览器验收',
    '',
    `被测提交：\`${summary.sha}\``,
    '',
    summary.result === 'pass' ? '结果：通过' : `结果：失败（${summary.stage}）`,
  ];
  if (summary.result === 'fail') {
    const { browser } = summary;
    if (isRecord(browser) && browser.result === 'fail') {
      if (typeof browser.failureAt === 'string' && /^e2e\/[\w-]+\.ts:\d+:\d+$/u.test(browser.failureAt)) {
        lines.push('', `断言位置：\`${browser.failureAt}\``);
      }
      if (isRecord(browser.checks)) {
        const last = Object.keys(browser.checks).at(-1);
        if (last && /^\w+$/u.test(last)) lines.push('', `最近记录的检查：\`${last}\``);
      }
      if (typeof browser.failure === 'string') {
        const detail = stripVTControlCharacters(browser.failure)
          .split(/\r?\n/u)
          .filter((line) => line.trim())
          .slice(0, 10)
          .join('\n')
          .slice(0, 1200);
        if (detail) lines.push('', `<pre>${escapeHtml(detail)}</pre>`);
      }
    }
    lines.push('', '完整错误见失败步骤日志。如已上传证据，打开 `run.json` 和 `preaccept/result.json`。');
  }
  return lines.join('\n') + '\n\n';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
