import { Alert, Button, DatePicker, Form, Input, Select, Space } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ProductDevelopment, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { DEVELOPMENT_DESTINATION_LABELS, DEVELOPMENT_DESTINATIONS, PRODUCT_DEVELOPMENT_STORES, type DevelopmentDestination, type ProductDevelopmentStore } from '@sw/domain';
import { canSetStatus, workItemStatusLabel, type WorkItemStatus } from '../../features/today/index.js';
import { apiErrorMessage } from '../../shared/api/client.js';
import { saveDevelopmentNode, saveDevelopmentProject, saveDevelopmentReply, updateDevelopmentNode } from './product-development-api.js';
import { storeLabels } from './store-query.js';

export type Saved = (id: string) => void;
type Users = ProductDevelopment['users'];

export function useDevelopmentSave(onSaved: Saved) {
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  async function save(run: () => Promise<{ readonly id: string }>) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await run();
      if (active.current) onSaved(result.id);
    } catch (failure: unknown) {
      if (active.current) setError(apiErrorMessage(failure) ?? '保存失败，请重试');
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }
  return { isSaving, error, save };
}

type ProjectFields = { readonly title: string; readonly store: ProductDevelopmentStore; readonly productLeadUserId: string };

export function ProjectForm({ users, store, saved, autoFocus = true }: {
  readonly users: Users; readonly store: ProductDevelopmentStore | 'all'; readonly saved: Saved; readonly autoFocus?: boolean;
}): ReactNode {
  const [id] = useState(() => crypto.randomUUID());
  const form = useDevelopmentSave(saved);
  return <Form<ProjectFields> name="development-create-project" layout="vertical" initialValues={store === 'all' ? {} : { store }}
    onFinish={(fields) => void form.save(() => saveDevelopmentProject({ ...fields, id }))}>
    <Form.Item name="title" label="项目名称" rules={[{ required: true, whitespace: true }]}>
      <Input maxLength={120} autoFocus={autoFocus} />
    </Form.Item>
    <Form.Item name="store" label="所属店铺" rules={[{ required: true }]}>
      <Select options={PRODUCT_DEVELOPMENT_STORES.map((value) => ({ value, label: storeLabels[value] }))} />
    </Form.Item>
    <Form.Item name="productLeadUserId" label="主责产品人员" rules={[{ required: true }]}>
      <Select options={userOptions(users.filter((user) => user.canLead))} />
    </Form.Item>
    <SaveButton isSaving={form.isSaving} error={form.error} label="建立项目" />
  </Form>;
}

type SchedulingFields = {
  readonly plannedStart: Dayjs;
  readonly plannedEnd: Dayjs;
  readonly ownerUserId: string;
  readonly buyerUserId?: string;
};
type NodeInput = SchedulingFields & { readonly title: string; readonly destination: DevelopmentDestination };
type PlanInput = SchedulingFields & { readonly status: WorkItemStatus };

function assignment(fields: SchedulingFields) {
  return {
    plannedStart: fields.plannedStart.format('YYYY-MM-DD'), plannedEnd: fields.plannedEnd.format('YYYY-MM-DD'),
    ownerUserId: fields.ownerUserId, buyerUserId: fields.buyerUserId ?? null,
  };
}

export function NodeForm({ users, project, businessDate, saved }: {
  readonly users: Users; readonly project: ProductDevelopmentProject; readonly businessDate: string; readonly saved: Saved;
}): ReactNode {
  const [id] = useState(() => crypto.randomUUID());
  const form = useDevelopmentSave(saved);
  return <Form<NodeInput> name="development-create-node" layout="vertical"
    initialValues={{ plannedStart: dayjs(businessDate), ownerUserId: project.productLeadUserId }}
    onFinish={(fields) => void form.save(() => saveDevelopmentNode({
      ...assignment(fields), id, projectId: project.id, title: fields.title, destination: fields.destination,
    }))}>
    <Form.Item name="title" label="节点名称" rules={[{ required: true, whitespace: true }]}>
      <Input maxLength={120} autoFocus />
    </Form.Item>
    <Form.Item name="destination" label="交付目的" rules={[{ required: true }]}>
      <Select options={DEVELOPMENT_DESTINATIONS.map((value) => ({ value, label: DEVELOPMENT_DESTINATION_LABELS[value] }))} />
    </Form.Item>
    <SchedulingFormFields users={users} />
    <SaveButton isSaving={form.isSaving} error={form.error} label="建立节点" />
  </Form>;
}

