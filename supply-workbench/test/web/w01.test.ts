import { describe, expect, it } from 'vitest';
import { BATCH_STATUSES, LINE_STAGES, MISSING_REASONS, TODO_REASONS } from '../../packages/domain/src/index.js';
import { antdTheme, paintedTheme, themePatchCss } from '../../apps/web/src/theme/antd.js';
import { brand, contrastPairs, controlBorder, fontFamily, primaryHover, statusColor, text, type ContrastKind } from '../../apps/web/src/theme/tokens.js';
import { contrastRatio } from '../../apps/web/src/theme/contrast.js';
import { missingText } from '../../apps/web/src/shared/ui/missing.js';
import { sourceHover } from '../../apps/web/src/shared/ui/source.js';
import { dateStackLines } from '../../apps/web/src/shared/ui/dates.js';
import { STATUS_KEYS, STATUS_SPEC, normalizeStatusKey } from '../../apps/web/src/shared/ui/status.js';
import { batchStatusLabel, lineStageLabel, todoReasonLabel } from '../../packages/domain/src/index.js';
import { parseUrlState, writeUrlState } from '../../apps/web/src/shared/hooks/url-state.js';

const FLOOR: Record<ContrastKind, number> = { text: 4.5, border: 3 };

const REQUIRED_TEXT = [
  'text.tertiary/surface',
  'text.tertiary/page',
  'text.primary/brand.200',
  'text.primary/brand.300',
  'white/brand.600',
  'white/primaryHover',
  'brand.800/brand.200',
] as const;

const REQUIRED_BORDER = ['controlBorder/surface', 'controlBorder/page'] as const;

describe('设计令牌对比度', () => {
  it('文字至少 4.5，控件边框至少 3', () => {
    for (const name of REQUIRED_TEXT) expect(kindOf(name)).toBe('text');
    for (const name of REQUIRED_BORDER) expect(kindOf(name)).toBe('border');
    for (const pair of contrastPairs) {
      expect(contrastRatio(pair.foreground, pair.background), pair.name).toBeGreaterThanOrEqual(FLOOR[pair.kind]);
    }
  });

  it('算出来的 antd 主题用规范色，而不是种子派生色', () => {
    const painted = paintedTheme();
    expect(lower(painted.colorInfo)).toBe(lower(statusColor.info.text));
    expect(lower(painted.colorInfoBg)).toBe(lower(statusColor.info.bg));
    expect(lower(painted.colorInfoBorder)).toBe(lower(statusColor.info.border));
    expect(lower(painted.colorInfoText)).toBe(lower(statusColor.info.text));
    expect(lower(painted.colorInfo)).not.toBe(lower(painted.colorPrimary));
    expect(lower(painted.colorErrorText)).toBe(lower(statusColor.danger.text));
    expect(lower(painted.colorWarningText)).toBe(lower(statusColor.warning.text));
    expect(lower(painted.colorSuccessText)).toBe(lower(statusColor.success.text));
    expect(lower(painted.colorError)).toBe(lower(statusColor.danger.text));
    expect(lower(painted.colorWarning)).toBe(lower(statusColor.warning.text));
    expect(lower(painted.colorSuccess)).toBe(lower(statusColor.success.text));
    expect(lower(painted.colorPrimaryHover)).toBe(lower(primaryHover));
    expect(lower(painted.colorLink)).toBe(lower(brand[600]));
    expect(lower(painted.colorLinkHover)).toBe(lower(primaryHover));
    expect(lower(painted.colorTextTertiary)).toBe(lower(text.tertiary));
    expect(lower(painted.colorTextPlaceholder)).toBe(lower(text.tertiary));
    expect(lower(painted.colorBorder)).toBe(lower(controlBorder));
    expect(painted.fontFamily).toBe(fontFamily);
    expect(fontFamily.startsWith('-apple-system')).toBe(true);
    expect(themePatchCss.includes(brand[800])).toBe(true);
    expect(themePatchCss.includes(controlBorder)).toBe(true);
    expect(themePatchCss.includes('.ant-table-tbody>tr.ant-table-row-selected>td a')).toBe(true);
    expect(themePatchCss.includes('.missing-value')).toBe(true);
    const table = antdTheme.components?.Table;
    if (!isTableToken(table)) throw new Error('表格 token 缺失');
    expect(table.rowSelectedBg).toBe(brand[200]);
    expect(table.rowSelectedHoverBg).toBe(brand[300]);
  });
});

