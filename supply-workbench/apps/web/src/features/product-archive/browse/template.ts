export const TEMPLATE_LABELS = ['备案名称', 'SKU', '条码', '图片', '供应商', '周期'] as const;

export type TemplateInput = {
  readonly filingName?: string | null;
  readonly skuName?: string | null;
  readonly barcode?: string | null;
  readonly image?: string | null;
  readonly supplier?: string | null;
  readonly cycle?: string | null;
};

const EMPTY = '待补充';

export function catalogTemplate(item: {
  readonly skuName: string;
  readonly barcodeRaw: string;
  readonly filingName: string | null;
  readonly thumbnail: { readonly fileId: string } | null;
}): TemplateInput {
  return {
    skuName: item.skuName,
    barcode: item.barcodeRaw,
    filingName: item.filingName,
    image: item.thumbnail === null ? null : '已有图片',
  };
}

export function templateCells(input: TemplateInput = {}): { readonly label: string; readonly value: string }[] {
  return [
    cell('备案名称', input.filingName),
    cell('SKU', input.skuName),
    cell('条码', input.barcode),
    cell('图片', input.image),
    cell('供应商', input.supplier),
    cell('周期', input.cycle),
  ];
}

function cell(label: string, value: string | null | undefined): { readonly label: string; readonly value: string } {
  if (value === undefined || value === null || value.trim() === '') return { label, value: EMPTY };
  return { label, value };
}
