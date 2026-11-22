import { useState } from 'react';
import { Button, Form, Input, Typography } from 'antd';
import { FollowUpViewSchema } from '@sw/contracts';
import { apiSend } from '../../shared/api/client.js';
import { progressNote } from '../../features/progress/index.js';
import { useCanWrite } from '../../shared/actor.js';

export function ProgressNote(props: {
  readonly lineId: string;
  readonly saved: string;
  readonly draft: string;
  readonly onDraft: (text: string) => void;
  readonly onSaved: (text: string) => void;
  readonly onError: (message: string) => void;
}) {
  const canRecord = useCanWrite('records.write');
  const [isSaving, setSaving] = useState(false);
  if (!canRecord) return null;
  const submit = async () => {
    if (isSaving) return;
    setSaving(true);
    try {
      await saveNote({ lineId: props.lineId, draft: props.draft, onSaved: props.onSaved, onError: props.onError });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Form layout="inline" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }} onFinish={() => { void submit(); }}>
      {props.saved === '' ? null : <Typography.Text>{props.saved}</Typography.Text>}
      <Input disabled={isSaving} value={props.draft} placeholder={props.saved === '' ? '写一句进度' : props.saved} onChange={(event) => props.onDraft(event.target.value)} style={{ minWidth: 0, flex: '1 1 160px' }} />
      <Button htmlType="submit" loading={isSaving} disabled={isSaving}>记下进度</Button>
    </Form>
  );
}

async function saveNote(input: { readonly lineId: string; readonly draft: string; readonly onSaved: (text: string) => void; readonly onError: (message: string) => void }) {
  const note = progressNote(input.draft);
  if (note === null) {
    input.onError('进度说明不能为空');
    return;
  }
  try {
    await apiSend({ path: '/api/v1/follow-ups', method: 'POST', body: { orderLineId: input.lineId, kind: note.kind, text: note.text }, schema: FollowUpViewSchema });
    input.onSaved(note.text);
    input.onError('');
  } catch (caught) {
    input.onError(caught instanceof Error && caught.message !== '' ? caught.message : '进度没有记上');
  }
}
