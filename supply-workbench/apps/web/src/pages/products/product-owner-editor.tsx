import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { PRODUCT_OWNER_NAME_MAX_LENGTH, SetProductOwnerResultSchema } from '@sw/contracts';
import { apiErrorMessage, apiSend } from '../../shared/api/client.js';

type OwnerNameFormProps = {
  readonly productId: string;
  readonly partCodeRaw: string;
  readonly ownerName: string | null;
  readonly isSaving: boolean;
  readonly onSavingChange: (isSaving: boolean) => void;
  readonly onSave: (ownerName: string | null) => void;
};

export function OwnerNameForm({ productId, partCodeRaw, ownerName, isSaving, onSavingChange, onSave }: OwnerNameFormProps) {
  const [feedback, setFeedback] = useState<{ readonly kind: 'success' | 'error'; readonly text: string } | null>(null);
  const [form] = Form.useForm<{ readonly ownerName: string }>();
  async function save(values: { readonly ownerName: string }) {
    if (isSaving) return;
    onSavingChange(true);
    setFeedback(null);
    try {
      const result = await apiSend({
        path: `/api/v1/products/${encodeURIComponent(productId)}/owner`,
        method: 'PUT',
        body: { partCodeRaw, ownerName: values.ownerName.trim() || null },
        schema: SetProductOwnerResultSchema,
      });
      form.setFieldValue('ownerName', result.ownerName ?? '');
      setFeedback({ kind: 'success', text: result.ownerName === null ? '已取消指定' : '负责人已保存' });
      onSave(result.ownerName);
    } catch (error) {
      setFeedback({ kind: 'error', text: apiErrorMessage(error) ?? '负责人没有保存，请重试。' });
    } finally {
      onSavingChange(false);
    }
  }
  return <Form form={form} layout="vertical" className="dossier-owner-form"
    initialValues={{ ownerName: ownerName ?? '' }} onFinish={save}>
    <Form.Item name="ownerName" label="负责人姓名" extra="清空姓名后保存，即可取消指定。">
      <Input autoComplete="off" maxLength={PRODUCT_OWNER_NAME_MAX_LENGTH} disabled={isSaving} />
    </Form.Item>
    {feedback?.kind === 'error' ? <Alert type="error" title={feedback.text} showIcon /> : null}
    <Button type="primary" htmlType="submit" loading={isSaving}>保存负责人</Button>
    {isSaving && <span role="status">正在保存负责人…</span>}
    {feedback?.kind === 'success' ? <span role="status">{feedback.text}</span> : null}
  </Form>;
}
