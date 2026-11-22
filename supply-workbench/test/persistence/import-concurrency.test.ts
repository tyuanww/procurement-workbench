import { describe, expect, it } from 'vitest';
import type { BomLine } from '../../packages/domain/src/index.js';
import { entityId, productId } from '../../packages/domain/src/index.js';
import { StateConflictError } from '../../packages/application/src/shared/errors.js';
import { createDb } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { requireDatabase } from '../../packages/persistence/src/require-database.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { bomLineRepository, productRepository } from '../../packages/persistence/src/repositories/products.js';
import { createUnitOfWork } from '../../packages/persistence/src/unit-of-work.js';

const url = process.env.DATABASE_URL;
const pgIt = url === undefined ? it.skip : it;

describe.skipIf(url === undefined)('导入并发', () => {
  pgIt('两个并发 BOM 提交同一 barcode，不重复也不丢行', async () => {
    if (url === undefined) throw new Error('需要 DATABASE_URL');
    const handle = await createDb({ driver: 'pg', url });
    try {
      await migrate(handle.exec);
      await clean(handle.exec);
      const uow = createUnitOfWork(handle.db, (tx) => {
        const db = requireDatabase(tx);
        return { ...placeholderStores(), bomLines: bomLineRepository(db), products: productRepository(db) };
      });
      const barrier = makeBarrier();
      const submit = (parts: readonly string[]) => uow.run(async (tx) => {
        barrier.arrive();
        await barrier.wait();
        await tx.bomLines.replace('X10-BOM', parts.map((part) => line(part)));
      });
      await Promise.all([submit(['A1', 'A2', 'A3']), submit(['B1', 'B2', 'B3'])]);
      const parts = await partCodes(handle.exec);
      expect(parts).toHaveLength(3);
      expect([['A1', 'A2', 'A3'], ['B1', 'B2', 'B3']]).toContainEqual(parts);
    } finally {
      await clean(handle.exec);
      await handle.close();
    }
  });

  pgIt('两个并发商品档案提交同一 barcode，一个成功一个明确状态冲突', async () => {
    if (url === undefined) throw new Error('需要 DATABASE_URL');
    const handle = await createDb({ driver: 'pg', url });
    try {
      await migrate(handle.exec);
      await clean(handle.exec);
      const uow = createUnitOfWork(handle.db, (tx) => {
        const db = requireDatabase(tx);
        return { ...placeholderStores(), bomLines: bomLineRepository(db), products: productRepository(db) };
      });
      const barrier = makeBarrier();
      const submit = (id: string) => uow.run(async (tx) => {
        barrier.arrive();
        await barrier.wait();
        await tx.products.save(product(id));
      });
      const settled = await Promise.allSettled([submit('x10-product-a'), submit('x10-product-b')]);
      expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
      const rejected = settled.filter((item) => item.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.status === 'rejected' ? rejected[0].reason : undefined).toBeInstanceOf(StateConflictError);
      const count = await handle.exec("select count(*)::int as total from products where barcode_raw = 'X10-PRODUCT'");
      expect(rowsOf(count)[0]?.total).toBe(1);
    } finally {
      await clean(handle.exec);
      await handle.close();
    }
  });
});

function line(part: string): BomLine {
  return {
    productBarcodeRaw: 'X10-BOM',
    productName: '并发产品',
    reorderCount: null,
    cumulativeQty: null,
    partCodeRaw: part,
    partName: part,
    importBatchId: entityId('x10-batch'),
    rowNo: 1,
    mergedFill: false,
  };
}

function product(id: string) {
  return {
    id: productId(id),
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    barcodeRaw: 'X10-PRODUCT',
    barcodeBase: 'X10-PRODUCT',
    filingName: null,
    spuKey: null,
    filingNo: null,
    skuName: '并发产品',
    netContent: null,
    casePack: null,
    outerSize: null,
    productLine: null,
    fieldSources: {},
    importBatchId: null,
    rowNo: null,
    editedBy: null,
    editedAt: null,
  };
}

async function clean(exec: (statement: string) => Promise<unknown>): Promise<void> {
  await exec("delete from bom_lines where product_barcode_raw = 'X10-BOM'");
  await exec("delete from products where barcode_raw = 'X10-PRODUCT'");
}

async function partCodes(exec: (statement: string) => Promise<unknown>): Promise<string[]> {
  const result = await exec("select part_code_raw from bom_lines where product_barcode_raw = 'X10-BOM' order by part_code_raw");
  return rowsOf(result).flatMap((row) => (typeof row.part_code_raw === 'string' ? [row.part_code_raw] : [])).sort();
}

function makeBarrier(): { arrive(): void; wait(): Promise<void> } {
  let arrived = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return {
    arrive() {
      arrived += 1;
      if (arrived === 2) release();
    },
    wait: () => gate,
  };
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  const list: unknown[] = candidate.rows;
  return list.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