export function NodePlanForm({ users, node, saved }: { readonly users: Users; readonly node: ProductDevelopmentNode; readonly saved: Saved }): ReactNode {
  const form = useDevelopmentSave(saved);
  const initialValues = {
    ownerUserId: node.ownerUserId, buyerUserId: node.buyerUserId, status: node.status,
    plannedStart: dayjs(node.plannedStart), plannedEnd: dayjs(node.plannedEnd),
  };
  const statuses = ['planned', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
  return <Form<PlanInput> name="development-node-plan" layout="vertical" initialValues={initialValues}
    onFinish={(fields) => void form.save(() => updateDevelopmentNode({
      ...assignment(fields), projectId: node.projectId, nodeId: node.id, status: fields.status, expectedVersion: node.version,
    }))}>
    <Form.Item name="status" label="节点状态" rules={[{ required: true }]}>
      <Select options={statuses.filter((value) => value === node.status || canSetStatus(node.status, value))
        .map((value) => ({ value, label: workItemStatusLabel(value) }))} />
    </Form.Item>
    <SchedulingFormFields users={users} />
    <SaveButton isSaving={form.isSaving} error={form.error} label="保存节点计划" />
  </Form>;
}

function SchedulingFormFields({ users }: { readonly users: Users }): ReactNode {
  return <>
    <Form.Item name="ownerUserId" label="节点负责人" rules={[{ required: true }]}>
      <Select options={userOptions(users)} />
    </Form.Item>
    <Form.Item name="buyerUserId" label="跟进采购">
      <Select allowClear options={userOptions(users.filter((user) => user.canBuy))} />
    </Form.Item>
    <Space wrap align="start">
      <Form.Item name="plannedStart" label="计划开始日" rules={[{ required: true }]}>
        <DatePicker format="YYYY-MM-DD" />
      </Form.Item>
      <Form.Item name="plannedEnd" label="要求日期" rules={[{ required: true }]}>
        <DatePicker format="YYYY-MM-DD" />
      </Form.Item>
    </Space>
  </>;
}

type ReplyFields = { readonly promisedOn: Dayjs; readonly evidence: string };

export function ReplyForm({ node, saved }: { readonly node: ProductDevelopmentNode; readonly saved: Saved }): ReactNode {
  const [id] = useState(() => crypto.randomUUID());
  const form = useDevelopmentSave(saved);
  return <Form<ReplyFields> name="development-node-reply" layout="vertical" onFinish={(fields) => void form.save(() => saveDevelopmentReply({
    id, projectId: node.projectId, nodeId: node.id, promisedOn: fields.promisedOn.format('YYYY-MM-DD'), evidence: fields.evidence,
  }))}>
    <Form.Item label="供应商承诺日期" name="promisedOn" rules={[{ required: true }]}>
      <DatePicker format="YYYY-MM-DD" />
    </Form.Item>
    <Form.Item label="回复和凭据" name="evidence" rules={[{ required: true, whitespace: true }]}>
      <Input.TextArea rows={3} maxLength={1000} />
    </Form.Item>
    <SaveButton isSaving={form.isSaving} error={form.error} label="保存采购回复" />
  </Form>;
}

function userOptions(users: Users) {
  return users.map((user) => ({ value: user.id, label: user.name }));
}

export function SaveButton({ isSaving, error, label, disabled }: {
  readonly isSaving: boolean; readonly error: string; readonly label: string; readonly disabled?: boolean;
}): ReactNode {
  return <Space orientation="vertical" style={{ display: 'flex' }}>
    {error === '' ? null : <Alert title={error} type="error" showIcon />}
    <Button type="primary" htmlType="submit" disabled={disabled === true} loading={isSaving}>{label}</Button>
  </Space>;
}
