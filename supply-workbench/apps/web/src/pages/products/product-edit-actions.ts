import { ProductOverviewSchema, type ProductOverview } from '@sw/contracts';
import { apiErrorMessage, apiSend, apiUpload } from '../../shared/api/client.js';
import { contactErrors, hideErrors, uploadErrors } from '../../features/product-archive/index.js';
import type { UiNotice } from '../../shared/ui/notice.js';

export type ProductEditMutationState = {
  readonly id: string;
  readonly setEdited: (edited: boolean) => void;
  readonly setOverview: (overview: ProductOverview) => void;
  readonly setMessage: (message: UiNotice) => void;
};

export async function saveSku(fields: {
  readonly input: ProductEditMutationState;
  readonly sku: string;
  readonly undoTo: string | null;
  readonly setPrevious: (value: string | null) => void;
  readonly setSku: (value: string) => void;
}) {
  try {
    const overview = await apiSend({
      path: `/api/v1/products/${encodeURIComponent(fields.input.id)}`,
      method: 'PATCH',
      body: { skuName: fields.sku },
      schema: ProductOverviewSchema,
    });
    fields.setPrevious(fields.undoTo);
    fields.input.setOverview(overview);
    fields.setSku(overview.product.skuName.value ?? fields.sku);
    fields.input.setEdited(true);
    fields.input.setMessage({ kind: 'info', text: '名称已保存' });
  } catch (error) {
    reportMutationError({ setMessage: fields.input.setMessage, error, fallback: '名称没有保存。' });
  }
}

export async function uploadImage(input: {
  readonly id: string;
  readonly file: File;
  readonly setOverview: (overview: ProductOverview) => void;
  readonly setMessage: (message: UiNotice) => void;
}) {
  const errors = uploadErrors({ type: input.file.type, size: input.file.size });
  if (errors.length > 0) {
    input.setMessage({ kind: 'error', text: errors.join('；') });
    return;
  }
  const body = new FormData();
  body.set('slot', 'inner');
  body.set('file', input.file);
  try {
    input.setOverview(
      await apiUpload({
        path: `/api/v1/products/${encodeURIComponent(input.id)}/images`,
        body,
        schema: ProductOverviewSchema,
      }),
    );
    input.setMessage({ kind: 'info', text: '图片已上传' });
  } catch (error) {
    if (apiErrorMessage(error) === undefined) throw error;
    input.setMessage({ kind: 'error', text: '图片没有传上去。' });
  }
}

export async function hideImage(input: {
  readonly id: string;
  readonly imageId: string;
  readonly reason: string;
  readonly setOverview: (overview: ProductOverview) => void;
  readonly setMessage: (message: UiNotice) => void;
}) {
  const errors = hideErrors(input.reason);
  if (errors.length > 0) {
    input.setMessage({ kind: 'error', text: errors.join('；') });
    return;
  }
  try {
    input.setOverview(
      await apiSend({
        path: `/api/v1/products/${encodeURIComponent(input.id)}/images/${encodeURIComponent(input.imageId)}/hide`,
        method: 'POST',
        body: { reason: input.reason },
        schema: ProductOverviewSchema,
      }),
    );
    input.setMessage({ kind: 'info', text: '已隐藏' });
  } catch (error) {
    reportMutationError({ setMessage: input.setMessage, error, fallback: '图片没有隐藏。' });
  }
}

export async function unhideImage(input: {
  readonly id: string;
  readonly imageId: string;
  readonly setOverview: (overview: ProductOverview) => void;
  readonly setMessage: (message: UiNotice) => void;
}) {
  try {
    input.setOverview(
      await apiSend({
        path: `/api/v1/products/${encodeURIComponent(input.id)}/images/${encodeURIComponent(input.imageId)}/unhide`,
        method: 'POST',
        body: {},
        schema: ProductOverviewSchema,
      }),
    );
    input.setMessage({ kind: 'info', text: '已恢复' });
  } catch (error) {
    reportMutationError({ setMessage: input.setMessage, error, fallback: '图片没有恢复。' });
  }
}

export async function saveContact(input: {
  readonly id: string;
  readonly userId: string;
  readonly nameRaw: string;
  readonly setOverview: (overview: ProductOverview) => void;
  readonly setMessage: (message: UiNotice) => void;
}) {
  const errors = contactErrors({ userId: input.userId, nameRaw: input.nameRaw });
  if (errors.length > 0) {
    input.setMessage({ kind: 'error', text: errors.join('；') });
    return;
  }
  const person = input.userId === '' ? { nameRaw: input.nameRaw } : { userId: input.userId };
  try {
    input.setOverview(
      await apiSend({
        path: `/api/v1/products/${encodeURIComponent(input.id)}/contacts`,
        method: 'PUT',
        body: { role: 'purchasing', people: [person] },
        schema: ProductOverviewSchema,
      }),
    );
    input.setMessage({ kind: 'info', text: '联系人已保存' });
  } catch (error) {
    reportMutationError({ setMessage: input.setMessage, error, fallback: '联系人没有保存。' });
  }
}

function reportMutationError(input: {
  readonly setMessage: (message: UiNotice) => void;
  readonly error: unknown;
  readonly fallback: string;
}): void {
  const message = apiErrorMessage(input.error);
  if (message === undefined) throw input.error;
  input.setMessage({ kind: 'error', text: message || input.fallback });
}
