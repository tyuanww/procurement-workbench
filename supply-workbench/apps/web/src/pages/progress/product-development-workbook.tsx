import { UploadOutlined } from '@ant-design/icons';
import { FileCard } from '@ant-design/x';
import { Alert, Button, Checkbox, Collapse, Descriptions, Drawer, Flex, Form, Select, Typography, Upload } from 'antd';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  CreateDevelopmentProjectSchema, type DevelopmentWorkbookCandidate, type DevelopmentWorkbookEvidence,
  type DevelopmentWorkbookPreview, type ProductDevelopment,
} from '@sw/contracts';
import { PRODUCT_DEVELOPMENT_STORES, type DevelopmentProjectStage, type ProductDevelopmentStore } from '@sw/domain';
import { apiErrorMessage } from '../../shared/api/client.js';
import { ContentTabs } from '../../shared/ui/view-switch.js';
import { drawerWide } from '../../theme/tokens.js';
import { previewDevelopmentWorkbook, saveDevelopmentProject } from './product-development-api.js';
import { ProjectForm, SaveButton, useDevelopmentSave, type Saved } from './product-development-forms.js';
import { developmentStages } from './product-development-workflow.js';
import { storeLabels } from './store-query.js';

type WorkbookProps = {
  readonly store: ProductDevelopmentStore | 'all';
  readonly data: ProductDevelopment;
  readonly onImported: Saved;
};

const conflicts = {
  duplicate_title: '同名记录，请对照原行',
  tab_stage_mismatch: '工作表名称与行内阶段不一致',
  hidden_row: '原表隐藏行，请确认是否有效',
  explicit_stage_conflict: '同行出现多个阶段',
};

