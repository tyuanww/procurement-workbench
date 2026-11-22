import { expect, it } from 'vitest';
import { readXlsx } from '../../packages/importers/src/workbook/index.js';
import { template } from '../../packages/importers/src/templates/factory-progress-v1/index.js';
import { generateBlankTemplate } from '../../packages/importers/src/templates/factory-progress-v1/generate.js';
import { SHEETS } from '../../packages/importers/src/templates/factory-progress-v1/spec/index.js';

const uploadedAt = '2026-10-12T00:00:00.000Z';

it('空白模板能被识别，解析 0 行，说明里每列都有字', () => {
  const book = readXlsx({ bytes: generateBlankTemplate(), fileName: 'factory-progress-v1.xlsx' });
  expect(template.detect(book).score).toBe(100);
  const parsed = template.parse(book, { uploadedAt, factoryPartyId: null });
  expect(parsed.fileIssues.filter((issue) => issue.code === 'HEADER_NOT_FOUND')).toEqual([]);
  expect(parsed.inTransit).toHaveLength(0);
  expect(parsed.shipments).toHaveLength(0);
  expect(parsed.stock).toHaveLength(0);
  expect(parsed.schedule).toHaveLength(0);
  expect(parsed.demand).toHaveLength(0);
  expect(parsed.packagingCombo).toHaveLength(0);
  expect(parsed.customerSupplied).toHaveLength(0);
  const notes = book.sheets.find((sheet) => sheet.name === '说明');
  expect(notes).toBeDefined();
  if (notes === undefined) return;
  const text = sheetText(notes);
  for (const spec of Object.values(SHEETS)) {
    for (const column of spec.columns) expect(text).toContain(column.name);
  }
  expect(text).toContain('到货时间');
  expect(text).toContain('只写数字');
});

function sheetText(sheet: { readonly rowCount: number; cell(row: number, col: number): { readonly text: string } | null }): string {
  const parts: string[] = [];
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    for (let col = 1; col <= 4; col += 1) parts.push(sheet.cell(row, col)?.text ?? '');
  }
  return parts.join('\n');
}
