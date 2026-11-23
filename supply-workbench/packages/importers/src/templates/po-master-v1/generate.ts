import * as XLSX from 'xlsx';
import { writeXlsx } from '../../workbook/write.js';
import { KNOWN_STATUS, OPTIONAL_COLUMNS, PO_MASTER_SHEET_NAME, REQUIRED_COLUMNS } from './columns.js';

const COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
const TEXT = '文本，按原值填写';
const ID_TEXT = '文本，保留前导零和后缀';
const DATE = 'Excel 日期或 YYYY-MM-DD 文本，填写完整年份';
const QUANTITY = '只填数字，单位沿用原订单';
const DURATION = '数字，按天填写';
const FIELD_GUIDE = {
  OA需求编号: [ID_TEXT, 'XPKA(CN)9999'],
  供应商: [TEXT, '示例供应商'],
  产品名称: [TEXT, '示例面霜'],
  产品条码: [ID_TEXT, '0000000000001'],
  订单数量: [QUANTITY, 100],
  OA提报时间: [DATE, '2026-11-01'],
  OA需求时间: [DATE, '2026-11-20'],
  计划时长: [DURATION, 19],
  采购订单号: [ID_TEXT, 'PO20261101009999'],
  '实际开始（半成品订单创建）': [DATE, '2026-11-02'],
  订单首批交付时间: [DATE, '2026-11-15'],
  '实际结束（成品交付完成）': [DATE, '2026-11-20'],
  实际时长: [DURATION, 18],
  工厂成品库存: [QUANTITY, 0],
  实际发货数量: [QUANTITY, 100],
  订单数量差额: [QUANTITY, 0],
  状态: [Array.from(KNOWN_STATUS).join('、'), '已完成'],
  采购负责人: [TEXT, '示例采购员'],
  工厂: [TEXT, '示例工厂'],
} satisfies Record<(typeof COLUMNS)[number], readonly [string, string | number]>;

export function generateBlankPoMasterTemplate(): Uint8Array {
  const book = XLSX.utils.book_new();
  const master = XLSX.utils.aoa_to_sheet([COLUMNS]);
  master['!cols'] = COLUMNS.map((column) => ({ wch: Math.max(15, column.length * 2 + 2) }));
  XLSX.utils.book_append_sheet(book, master, PO_MASTER_SHEET_NAME);
  XLSX.utils.book_append_sheet(book, notes(), '说明');
  return writeXlsx(book);
}

function notes(): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['填写位置', '从「采购订单总表」第 2 行起填写，每行对应一个订单行。保留第 1 行表头。'],
    ['逐行必填', '采购订单号、产品条码、产品名称至少填一项。其他字段的值可按业务实际填写或留空。'],
    ['标识格式', '填写 OA 需求编号、产品条码和采购订单号前，将对应单元格设为文本，保留原值。'],
    ['项目资料', '本模板用于订单主表。涉及共用料关系和项目日期时，请使用原采购工作簿及其项目进度页。'],
    ['完整快照（全量覆盖）', '请提交同来源的完整总表。提交后，未出现在本次快照中的既有订单行会标记为本轮缺失。'],
    ['示例用途', '下方示例均为合成数据，仅供填写参考或隔离环境回传。'],
    [],
    ['字段', '表头要求', '填写格式', '合成示例'],
    ...REQUIRED_COLUMNS.map((name) => [name, '必要', ...FIELD_GUIDE[name]]),
    ...OPTIONAL_COLUMNS.map((name) => [name, '可选', ...FIELD_GUIDE[name]]),
  ]);
  sheet['!cols'] = [{ wch: 31 }, { wch: 12 }, { wch: 42 }, { wch: 24 }];
  return sheet;
}
