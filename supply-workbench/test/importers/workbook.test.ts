import { expect, it } from 'vitest';
import { excelSerialToLocalDate, readCsv, readXlsx } from '../../packages/importers/src/workbook/index.js';
import { generateBlankTemplate } from '../../packages/importers/src/templates/factory-progress-v1/generate.js';
import { csvBytes } from './fixtures/workbooks.js';

it('CSV 表头保留带引号的换行，空列返回 null', () => {
  const book = readCsv(csvBytes([['采购\n订单号', '供应商'], ['PO20260101000001', '示例供应商']]), 'po.csv');
  const sheet = book.sheets[0];
  expect(sheet?.rowCount).toBe(2);
  expect(sheet?.cell(1, 1)?.text).toBe('采购\n订单号');
  expect(sheet?.cell(1, 3)).toBeNull();
});

it('Excel 日期序列按工作簿日期系统转换', () => {
  expect(excelSerialToLocalDate(46284)).toBe('2026-09-19');
  expect(excelSerialToLocalDate(46284, true)).toBe('2030-09-20');
});

it('两个引擎读出的代工厂空白模板的工作表和单元格文本一致', () => {
  const bytes = generateBlankTemplate();
  const standard = readXlsx({ bytes, fileName: 'factory-template.xlsx' });
  const xml = readXlsx({ bytes, fileName: 'factory-template.xlsx', options: { engine: 'xml' } });
  expect(standard.sheets.map((sheet) => sheet.name)).toContain('在途订单汇总');
  expect(xml.date1904).toBe(standard.date1904);
  expect(xml.sheets.map((sheet) => sheet.name)).toEqual(standard.sheets.map((sheet) => sheet.name));
  for (const [index, sheet] of standard.sheets.entries()) {
    const other = xml.sheets[index];
    expect(other?.rowCount).toBe(sheet.rowCount);
    for (let row = 1; row <= sheet.rowCount; row += 1) {
      for (let col = 1; col <= 32; col += 1) {
        expect(other?.cell(row, col)?.text).toBe(sheet.cell(row, col)?.text);
      }
    }
  }
});
