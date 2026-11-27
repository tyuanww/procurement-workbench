import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Flex, Form, Typography } from 'antd';
import { LocalDateSchema, type BatchView } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { saveSupplierPromise, useCanEditSupplierPromise } from '../../features/plan/index.js';
import { apiErrorMessage } from '../../shared/api/client.js';
import { RecordDatePicker } from '../../shared/ui/record-date-picker.js';
import { space } from '../../theme/tokens.js';

export function InlineSupplierPromise({ batch, onChanged }: {
  readonly batch: BatchView; readonly onChanged: () => void;
}) {
  const [view, setView] = useState<'read' | 'edit' | 'saved'>('read');
  const [isSaving, setSaving] = useState(false);
  const canEdit = useCanEditSupplierPromise(batch);
  const id = useId();
  const shouldRestore = useRef(false);
  const isEditing = view === 'edit' && canEdit;
  const date = batch.dateSupplierPromised;

  useEffect(() => {
    if (isEditing || isSaving || !shouldRestore.current) return;
    shouldRestore.current = false;
    document.getElementById(id)?.focus();
  }, [id, isEditing, isSaving]);

  function close(next: 'read' | 'saved') {
    shouldRestore.current = true;
    setView(next);
  }

  return <>
    <PromiseValue date={date} control={canEdit && !isEditing ? <Button id={id} type="link" disabled={isSaving}
      className="procurement-batch-promise-trigger" onClick={() => setView('edit')}>{date === null ? '登记承诺日' : '修改承诺日'}</Button> : null} />
    {isEditing ? <PromiseForm batchId={batch.id} date={date} isSaving={isSaving} setSaving={setSaving}
      onCancel={() => close('read')} onSaved={() => { close('saved'); onChanged(); }} /> : null}
    {view === 'saved' ? <Typography.Text type="secondary" role="status">已保存承诺日</Typography.Text> : null}
  </>;
}

function PromiseValue({ date, control }: { readonly date: LocalDate | null; readonly control: React.ReactNode }) {
  return <Flex align="center" wrap="wrap" className="procurement-batch-promise-row">
    <Typography.Text type="secondary" className="procurement-batch-promise-label">供应商承诺日</Typography.Text>
    {date === null ? <Typography.Text type="secondary">未登记</Typography.Text> : <time dateTime={date}>{date}</time>}
    {control}
  </Flex>;
}

type FormState = { readonly kind: 'invalid' | 'unchanged' } | { readonly kind: 'ready'; readonly value: LocalDate | null };

function validateDraft(draft: string, date: LocalDate | null): FormState {
  if (draft === (date ?? '')) return { kind: 'unchanged' };
  if (draft === '') return { kind: 'ready', value: null };
  const parsed = LocalDateSchema.safeParse(draft);
  return parsed.success ? { kind: 'ready', value: parsed.data } : { kind: 'invalid' };
}

type PromiseFormProps = {
  readonly batchId: BatchView['id']; readonly date: LocalDate | null;
  readonly isSaving: boolean; readonly setSaving: (isSaving: boolean) => void;
  readonly onCancel: () => void; readonly onSaved: () => void;
};

function PromiseForm({ batchId, date, isSaving, setSaving, onCancel, onSaved }: PromiseFormProps) {
  const id = useId();
  const [draft, setDraft] = useState<string>(date ?? '');
  const [error, setError] = useState('');
  const form = validateDraft(draft, date);
  useEffect(() => { document.getElementById(id)?.focus(); }, [id]);

  async function save() {
    if (form.kind !== 'ready' || isSaving) return;
    setSaving(true);
    setError('');
    try {
      await saveSupplierPromise({ batchId, date: form.value });
      onSaved();
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught) ?? '保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  }

  return <Form layout="vertical" className="procurement-batch-promise-editor" onFinish={() => { void save(); }}>
    {error === '' ? null : <Alert showIcon type="error" title={error} className="procurement-batch-form-error" />}
    <PromiseInput id={id} draft={draft} setDraft={setDraft} isInvalid={form.kind === 'invalid'} />
    <Flex gap={space[1]} justify="end" wrap="wrap">
      <Button onClick={onCancel}>取消</Button>
      <Button type="primary" htmlType="submit" disabled={form.kind !== 'ready'} loading={isSaving}>保存承诺日</Button>
    </Flex>
  </Form>;
}

function PromiseInput({ id, draft, setDraft, isInvalid }: {
  readonly id: string; readonly draft: string; readonly setDraft: (value: string) => void; readonly isInvalid: boolean;
}) {
  return <Form.Item htmlFor={id} label="供应商承诺日" validateStatus={isInvalid ? 'error' : ''}>
    <RecordDatePicker id={id} value={draft} onChange={setDraft} aria-invalid={isInvalid}
      aria-describedby={isInvalid ? `${id}-error` : undefined} />
    {isInvalid ? <Typography.Text id={`${id}-error`} type="danger">请输入有效的日期，格式为 YYYY-MM-DD。</Typography.Text> : null}
  </Form.Item>;
}
