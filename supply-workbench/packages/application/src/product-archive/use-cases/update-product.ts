import { DomainRuleViolation, applyProductEdit, type ProductPatch } from '@sw/domain';
import type { UpdateProduct, UpdateProductDeps } from '../boundary.js';
import type { UpdateProductInput } from '../views.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';

export const makeUpdateProduct =
  (deps: UpdateProductDeps): UpdateProduct =>
  async (input, actor) => {
    authorize(actor, 'products.maintain');
    rejectBarcode(input);
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.products.get(input.productId);
      const after = applyProductEdit({ current: before, patch: patchOf(input), editor: { by: actor.id, at } });
      await tx.products.save(after);
      await tx.audit.record(auditOf({ action: 'product.update', subject: after, ctx: { actor, at, before, after, entity: '产品' } }));
    });
    return { productId: input.productId };
  };

function rejectBarcode(input: UpdateProductInput): void {
  if (Object.hasOwn(input, 'barcodeRaw') || Object.hasOwn(input, 'barcodeBase')) {
    throw new DomainRuleViolation({ code: 'FIELD_OWNED_BY_IMPORT', message: '条码归导入所有', details: { field: 'barcodeRaw' } });
  }
}

function patchOf(input: UpdateProductInput): ProductPatch {
  const patch: ProductPatch = {};
  if (input.filingName !== undefined) patch.filingName = input.filingName;
  if (input.filingNo !== undefined) patch.filingNo = input.filingNo;
  if (input.skuName !== undefined) patch.skuName = input.skuName;
  if (input.netContent !== undefined) patch.netContent = input.netContent;
  if (input.casePack !== undefined) patch.casePack = input.casePack;
  if (input.outerSize !== undefined) patch.outerSize = input.outerSize;
  if (input.productLine !== undefined) patch.productLine = input.productLine;
  return patch;
}
