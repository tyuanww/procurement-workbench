import { readdir, readFile } from 'node:fs/promises';
import { extname, join, parse } from 'node:path';
import { SCHEDULE_MILESTONES, DirectorProjectSchema, type DirectorProject } from '@sw/contracts';
import { readCsv, readXlsx } from '@sw/importers';

type Workbook = ReturnType<typeof readXlsx>;
type Sheet = Workbook['sheets'][number];
const basic = ['产品名称', '项目对接人', '主要事项', '预计入仓时间'] as const;
const headers: readonly string[] = [...basic, ...SCHEDULE_MILESTONES];

function headerColumns(sheet: Sheet) {
  const columns = new Map<string, number>();
  for (let col = 1; col <= 128; col++) {
    const value = sheet.cell(1, col)?.text.trim();
    if (value && headers.includes(value)) {
      if (columns.has(value)) throw new Error('新品排期字段重复');
      columns.set(value, col);
    }
  }
  if (headers.some((field) => !columns.has(field))) throw new Error('新品排期缺少必要字段');
  return columns;
}

function displayedCell(sheet: Sheet, address: { row: number; col: number }) {
  const { row, col } = address;
  const merge = sheet.merges.find((m) => row >= m.r1 && row <= m.r2 && col >= m.c1 && col <= m.c2);
  const cell = sheet.cell(merge?.r1 ?? row, merge?.c1 ?? col);
  return (cell?.displayText ?? cell?.text ?? '').trim();
}

export function scheduleProjects(book: Workbook, brand: string): DirectorProject[] {
  const sheet = book.source.kind === 'csv' ? book.sheets[0] : book.sheets.find((entry) => entry.name === '开发中产品');
  if (!sheet) throw new Error('找不到开发中产品工作表');
  const columns = headerColumns(sheet);
  const projects: DirectorProject[] = [];
  for (let row = 2; row <= sheet.rowCount; row++) {
    const value = (field: string) => displayedCell(sheet, { row, col: columns.get(field) ?? 0 });
    const name = value('产品名称');
    if (!name) continue;
    const milestones = Object.fromEntries(SCHEDULE_MILESTONES.map((key) => [key, value(key)]));
    projects.push(DirectorProjectSchema.parse({ row, brand, name, contact: value('项目对接人'), notes: value('主要事项'), arrival: value('预计入仓时间'), milestones }));
  }
  return projects;
}

export async function directorSchedule(directory: string | undefined) {
  if (!directory) return { brands: [], projects: [] };
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('~$') && /\.(xlsx|csv)$/iu.test(entry.name));
  const brands = files.map((entry) => parse(entry.name).name.trim());
  if (new Set(brands).size !== files.length || brands.includes('')) throw new Error('新品排期品牌文件重复或未命名');
  const projects: DirectorProject[] = [];
  for (const file of files) {
    const bytes = await readFile(join(directory, file.name));
    const book = extname(file.name).toLowerCase() === '.csv' ? readCsv(bytes, file.name)
      : readXlsx({ bytes, fileName: file.name, options: { engine: 'sheetjs' } });
    projects.push(...scheduleProjects(book, parse(file.name).name.trim()));
  }
  return { brands, projects };
}
