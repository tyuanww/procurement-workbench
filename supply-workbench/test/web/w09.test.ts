import { describe, expect, it } from 'vitest';
import { feishuButton, printStyle } from '../../apps/web/src/features/reporting/model/print.js';

describe('周报页面', () => {
  it('飞书没配置时按钮置灰并说明', () => {
    expect(feishuButton(false)).toEqual({ disabled: true, hint: '没配置飞书应用' });
    expect(feishuButton(true).disabled).toBe(false);
  });

  it('打印页按 A4 横向，内容不断行', () => {
    expect(printStyle()).toContain('A4 landscape');
    expect(printStyle()).toContain('break-inside: avoid');
  });
});
