/** 解析器和空白模板共用的列定义。I05 只读这里生成表头。 */

export type ColumnSpec = {
  readonly name: string;
  readonly synonyms: readonly string[];
  readonly required: boolean;
  /** 同名列从 1 起。出货明细有两列都叫「备注」。 */
  readonly occurrence: number;
};

export type SheetRole = 'required' | 'optional' | 'ignored';

export type SheetSpec = {
  readonly id: string;
  readonly title: string;
  readonly role: SheetRole;
  readonly columns: readonly ColumnSpec[];
};

const ours = { name: '我方物料编码', synonyms: [], required: false, occurrence: 1 };

export const SHEETS = {
  inTransit: sheet({ title: '在途订单汇总', role: 'required', columns: [
    required({ name: '订单号' }),
    required({ name: '品名' }),
    required({ name: '供应商' }),
    required({ name: '产品69码' }),
    required({ name: '下单时间' }),
    required({ name: '采购需求量' }),
    required({ name: '已交货数量' }),
    required({ name: '工厂现货库存数量' }),
    required({ name: '未生产数量' }),
    required({ name: '是否结单' }),
    required({ name: '品号' }),
    required({ name: '客供包材采购单号' }),
    optional({ name: '采购' }),
    ours,
  ] }),
  shipment: sheet({ title: '成品出货明细', role: 'required', columns: [
    required({ name: '订单号' }),
    required({ name: '品号' }),
    required({ name: '品名' }),
    required({ name: '批号' }),
    required({ name: '数量' }),
    required({ name: '装箱规格' }),
    required({ name: '托数' }),
    required({ name: '备注', synonyms: [], occurrence: 1 }),
    required({ name: '出货时间（到货时间）', synonyms: ['出货时间', '到货时间'] }),
    required({ name: '客户仓+托数' }),
    required({ name: '车型' }),
    required({ name: '备注', synonyms: [], occurrence: 2 }),
    ours,
  ] }),
  stock: sheet({ title: '库存数量汇总', role: 'required', columns: [
    required({ name: '订单号' }),
    required({ name: '编码' }),
    required({ name: '品名' }),
    required({ name: '批号' }),
    required({ name: '结存数量' }),
    required({ name: '托数' }),
    required({ name: '状态（coa时间）' }),
    required({ name: '生产日期' }),
    required({ name: '是否验货' }),
    optional({ name: '计算托数' }),
    ours,
  ] }),
  schedule: sheet({ title: '排产计划', role: 'optional', columns: [
    required({ name: '月份' }),
    required({ name: '新老品' }),
    required({ name: '订单号' }),
    required({ name: '品号' }),
    required({ name: '产品名称' }),
    required({ name: '要求排产总数' }),
  ] }),
  demand: sheet({ title: '排产包材原料需求表', role: 'optional', columns: [
    required({ name: '采购单号' }),
    required({ name: '订单号' }),
    required({ name: '材料品号', synonyms: ['材料品'] }),
    required({ name: '材料品名' }),
    required({ name: '材料库存单位' }),
    required({ name: '成品预计用量' }),
    required({ name: '订单毛需求量' }),
    optional({ name: '现有库存量' }),
    required({ name: '物料需求量' }),
    required({ name: '需求到位日期&数量' }),
    ours,
  ] }),
  packagingCombo: sheet({ title: '包材组合', role: 'optional', columns: [
    required({ name: '客户订单号' }),
    required({ name: 'ERP编码' }),
    required({ name: '产品名' }),
    required({ name: '规格' }),
    required({ name: '订单量' }),
    required({ name: '内包材组合供应商名称（容器或已塞膜）+花盒' }),
    required({ name: '生产成品BOM' }),
    required({ name: '采购单号' }),
  ] }),
  customerSupplied: sheet({ title: '客供原料登记表', role: 'optional', columns: [
    required({ name: '登记时间' }),
    required({ name: '序号' }),
    required({ name: '原料代码' }),
    required({ name: '品名' }),
    required({ name: '批号' }),
    required({ name: '规格kg' }),
    required({ name: '件数' }),
    required({ name: '数量（净重）' }),
    required({ name: '有效日期' }),
    required({ name: '备注' }),
  ] }),
} as const satisfies Record<string, SheetSpec>;

export const REQUIRED_SHEET_TITLES = ['在途订单汇总', '成品出货明细', '库存数量汇总'] as const;

export const OPTIONAL_SHEET_TITLES = ['排产计划', '包材组合', '客供原料登记表'] as const;

export const DEMAND_SHEET_NAME = /^\d{2}月排产包材原料需求表?$/;

export const OUR_ITEM_CODE = '我方物料编码';

const NAME_INDEX = nameIndex();

export function canonicalColumnName(text: string): string | null {
  return NAME_INDEX.get(compact(text)) ?? null;
}

export function sheetKind(name: string): SheetRole {
  const title = name.trim();
  if (isListed(REQUIRED_SHEET_TITLES, title)) return 'required';
  if (isListed(OPTIONAL_SHEET_TITLES, title) || DEMAND_SHEET_NAME.test(title)) return 'optional';
  return 'ignored';
}

function nameIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const spec of Object.values(SHEETS)) {
    for (const column of spec.columns) {
      index.set(compact(column.name), column.name);
      for (const synonym of column.synonyms) index.set(compact(synonym), column.name);
    }
  }
  return index;
}

function isListed(names: readonly string[], title: string): boolean {
  return names.includes(title);
}

function compact(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, '');
}

function sheet({ title, role, columns }: { readonly title: string; readonly role: SheetRole; readonly columns: readonly ColumnSpec[] }): SheetSpec {
  return { id: title, title, role, columns };
}

function required({ name, synonyms = [], occurrence = 1 }: { readonly name: string; readonly synonyms?: readonly string[] | undefined; readonly occurrence?: number | undefined }): ColumnSpec {
  return column(name, { synonyms, isRequired: true, occurrence });
}

function optional({ name, synonyms = [], occurrence = 1 }: { readonly name: string; readonly synonyms?: readonly string[] | undefined; readonly occurrence?: number | undefined }): ColumnSpec {
  return column(name, { synonyms, isRequired: false, occurrence });
}

function column(name: string, options: { readonly synonyms: readonly string[]; readonly isRequired: boolean; readonly occurrence: number }): ColumnSpec {
  return { name, synonyms: options.synonyms, required: options.isRequired, occurrence: options.occurrence };
}
