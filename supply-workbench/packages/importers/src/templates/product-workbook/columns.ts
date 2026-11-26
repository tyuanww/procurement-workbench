import { archiveFields } from '@sw/application';
import type { ImageSlot } from '@sw/domain';
import { BOM_COLUMNS } from '../bom-v1/columns.js';
import { INNER_IMAGE, OUTER_IMAGE } from '../product-archive-v1/columns.js';

export const ARCHIVE = '产品档案';
export const BOM = '组成物料';
export const CONTACT = '项目推荐人';
export const LEGACY_CONTACT = '项目对接人';
export const BARCODE = '产品条码';
export const PART_BARCODE = '子件条码';
export const OWNER = '负责人';
export const OPERATION = '操作';
export const IMAGE_COLUMNS = { inner: INNER_IMAGE, outer: OUTER_IMAGE } as const;
export const IMAGE_SLOTS = ['inner', 'outer'] as const;
export const ARCHIVE_COLUMNS = [
  archiveFields.filingName, archiveFields.filingNo, archiveFields.skuName, BARCODE, archiveFields.netContent,
  INNER_IMAGE, OUTER_IMAGE, archiveFields.casePack, archiveFields.outerSize, CONTACT, archiveFields.productLine,
  imageOperation('inner'), imageOperation('outer'),
];
export const MATERIAL_COLUMNS = [...BOM_COLUMNS, OWNER, OPERATION];

export function imageOperation(slot: ImageSlot): string {
  return `${IMAGE_COLUMNS[slot]}操作`;
}
