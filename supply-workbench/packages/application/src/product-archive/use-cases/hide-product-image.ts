import type { HideProductImage, HideProductImageDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { NotFoundError, StateConflictError, ValidationFailedError } from '../../shared/errors.js';

export const makeHideProductImage =
  (deps: HideProductImageDeps): HideProductImage =>
  async (input, actor) => {
    authorize(actor, 'products.maintain');
    const reason = input.reason.trim();
    if (reason === '') throw new ValidationFailedError('隐藏要写原因');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const image = await tx.productImages.get(input.imageId);
      if (image.productId !== input.productId) throw new NotFoundError('产品图片', input.imageId);
      if (image.hiddenAt !== null) throw new StateConflictError('hidden');
      const after = { ...image, hiddenAt: at, hiddenBy: actor.id, hiddenReason: reason };
      await tx.productImages.save(after);
      await tx.audit.record(auditOf({ action: 'product.image-hide', subject: after, ctx: { actor, at, before: image, after, entity: '产品图片' } }));
    });
    return { imageId: input.imageId };
  };
