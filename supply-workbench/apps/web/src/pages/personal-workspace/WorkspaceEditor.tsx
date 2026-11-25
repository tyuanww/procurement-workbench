import { Button, Drawer, Flex, Form, Input, Radio, Select } from 'antd';
import { useId, useLayoutEffect, type ReactNode } from 'react';
import { z } from 'zod';
import { drawerWidth, rowComfort, space } from '../../theme/tokens.js';
import { taskPriorityLabel, taskStatusLabel } from './TaskControls.js';
import type { PersonalEvent, PersonalTask, WorkspaceEntry } from './workspace-model.js';

type EditorProps = {
  readonly entry: WorkspaceEntry;
  readonly onSave: (entry: WorkspaceEntry) => void;
  readonly onClose: () => void;
};

const fieldStyle = { marginBlockEnd: space[3] };
const inputStyle = { minHeight: rowComfort, width: '100%', minWidth: 0 };
const titleRules = [{ required: true, whitespace: true, message: '请填写标题' }];

export function WorkspaceEditor({ entry, onSave, onClose }: EditorProps) {
  const formId = useId();
  const titleId = useId();
  useRestoreTriggerFocus();

  return (
    <Drawer
      open
      placement="right"
      size={drawerWidth}
      styles={{ wrapper: { maxWidth: '100%' } }}
      focusable={{ trap: true }}
      aria-labelledby={titleId}
      title={<span id={titleId}>{entry.kind === 'task' ? '编辑任务' : '编辑日程'}</span>}
      onClose={onClose}
      footer={(
        <Flex justify="flex-end" gap={space[1]}>
          <Button size="large" onClick={onClose}>取消</Button>
          <Button size="large" type="primary" htmlType="submit" form={formId}>保存</Button>
        </Flex>
      )}
    >
      <EditorFields entry={entry} onSave={onSave} identity={{ formId, titleId }} />
    </Drawer>
  );
}

function useRestoreTriggerFocus() {
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    if (!(trigger instanceof HTMLElement)) return;
    const panel = trigger.closest('.personal-task-panel');
    const id = trigger.dataset.workspaceEntry;
    return () => queueMicrotask(() => {
      if (document.activeElement !== document.body) return;
      if (trigger.isConnected && trigger.getClientRects().length > 0) {
        trigger.focus({ preventScroll: true });
        return;
      }
      if (!panel?.isConnected || id === undefined) return;
      const buttons = panel.querySelectorAll<HTMLElement>(`[data-workspace-entry="${CSS.escape(id)}"]`);
      const replacement = Array.from(buttons).find((button) => button.getClientRects().length > 0);
      const fallback = panel.querySelector<HTMLElement>('.personal-task-views input:checked');
      (replacement ?? fallback)?.focus({ preventScroll: true });
    });
  }, []);
}

type FormIdentity = { readonly formId: string; readonly titleId: string };
type FieldProps<Item> = {
  readonly item: Item;
  readonly onSave: (item: Item) => void;
  readonly identity: FormIdentity;
};

function EditorFields({ entry, identity, onSave }: Pick<EditorProps, 'entry' | 'onSave'> & { readonly identity: FormIdentity }) {
  switch (entry.kind) {
    case 'task': return <TaskFields item={entry.item} identity={identity} onSave={(item) => onSave({ kind: 'task', item })} />;
    case 'event': return <EventFields item={entry.item} identity={identity} onSave={(item) => onSave({ kind: 'event', item })} />;
  }
}

function EditorForm<Fields extends Record<string, unknown>>({ initialValues, onFinish, identity, children }: {
  readonly initialValues: Fields;
  readonly onFinish: (fields: Fields) => void;
  readonly identity: FormIdentity;
  readonly children: ReactNode;
}) {
  return (
    <Form<Fields> id={identity.formId} name={identity.formId} aria-labelledby={identity.titleId}
      noValidate layout="vertical" initialValues={initialValues} onFinish={onFinish}
      validateTrigger="onBlur" scrollToFirstError={{ focus: true }}>
      <Form.Item name="title" label="标题" rules={titleRules} style={fieldStyle}>
        <Input name="title" required style={inputStyle} />
      </Form.Item>
      {children}
    </Form>
  );
}

const priorityOptions = Object.entries(taskPriorityLabel).map(([value, label]) => ({ value, label }));
const statusOptions = Object.entries(taskStatusLabel).map(([value, label]) => ({ value, label }));
const taskDate = z.iso.date();
const dateRules = [
  { required: true, message: '请选择截止日期' },
  { validator: (_rule: unknown, value: string) => {
    if (taskDate.safeParse(value).success) return Promise.resolve();
    return Promise.reject(new Error('请选择有效的截止日期'));
  } },
];

function TaskFields({ item, onSave, identity }: FieldProps<PersonalTask>) {
  const priorityId = useId();
  const statusId = useId();

  return (
    <EditorForm initialValues={item} identity={identity} onFinish={(values) => onSave({ ...item, ...values, title: values.title.trim() })}>
      <Form.Item name="description" label="说明" style={fieldStyle}>
        <Input.TextArea name="description" rows={3} />
      </Form.Item>
      <Form.Item name="due" label="截止日期" rules={dateRules} validateFirst style={fieldStyle}>
        <Input name="due" type="date" required style={inputStyle} />
      </Form.Item>
      <Form.Item name="priority" label={<span id={priorityId}>优先级</span>} style={fieldStyle}>
        <Radio.Group aria-labelledby={priorityId} options={priorityOptions} />
      </Form.Item>
      <Form.Item name="status" label={<span id={statusId}>状态</span>} style={fieldStyle}>
        <Radio.Group aria-labelledby={statusId} options={statusOptions} />
      </Form.Item>
    </EditorForm>
  );
}

const timeRules = (label: string) => [
  { required: true, message: `请选择${label}` },
  { pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, message: `请选择有效的${label}` },
];

function EventFields({ item, onSave, identity }: FieldProps<PersonalEvent>) {
  return (
    <EditorForm initialValues={item} identity={identity} onFinish={(values) => onSave({
      ...item, ...values, title: values.title.trim(), category: values.category.trim(), location: values.location.trim(),
    })}>
      <Form.Item name="category" label="类型" style={fieldStyle}>
        <Select options={['会议', '任务', '提醒', '其他'].map((value) => ({ value, label: value }))} style={inputStyle} />
      </Form.Item>
      <Form.Item name="start" label="开始时间" rules={timeRules('开始时间')} validateFirst style={fieldStyle}>
        <Input name="start" type="datetime-local" required style={inputStyle} />
      </Form.Item>
      <Form.Item name="end" label="结束时间" dependencies={['start']}
        rules={[...timeRules('结束时间'), ({ getFieldValue }) => ({
          validator: (_rule, end: string) => {
            const start: unknown = getFieldValue('start');
            if (typeof start !== 'string' || end > start) return Promise.resolve();
            return Promise.reject(new Error('结束时间须晚于开始时间'));
          },
        })]} validateFirst style={fieldStyle}>
        <Input name="end" type="datetime-local" required style={inputStyle} />
      </Form.Item>
      <Form.Item name="location" label="地点" style={fieldStyle}>
        <Input name="location" style={inputStyle} />
      </Form.Item>
    </EditorForm>
  );
}