export function DevelopmentProjectCreator({ store, data, onCreated }: Omit<WorkbookProps, 'onImported'> & {
  readonly onCreated: Saved;
}): ReactNode {
  const trigger = useRef<ComponentRef<typeof Button>>(null);
  const restoreFocus = useRef(false);
  const session = useRef(0);
  const [isOpen, setOpen] = useState(false);
  const [mode, setMode] = useState('workbook');
  useEffect(() => {
    if (isOpen || !restoreFocus.current) return;
    const frame = window.requestAnimationFrame(() => {
      restoreFocus.current = false;
      trigger.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const close = () => { session.current += 1; restoreFocus.current = true; setOpen(false); };
  const newProject = () => { setMode('workbook'); setOpen(true); };
  const currentSession = session.current;
  const saved: Saved = (id) => { if (currentSession === session.current) { setOpen(false); onCreated(id); } };
  return <>
    <Button ref={trigger} type="primary" icon={<UploadOutlined aria-hidden />} aria-haspopup="dialog" onClick={newProject}>新建新品项目</Button>
    <Drawer title="新建新品项目" open={isOpen} onClose={close} size={`min(${drawerWide}px, 100vw)`}
      destroyOnHidden focusable={{ trap: true, focusTriggerAfterClose: false }}>
      <ContentTabs aria-label="新建项目方式" activeKey={mode} onChange={(value) => { session.current += 1; setMode(value); }} animated={false} items={[
        { key: 'workbook', label: '从 Excel 导入', children: <WorkbookReview key={store} store={store} data={data} onImported={saved} /> },
        { key: 'manual', label: '手动新建', children: <ProjectForm key={store} store={store} users={data.users} saved={saved} autoFocus={false} /> },
      ]} />
    </Drawer>
  </>;
}

function WorkbookReview({ store, data, onImported }: WorkbookProps) {
  const [brand, setBrand] = useState<ProductDevelopmentStore | null>(store === 'all' ? null : store);
  const [workbook, setWorkbook] = useState<DevelopmentWorkbookPreview>();
  const [candidateId, setCandidate] = useState<string>();
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const candidate = workbook?.candidates.find(({ id }) => id === candidateId);

  async function load(file: File) {
    if (brand === null || isLoading) return;
    setError('');
    setWorkbook(undefined);
    setCandidate(undefined);
    setLoading(true);
    try {
      const result = await previewDevelopmentWorkbook(brand, file);
      setWorkbook(result);
      if (result.candidates.length === 1) setCandidate(result.candidates[0]?.id);
    } catch (error: unknown) {
      setError(apiErrorMessage(error) ?? '无法读取此工作簿，请检查格式后重试。');
    } finally {
      setLoading(false);
    }
  }
  return <div className="development-form-stack">
    <Typography.Text type="secondary">选择店铺并上传排期表。核对原表行后，可将该行保存为一个新品项目。</Typography.Text>
    <Flex align="center" wrap gap={8}>
      <Select aria-label="工作簿所属店铺" placeholder="选择所属店铺" value={brand} disabled={isLoading || store !== 'all'}
        options={PRODUCT_DEVELOPMENT_STORES.map((value) => ({ value, label: storeLabels[value] }))}
        onChange={(value) => { setBrand(value); setWorkbook(undefined); setCandidate(undefined); setError(''); }} />
      <Upload accept=".xlsx" disabled={brand === null || isLoading} maxCount={1} showUploadList={false}
        beforeUpload={(file) => { void load(file); return Upload.LIST_IGNORE; }}>
        <Button icon={<UploadOutlined aria-hidden />} loading={isLoading} disabled={brand === null}>{workbook === undefined ? '选择 Excel 文件' : '更换文件'}</Button>
      </Upload>
    </Flex>
    {error === '' ? null : <Alert title={error} type="error" showIcon />}
    {workbook === undefined ? null : <WorkbookResults {...{ workbook, candidate, data, onImported, setCandidate }} />}
  </div>;
}

function WorkbookResults({ workbook, candidate, data, onImported, setCandidate }: {
  readonly workbook: DevelopmentWorkbookPreview;
  readonly candidate: DevelopmentWorkbookCandidate | undefined;
  readonly data: ProductDevelopment;
  readonly onImported: Saved;
  readonly setCandidate: (value: string) => void;
}) {
  return <>
    <FileCard name={workbook.fileName} icon="excel" size="small" />
    <Typography.Text type="secondary" role="status">已读到 {workbook.candidates.length} 行候选项目</Typography.Text>
    {workbook.unidentifiedRows.length === 0 ? null : <Collapse size="small" items={[{
      key: 'unidentified',
      label: `${workbook.unidentifiedRows.length} 行无可识别项目名，查看原表位置`,
      children: workbook.unidentifiedRows.map(({ source }) => <div key={`${source.sheet}:${source.row}`}>{source.sheet} · 第 {source.row} 行</div>),
    }]} />}
    {workbook.candidates.length === 0 ? <Alert type="info" showIcon title="此工作簿暂无可核对的候选项目。" /> :
      <Select aria-label="选择要核对的原表行" placeholder="选择要核对的原表行" value={candidate?.id ?? null}
        onChange={setCandidate} showSearch={{ optionFilterProp: 'label' }}
        options={workbook.candidates.map(({ id, title, source }) => ({ value: id, label: `${title} · ${source.sheet} · 第 ${source.row} 行` }))} />}
    {candidate === undefined ? null : <CandidateReview key={candidate.id} candidate={candidate} workbook={workbook} data={data} onImported={onImported} />}
  </>;
}

function CandidateReview({ candidate, workbook, data, onImported }: {
  readonly candidate: DevelopmentWorkbookCandidate;
  readonly workbook: DevelopmentWorkbookPreview;
  readonly data: ProductDevelopment;
  readonly onImported: Saved;
}) {
  return <>
    <Descriptions size="small" column={1} title={candidate.title} items={[
      { key: 'sheet', label: '来源', children: `${candidate.source.sheet} · 第 ${candidate.source.row} 行` },
      { key: 'status', label: '原表阶段', children: candidate.stage === null ? '待确认' : developmentStages[candidate.stage] },
      ...evidenceItems(candidate),
    ]} />
    <Collapse size="small" items={[{ key: 'source', label: '查看原表单元格', children: <EvidenceRows evidence={candidate.evidence} /> }]} />
    {candidate.conflicts.length === 0 ? null : <Alert type="warning" showIcon
      title={candidate.conflicts.map(({ kind }) => conflicts[kind]).join('；')}
      description={<EvidenceRows evidence={candidate.conflicts.flatMap(({ evidence }) => evidence)} />} />}
    <ImportProjectForm {...{ candidate, workbook, data, onImported }} />
  </>;
}

function evidenceItems(candidate: DevelopmentWorkbookCandidate) {
  return [
    { key: 'contacts', label: '原表对接人', cell: candidate.contacts },
    { key: 'progress', label: '原表进度', cell: candidate.currentNote },
    { key: 'required', label: '项目要求', cell: candidate.required },
    { key: 'forecast', label: '原表预计', cell: candidate.forecast },
  ].map(({ key, label, cell }) => ({ key, label, children: cell?.displayText ?? '未填写' }));
}

function EvidenceRows({ evidence }: { readonly evidence: readonly DevelopmentWorkbookEvidence[] }) {
  return <dl className="development-evidence">
    {evidence.map((entry, index) => <div key={`${entry.sheet}:${entry.cell}:${index}`}>
      <dt>{entry.sheet}!{entry.cell} · {entry.label}</dt>
      <dd>{entry.displayText}
        {entry.rawValue === null || String(entry.rawValue) === entry.displayText ? null : <small>原值 {String(entry.rawValue)}</small>}
        {entry.date === undefined || entry.date === entry.displayText ? null : <small>识别日期 {entry.date}</small>}
        {entry.formula === undefined ? null : <small>公式 {entry.formula}</small>}
      </dd>
    </div>)}
  </dl>;
}

type ImportFields = { readonly owner: string; readonly stage: DevelopmentProjectStage | 'review'; readonly reviewed?: boolean };

function ImportProjectForm({ candidate, workbook, data, onImported }: {
  readonly candidate: DevelopmentWorkbookCandidate;
  readonly workbook: DevelopmentWorkbookPreview;
  readonly data: ProductDevelopment;
  readonly onImported: Saved;
}) {
  const form = useDevelopmentSave(onImported);
  const [inputError, setInputError] = useState('');
  const existing = data.projects.find((project) => project.store === candidate.store && project.id === candidate.id);
  const sameTitle = existing ?? data.projects.find((project) => project.store === candidate.store
    && project.title.trim().normalize('NFKC') === candidate.title.trim().normalize('NFKC'));
  if (sameTitle !== undefined) return <Alert title={existing === undefined ? '已有同名项目' : '这一行已导入'}
    description="请打开现有项目核对。" type="info" showIcon
    action={<Button onClick={() => onImported(sameTitle.id)}>打开项目</Button>} />;
  function save(fields: ImportFields) {
    const result = CreateDevelopmentProjectSchema.safeParse(importProject({ workbook, candidate, fields }));
    if (!result.success) {
      setInputError('这一行超出可保存的内容范围，请调整原表后重试。');
      return;
    }
    setInputError('');
    void form.save(() => saveDevelopmentProject(result.data));
  }
  return <Form<ImportFields> name="development-workbook-import" layout="vertical"
    initialValues={{ stage: candidate.conflicts.length === 0 ? candidate.stage ?? 'review' : 'review' }}
    onFinish={save}>
    <Form.Item name="owner" label="项目负责人" rules={[{ required: true, message: '请选择负责跟进的账号。' }]}>
      <Select showSearch={{ optionFilterProp: 'label' }} placeholder="从现有账号选择"
        options={data.users.filter(({ canLead }) => canLead).map(({ id, name }) => ({ value: id, label: name }))} />
    </Form.Item>
    <Form.Item name="stage" label="确认项目阶段" rules={[{ required: true }]}>
      <Select options={Object.entries(developmentStages).map(([value, label]) => ({ value, label }))} />
    </Form.Item>
    {candidate.conflicts.length > 0 ? <ImportReviewCheckbox /> : null}
    <SaveButton isSaving={form.isSaving} error={inputError || form.error} label="确认导入此项目" />
  </Form>;
}

function ImportReviewCheckbox() {
  return <Form.Item name="reviewed" valuePropName="checked"
    rules={[{ validator: async (_rule, value: unknown) => { if (value !== true) throw new Error('请先核对原表冲突。'); } }]}>
    <Checkbox>已核对原表冲突与所选阶段</Checkbox>
  </Form.Item>;
}

export function importProject({ workbook, candidate, fields }: {
  readonly workbook: DevelopmentWorkbookPreview;
  readonly candidate: DevelopmentWorkbookCandidate;
  readonly fields: ImportFields;
}) {
  const currentNote = nonblankText(candidate.currentNote);
  const contacts = nonblankText(candidate.contacts);
  const requirement = workbookDate(candidate.required);
  const forecast = workbookDate(candidate.forecast);
  return {
    id: candidate.id, title: candidate.title, store: candidate.store, productLeadUserId: fields.owner,
    progress: {
      confirmedStage: fields.stage === 'review' ? null : fields.stage,
      ...(currentNote === undefined ? {} : { currentNote }),
      ...(contacts === undefined ? {} : { contacts }),
      ...(requirement === undefined ? {} : { requirement }),
      ...(forecast === undefined ? {} : { forecast }),
      source: {
        fileName: workbook.fileName, sheet: candidate.source.sheet, row: candidate.source.row,
        cells: candidate.evidence.map(({ cell, label, rawValue, displayText, formula }) => ({
          address: cell, label, raw: rawValue === null ? '' : String(rawValue),
          ...(displayText === String(rawValue ?? '') ? {} : { display: displayText }),
          ...(formula === undefined ? {} : { formula }),
        })),
      },
    },
  };
}

function nonblankText(entry: DevelopmentWorkbookEvidence | null): string | undefined {
  const value = entry?.displayText;
  return value?.trim() ? value : undefined;
}

function workbookDate(entry: DevelopmentWorkbookEvidence | null) {
  const raw = nonblankText(entry);
  if (raw === undefined) return undefined;
  const date = entry?.date;
  return date === undefined ? { raw } : { raw, date };
}
