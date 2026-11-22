import type { HideProductImage, HideProductImageDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { NotFoundError, StateConflictError } from '../../shared/errors.js';

export const makeUnhideProductImage =
  (deps: HideProductImageDeps): HideProductImage =>
  async (input, actor) => {
    authorize(actor, 'products.maintain');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const image = await tx.productImages.get(input.imageId);
      if (image.productId !== input.productId) throw new NotFoundError('产品图片', input.imageId);
      if (image.hiddenAt === null) throw new StateConflictError('visible');
      const after = { ...image, hiddenAt: null, hiddenBy: null, hiddenReason: null };
      await tx.productImages.save(after);
      await tx.audit.record(auditOf({ action: 'product.image-unhide', subject: after, ctx: { actor, at, before: image, after, entity: '产品图片' } }));
    });
    return { imageId: input.imageId };
  };
