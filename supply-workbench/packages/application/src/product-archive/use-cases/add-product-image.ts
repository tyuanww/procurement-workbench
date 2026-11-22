import { ATTACHMENT_MAX_BYTES, entityId, type ProductImage } from '@sw/domain';
import type { AddProductImage, AddProductImageDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { FileTooLargeError, FileTypeNotAllowedError } from '../../shared/errors.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const makeAddProductImage =
  (deps: AddProductImageDeps): AddProductImage =>
  async (input, actor) => {
    authorize(actor, 'products.maintain');
    rejectFile(input.file);
    const at = deps.clock.now();
    const stored = await deps.files.put({ bytes: input.file.bytes, originalName: input.file.fileName, mime: input.file.mime });
    const imageId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      await tx.products.get(input.productId);
      const existing = await tx.productImages.listByProduct(input.productId);
      const image: ProductImage = {
        id: imageId,
        productId: input.productId,
        slot: input.slot,
        fileId: entityId(stored.sha256),
        order: existing.filter((row) => row.slot === input.slot).length,
        source: 'upload',
        importBatchId: null,
        uploadedBy: actor.id,
        hiddenAt: null,
        hiddenBy: null,
        hiddenReason: null,
      };
      await tx.productImages.save(image);
      await tx.audit.record(auditOf({ action: 'product.image-add', subject: image, ctx: { actor, at, entity: '产品图片' } }));
    });
    return { imageId };
  };

function rejectFile(file: { readonly bytes: Uint8Array; readonly mime: string }): void {
  if (file.bytes.byteLength > ATTACHMENT_MAX_BYTES) throw new FileTooLargeError('attachment');
  if (!IMAGE_TYPES.includes(file.mime)) throw new FileTypeNotAllowedError();
}
