import { createRequire } from 'node:module';

const requireImporter = createRequire(new URL('../../../packages/importers/package.json', import.meta.url));
const XLSX = requireImporter('xlsx');
const { unzipSync, zipSync } = requireImporter('fflate');

export function developmentWorkbook(): Uint8Array {
  const book = XLSX.utils.book_new();
  const ordered = XLSX.utils.aoa_to_sheet([
    ['合成已下单清单'],
    [null, '产品名', '订单数量', 'OA需求入仓时间', '预计入仓时间（含5天coa）', '主要事项'],
    [null, '合成重复款', '360（暂未下单）', '2026/12/4', 46360, '请先核对采购量'],
    [null, '合成已入仓款', 240, '12/4或12/5', '已入仓'],
    [null, null, null, null, '待定', '保留有事项但没有产品名称的原行'],
  ]);
  ordered.E3.z = 'm-d';
  ordered['!rows'] = [{}, {}, { hidden: true }];
  ordered['!merges'] = [XLSX.utils.decode_range('A1:F1')];
  XLSX.utils.book_append_sheet(book, ordered, '已下单产品');
  const workInProgress = XLSX.utils.aoa_to_sheet([
    ['产品名称', '项目对接人', '主要事项', '预计入仓时间', '状态', '原料到货'],
    ['合成重复款', '测试对接人\n采购 ', '待确认包材\n等样品', '12月下旬', null, '已收货'],
    ['合成冲突款', '测试对接人', '未下单', '2026-02-30', '已下单'],
    ['合成备注款', null, '若未下单则重新排期', 46360],
  ]);
  workInProgress.B4 = { t: 's', v: '', f: 'IF(TRUE,"","核对")' };
  XLSX.utils.book_append_sheet(book, workInProgress, '开发中产品');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['产品名', '主要事项'], ['无关示例', '不作为候选']]), '说明');
  const bytes: Uint8Array = XLSX.write(book, { type: 'buffer', bookType: 'xlsx', cellStyles: true, compression: true });
  return withExplicitXmlEndTags(bytes);
}

function withExplicitXmlEndTags(bytes: Uint8Array): Uint8Array {
  const zipped: Record<string, Uint8Array> = unzipSync(bytes);
  const workbook = Buffer.from(zipped['xl/workbook.xml'] ?? []).toString('utf8');
  zipped['xl/workbook.xml'] = Buffer.from(workbook.replace(/<(sheet\s[^>]+)\/>/gu, '<$1></sheet>'));
  const ordered = Buffer.from(zipped['xl/worksheets/sheet1.xml'] ?? []).toString('utf8');
  zipped['xl/worksheets/sheet1.xml'] = Buffer.from(ordered.replace('hidden="1"', 'hidden="true"'));
  return zipSync(zipped);
}
