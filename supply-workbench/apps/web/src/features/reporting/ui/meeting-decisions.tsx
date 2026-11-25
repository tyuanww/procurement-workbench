import { Alert, DatePicker, Form, Input, Modal, Select, type FormInstance } from 'antd';
import { ManagementDecisionSchema, type ManagementDecision, type ManagementMeeting, type MeetingMaterial } from '@sw/contracts';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage, apiSend } from '../../../shared/api/client.js';

export const MEETING_PATH = '/api/v1/dashboard/management-meeting';

export type DecisionEditor =
  | { readonly kind: 'record'; readonly material: MeetingMaterial }
  | { readonly kind: 'complete'; readonly decision: ManagementDecision };

type Fields = {
  readonly decision?: string;
  readonly ownerId?: string;
  readonly dueDate?: Dayjs;
  readonly completionCriteria?: string;
  readonly evidence?: string;
};

const VALIDATION = [{ required: true, message: '请填写此项' }];

export function MeetingDecisionEditor({ editor, meeting, onClose, onSaved }: {
  readonly editor: DecisionEditor;
  readonly meeting: ManagementMeeting;
  readonly onClose: () => void;
  readonly onSaved: (decision: ManagementDecision) => void;
}) {
  const [form] = Form.useForm<Fields>();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function save(fields: Fields) {
    if (isPending) return;
    setPending(true);
    setError(undefined);
    try {
      const saved = await apiSend({ method: 'POST', schema: ManagementDecisionSchema, ...submission({ editor, meeting, fields }) });
      onSaved(saved);
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught) ?? '决定没有保存，请重试。');
    } finally {
      setPending(false);
    }
  }
  return <Modal
    open title={editor.kind === 'record' ? '记录周会决定' : '登记决定完成'}
    onOk={() => form.submit()} onCancel={onClose} confirmLoading={isPending} cancelButtonProps={{ disabled: isPending }}
    okText="保存" cancelText="取消"
  >
    {editor.kind === 'record' ? <p>{editor.material.name ?? editor.material.code ?? editor.material.materialLineId}</p> : <p>{editor.decision.decision}</p>}
    <DecisionForm form={form} editor={editor} meeting={meeting} save={save} />
    {error === undefined ? null : <Alert type="error" showIcon title={error} />}
  </Modal>;
}

function DecisionForm({ form, editor, meeting, save }: {
  readonly form: FormInstance<Fields>;
  readonly editor: DecisionEditor;
  readonly meeting: ManagementMeeting;
  readonly save: (fields: Fields) => Promise<void>;
}) {
  return <Form form={form} layout="vertical" onFinish={(fields) => void save(fields)}>
    {editor.kind === 'record' ? <>
      <Form.Item name="decision" label="决定" rules={VALIDATION}><Input.TextArea aria-label="决定" rows={2} /></Form.Item>
      <Form.Item name="ownerId" label="负责人" rules={VALIDATION}><Select aria-label="负责人" options={meeting.owners.map((user) => ({ value: user.id, label: user.name }))} /></Form.Item>
      <Form.Item name="dueDate" label="截止日" rules={VALIDATION}>
        <DatePicker aria-label="截止日" format="YYYY-MM-DD" disabledDate={(date) => date.format('YYYY-MM-DD') < meeting.weekStart} />
      </Form.Item>
      <Form.Item name="completionCriteria" label="完成标准或要核对的依据" rules={VALIDATION}><Input.TextArea aria-label="完成标准或要核对的依据" rows={2} /></Form.Item>
    </> : <Form.Item name="evidence" label="实际完成依据" rules={VALIDATION}><Input.TextArea aria-label="实际完成依据" rows={3} /></Form.Item>}
  </Form>;
}

function submission({ editor, meeting, fields }: { readonly editor: DecisionEditor; readonly meeting: ManagementMeeting; readonly fields: Fields }) {
  return editor.kind === 'complete'
    ? { path: `${MEETING_PATH}/decisions/${encodeURIComponent(editor.decision.id)}/complete`, body: { evidence: fields.evidence } }
    : {
      path: `${MEETING_PATH}/decisions`,
      body: {
        store: meeting.store, weekStart: meeting.weekStart, materialLineId: editor.material.materialLineId,
        decision: fields.decision, ownerId: fields.ownerId, dueDate: fields.dueDate?.format('YYYY-MM-DD'),
        completionCriteria: fields.completionCriteria,
      },
    };
}
