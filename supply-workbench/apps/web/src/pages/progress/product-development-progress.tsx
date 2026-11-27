import { FileCard } from '@ant-design/x';
import { Card, Collapse, DatePicker, Descriptions, Form, Input, Select, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import {
  LocalDateSchema, type DevelopmentNodeFollowUpInput, type DevelopmentProjectProgress,
  type ProductDevelopmentNode, type ProductDevelopmentProject,
} from '@sw/contracts';
import type { DevelopmentProjectStage, LocalDate } from '@sw/domain';
import { TaskTagView } from '../../features/plan/index.js';
import { updateDevelopmentNode, updateDevelopmentProject } from './product-development-api.js';
import { SaveButton, useDevelopmentSave, type Saved } from './product-development-forms.js';
import {
  coordinationReasons, coordinationStatus, developmentNodeOwnerName, developmentProjectCoordination, developmentStages,
  displayedProjectStages, projectStage, registeredFollowUpFacts, type DevelopmentCoordination, type ProjectStage,
} from './product-development-workflow.js';

type FollowUpFields = {
  readonly nextAction?: string | undefined;
  readonly managementDecision?: string | undefined;
  readonly waitingKind?: DevelopmentNodeFollowUpInput['waiting']['kind'];
  readonly party?: string;
  readonly deliverable?: string;
  readonly reviewOn?: Dayjs | null;
};

function initialFollowUp(followUp: DevelopmentNodeFollowUpInput | undefined): FollowUpFields {
  const waiting = followUp?.waiting;
  return {
    nextAction: followUp?.nextAction,
    managementDecision: followUp?.managementDecision,
    waitingKind: waiting?.kind ?? 'unknown',
    ...(waiting?.kind === 'waiting' ? waiting : {}),
    reviewOn: followUp?.reviewOn === undefined ? null : dayjs(followUp.reviewOn),
  };
}

function toFollowUp(fields: FollowUpFields = {}): DevelopmentNodeFollowUpInput {
  const nextAction = fields.nextAction?.trim();
  const managementDecision = fields.managementDecision?.trim();
  const review = LocalDateSchema.safeParse(fields.reviewOn?.format('YYYY-MM-DD'));
  return {
    waiting: followUpWaiting(fields),
    ...(nextAction ? { nextAction } : {}),
    ...(managementDecision ? { managementDecision } : {}),
    ...(review.success ? { reviewOn: review.data } : {}),
  };
}

function followUpWaiting({ waitingKind, party, deliverable }: FollowUpFields): DevelopmentNodeFollowUpInput['waiting'] {
  if (waitingKind !== 'waiting') return { kind: waitingKind ?? 'unknown' };
  const name = party?.trim();
  const sought = deliverable?.trim();
  return { kind: 'waiting', ...(name ? { party: name } : {}), ...(sought ? { deliverable: sought } : {}) };
}

const waitingOptions = [
  { value: 'unknown', label: '等待方待核对' },
  { value: 'none', label: '无需等待' },
  { value: 'waiting', label: '正在等待' },
];

function FollowUpInputs() {
  const form = Form.useFormInstance();
  const kind = Form.useWatch(['followUp', 'waitingKind'], form);
  return <>
    <Form.Item name={['followUp', 'nextAction']} label="下一步">
      <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="填写实际要推进的事" />
    </Form.Item>
    <Form.Item name={['followUp', 'waitingKind']} label="等待情况"><Select options={waitingOptions} /></Form.Item>
    {kind !== 'waiting' ? null : <>
      <Form.Item name={['followUp', 'party']} label="等待方"><Input maxLength={120} placeholder="已知的人或团队" /></Form.Item>
      <Form.Item name={['followUp', 'deliverable']} label="等待什么"><Input maxLength={1000} /></Form.Item>
    </>}
    <Form.Item name={['followUp', 'reviewOn']} label="下次跟进日"><DatePicker format="YYYY-MM-DD" /></Form.Item>
    <Form.Item name={['followUp', 'managementDecision']} label="需要管理者决定" extra="选填。填写要管理者决定的具体事项。">
      <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
    </Form.Item>
  </>;
}

export function DevelopmentNodeFollowUpForm({ node, saved }: { readonly node: ProductDevelopmentNode; readonly saved: Saved }): ReactNode {
  const form = useDevelopmentSave(saved);
  return <Form<{ readonly followUp: FollowUpFields }> name="development-node-follow-up" layout="vertical"
    initialValues={{ followUp: initialFollowUp(node.followUp) }}
    onFinish={({ followUp }) => void form.save(() => updateDevelopmentNode({
      projectId: node.projectId, nodeId: node.id, expectedVersion: node.version, status: node.status,
      ownerUserId: node.ownerUserId, buyerUserId: node.buyerUserId, plannedStart: node.plannedStart, plannedEnd: node.plannedEnd,
      followUp: toFollowUp(followUp),
    }))}>
    <FollowUpInputs />
    <SaveButton {...form} label="保存跟进" />
  </Form>;
}

type ProjectProgressFields = {
  readonly stage: DevelopmentProjectStage | 'review';
  readonly currentNote?: string;
  readonly contacts?: string;
  readonly requirement?: string;
  readonly forecast?: string;
  readonly followUp?: FollowUpFields;
};

export function DevelopmentProjectProgressForm({ project, saved }: { readonly project: ProductDevelopmentProject; readonly saved: Saved }): ReactNode {
  const form = useDevelopmentSave(saved);
  const progress = project.progress;
  const initialValues = {
    stage: progress?.confirmedStage ?? 'review', currentNote: progress?.currentNote, contacts: progress?.contacts,
    requirement: progress?.requirement?.raw, forecast: progress?.forecast?.raw, followUp: initialFollowUp(progress?.followUp),
  };
  return <Form<ProjectProgressFields> name="development-project-progress" layout="vertical" initialValues={initialValues}
    onFinish={(fields) => void form.save(() => updateDevelopmentProject({
      projectId: project.id, expectedVersion: project.progressVersion ?? 0,
      progress: projectUpdate(fields, progress),
    }))}>
    <Form.Item name="stage" label="核对后的项目阶段" rules={[{ required: true }]}>
      <Select options={Object.entries(developmentStages).map(([value, label]) => ({ label, value }))} />
    </Form.Item>
    <Form.Item name="currentNote" label="进度备注"><Input.TextArea maxLength={32_767} autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
    <Form.Item name="contacts" label="原表对接人"><Input maxLength={32_767} /></Form.Item>
    <div className="development-progress-dates">
      <Form.Item name="requirement" label="项目要求"><Input maxLength={32_767} placeholder="YYYY-MM-DD 或原表说明" /></Form.Item>
      <Form.Item name="forecast" label="预计"><Input maxLength={32_767} placeholder="YYYY-MM-DD 或原表说明" /></Form.Item>
    </div>
    <FollowUpInputs />
    <SaveButton {...form} label="保存项目进度" />
  </Form>;
}

function projectUpdate(fields: ProjectProgressFields, previous: DevelopmentProjectProgress | undefined) {
  const requirement = enteredDate(fields.requirement, previous?.requirement);
  const forecast = enteredDate(fields.forecast, previous?.forecast);
  return {
    confirmedStage: fields.stage === 'review' ? null : fields.stage,
    ...(fields.currentNote?.trim() ? { currentNote: fields.currentNote } : {}),
    ...(fields.contacts?.trim() ? { contacts: fields.contacts } : {}),
    ...(requirement === undefined ? {} : { requirement }),
    ...(forecast === undefined ? {} : { forecast }),
    followUp: toFollowUp(fields.followUp),
  };
}

function enteredDate(raw: string | undefined, previous: DevelopmentProjectProgress['forecast']) {
  if (!raw?.trim()) return undefined;
  if (previous?.raw === raw) return previous;
  const parsed = LocalDateSchema.safeParse(raw.trim());
  return parsed.success ? { raw, date: parsed.data } : { raw };
}

export function DevelopmentFollowUpFacts({ followUp, colon = true }: {
  readonly followUp: DevelopmentNodeFollowUpInput | undefined; readonly colon?: boolean;
}): ReactNode {
  return <Descriptions column={1} size="small" colon={colon} className="development-project-facts"
    items={registeredFollowUpFacts(followUp).map((fact) => ({ key: fact.key, label: fact.label, children: <DevelopmentFollowUpValue fact={fact} /> }))} />;
}

export function DevelopmentFollowUpValue({ fact }: { readonly fact: ReturnType<typeof registeredFollowUpFacts>[number] }): ReactNode {
  return fact.key === 'review' ? <time dateTime={fact.value}>{fact.value}</time> : fact.value;
}

export function DevelopmentCoordinationTag({ item }: { readonly item: DevelopmentCoordination }): ReactNode {
  return <TaskTagView tag={{ ...coordinationStatus(item), key: item.decision.kind, fill: 'solid' }} />;
}

export function DevelopmentCoordinationNodeFacts({ node, item, compact = false }: {
  readonly node: ProductDevelopmentNode;
  readonly item: DevelopmentCoordination | null;
  readonly compact?: boolean;
}): ReactNode {
  const requirement = <span>项目要求日 <time dateTime={node.plannedEnd}>{node.plannedEnd}</time></span>;
  const owner = <span>节点负责人 {developmentNodeOwnerName(node)}</span>;
  const reasons = item === null ? null : coordinationReasons(item).map((reason) => <span key={reason}>{reason}</span>);
  const facts = registeredFollowUpFacts(item?.followUp);
  if (compact) return <CompactCoordinationFacts {...{ facts, owner, requirement, reasons }} />;
  return <span className="development-coordination-facts">
    {requirement}{owner}{reasons}
    {facts.map((fact) => <FollowUpFact key={fact.key} fact={fact} />)}
  </span>;
}

function CompactCoordinationFacts({ facts, owner, requirement, reasons }: {
  readonly facts: ReturnType<typeof registeredFollowUpFacts>;
  readonly owner: ReactNode;
  readonly requirement: ReactNode;
  readonly reasons: ReactNode;
}) {
  const action = facts.find(({ key }) => key === 'decision') ?? facts.find(({ key }) => key === 'next');
  const review = facts.find(({ key }) => key === 'review');
  const waiting = facts.find(({ key }) => key === 'waiting');
  return <span className="development-coordination-facts">
    {action === undefined ? null : <span className="development-node-action">{action.label} <DevelopmentFollowUpValue fact={action} /></span>}
    <span className="development-node-contact">{owner}{review === undefined ? null : <FollowUpFact fact={review} />}</span>
    {review === undefined ? requirement : null}
    {action?.key === 'decision' ? null : <>{reasons}{waiting === undefined ? null : <FollowUpFact fact={waiting} />}</>}
  </span>;
}

function FollowUpFact({ fact }: { readonly fact: ReturnType<typeof registeredFollowUpFacts>[number] }): ReactNode {
  return <span>{fact.label} <DevelopmentFollowUpValue fact={fact} /></span>;
}

export function DevelopmentProjectStageTag({ stage }: { readonly stage: ProjectStage }): ReactNode {
  const tone = stage === 'received' ? 'success' : stage === 'received-unverified' ? 'warning' : 'neutral';
  return <span className="development-stage-tag"><TaskTagView tag={{ key: stage, label: displayedProjectStages[stage], tone, fill: 'solid' }} /></span>;
}

export function DevelopmentProjectProgressCard({ project, today }: {
  readonly project: ProductDevelopmentProject;
  readonly today: LocalDate;
}): ReactNode {
  const source = project.progress?.source;
  const item = developmentProjectCoordination(project, today);
  return <Card size="small" title="项目进度" extra={<DevelopmentProjectStageTag stage={projectStage(project)} />}>
    {item === null ? null : <DevelopmentCoordinationTag item={item} />}
    {item === null ? null : coordinationReasons(item).map((reason) => <Typography.Paragraph key={reason}>{reason}</Typography.Paragraph>)}
    <ProjectProgressFacts progress={project.progress} />
    <DevelopmentFollowUpFacts followUp={project.progress?.followUp} />
    {source === undefined ? null : <ProjectProgressSource source={source} />}
  </Card>;
}

function ProjectProgressFacts({ progress }: { readonly progress: DevelopmentProjectProgress | undefined }) {
  const contacts = progress?.contacts;
  return <Descriptions column={1} size="small" className="development-project-facts" items={[
      { key: 'note', label: '进度备注', children: progress?.currentNote ?? '待补充' },
      { key: 'requirement', label: '项目要求', children: progress?.requirement?.raw ?? '未填写' },
      { key: 'forecast', label: '预计', children: progress?.forecast?.raw ?? '未填写' },
      { key: 'contacts', label: '原表对接人', children: contacts, hide: contacts === undefined },
    ].filter(({ hide }) => hide !== true)} />;
}

function ProjectProgressSource({ source }: { readonly source: NonNullable<DevelopmentProjectProgress['source']> }) {
  return <Collapse size="small" items={[{
      key: 'source', label: '核对 Excel 来源', children: <div className="development-form-stack">
        <FileCard size="small" icon="excel" name={source.fileName} />
        <Typography.Text type="secondary">{source.sheet} · 第 {source.row} 行</Typography.Text>
        <dl className="development-evidence">{source.cells.map(({ address, label, raw, display, formula }) => <div key={address}>
          <dt>{address} · {label}</dt><dd>{display ?? raw}{formula === undefined ? null : <small>公式 {formula}</small>}</dd>
        </div>)}</dl>
      </div>,
  }]} />;
}
