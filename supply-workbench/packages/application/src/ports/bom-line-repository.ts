import type { BomLine } from '@sw/domain';

export interface BomLineRepository {
  /** 按产品条码替换这一批 BOM 行。空数组表示删掉这个条码下的行。 */
  replace(productBarcodeRaw: string, lines: readonly BomLine[]): Promise<void>;
}
