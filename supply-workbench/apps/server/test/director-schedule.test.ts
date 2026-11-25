import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { SCHEDULE_MILESTONES } from '@sw/contracts';
import { readCsv, readXlsx } from '@sw/importers';
import { scheduleProjects } from '../src/system/director-schedule.js';

const xlsx = createRequire(new URL('../../../packages/importers/package.json', import.meta.url))('xlsx');
const headers = ['产品名称', '项目对接人', '主要事项', '预计入仓时间', ...SCHEDULE_MILESTONES];

describe('新品排期显示值', () => {
  it('保留电子表格导出的富文本事项', () => {
    const book = readCsv(Buffer.from(headers.join(',') + '\n合成乳液,甲'), '合成品牌.csv');
    const [sheet] = book.sheets;
    if (!sheet) throw new Error('缺少合成工作表');
    const formatted = { ...sheet, cell: (row: number, col: number) => row === 2 && col === 3
      ? { kind: 'string' as const, value: '', text: '', richText: '打样完成\n复核包装' } : sheet.cell(row, col) };
    expect(scheduleProjects({ ...book, sheets: [formatted] }, '合成品牌')[0]?.notes).toBe('打样完成\n复核包装');
  });

  it('保留飞书的月份精度、文字交期和合并事项，只计有产品名的行', () => {
    const book = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([headers, ['合成面膜', '甲', '复核样品', 2027.01],
      ['合成乳液', '', '', 46445], ['合成喷雾', '乙', '', '下单后两个月'], [' ', '乙']]);
    sheet.D3.z = 'yyyy/m/d';
    sheet['!merges'] = [xlsx.utils.decode_range('C2:C3')];
    xlsx.utils.book_append_sheet(book, sheet, '开发中产品');
    const parsed = readXlsx({ bytes: xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }), fileName: '合成品牌.xlsx' });
    const rows = scheduleProjects(parsed, '合成品牌');
    expect(rows.map((row) => row.arrival)).toEqual(['2027.01', '2027/2/27', '下单后两个月']);
    expect(rows[1]).toMatchObject({ contact: '', notes: '复核样品', row: 3 });
  });
});