function kindOf(name: string): ContrastKind {
  const pair = contrastPairs.find((item) => item.name === name);
  if (pair === undefined) throw new Error(name);
  return pair.kind;
}

function lower(color: string): string {
  return color.toLowerCase();
}

function isTableToken(value: unknown): value is { readonly rowSelectedBg: string; readonly rowSelectedHoverBg: string } {
  if (typeof value !== 'object' || value === null) return false;
  return 'rowSelectedBg' in value && 'rowSelectedHoverBg' in value;
}

describe('缺失和来源', () => {
  it('五种原因都有文案，认不出的原文带引号', () => {
    expect(MISSING_REASONS.map((reason) => missingText(reason, '9月3日'))).toEqual([
      '未填写',
      '原文无法识别：「9月3日」',
      '代工厂表无对应记录',
      '不适用',
      '暂无数据来源',
    ]);
  });

  it('来源悬停含批次、表、行号和时间', () => {
    expect(sourceHover({ kind: 'factory', batchId: 'b1', sheet: '在途订单汇总', rowNo: 12, at: '2026-10-11' })).toBe('b1 · 在途订单汇总 · 12 · 2026-10-11');
  });
});

describe('日期叠放和状态', () => {
  it('确认在第一行，缺的日期不出现', () => {
    const lines = dateStackLines({ confirmed: { text: '10-07', overdue: true }, required: { text: '10-05', source: '甲代工厂' } });
    expect(lines.map((line) => line.kind)).toEqual(['confirmed', 'required']);
    expect(lines[0]?.overdue).toBe(true);
  });

  it('每个状态都有图标和文字', () => {
    for (const key of STATUS_KEYS) {
      expect(STATUS_SPEC[key].icon.length).toBeGreaterThan(0);
      expect(STATUS_SPEC[key].label.length).toBeGreaterThan(0);
    }
  });

  it('状态键覆盖领域词表，文案直接用领域标签', () => {
    for (const reason of TODO_REASONS) {
      expect(STATUS_KEYS).toContain(reason);
      expect(STATUS_SPEC[reason].label).toBe(todoReasonLabel(reason));
    }
    for (const stage of LINE_STAGES) {
      expect(STATUS_KEYS).toContain(stage);
      expect(STATUS_SPEC[stage].label).toBe(lineStageLabel(stage));
    }
    for (const status of BATCH_STATUSES) {
      expect(STATUS_KEYS).toContain(status);
      expect(STATUS_SPEC[status].label).toBe(batchStatusLabel(status));
    }
  });

  it('旧界面键能读进来并换成领域键，写出用领域键', async () => {
    expect(normalizeStatusKey('required_before_confirmed')).toBe('demand_before_confirmed');
    expect(normalizeStatusKey('missing_confirmed')).toBe('missing_date');
    expect(normalizeStatusKey('shipped_waiting')).toBe('shipped_not_received');
    expect(normalizeStatusKey('done')).toBe('done');
    expect(normalizeStatusKey('nonsense')).toBeNull();
    const { readReasons } = await import('../../apps/web/src/features/today/model/query.js');
    expect(readReasons('?reasons=required_before_confirmed,overdue')).toEqual(['demand_before_confirmed', 'overdue']);
  });
});

describe('地址状态', () => {
  it('写入后再读回来一样，清空的条件消失', () => {
    const written = writeUrlState('', { q: '面膜', page: '2' });
    expect(parseUrlState(written)).toEqual({ q: '面膜', page: '2' });
    expect(parseUrlState(writeUrlState(written, { q: null }))).toEqual({ page: '2' });
  });
});
