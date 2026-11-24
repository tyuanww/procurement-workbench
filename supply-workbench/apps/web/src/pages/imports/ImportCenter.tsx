import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, Button, Collapse, Flex, Form, Select, Typography, Upload } from 'antd';
import { DetectResponseSchema, ImportBatchSummarySchema, type DetectResponse } from '@sw/contracts';
import type { TemplateId } from '@sw/domain';
import { ApiError, apiErrorMessage, apiSend, apiUpload } from '../../shared/api/client.js';
import { canSubmitImport, recommendedTemplate, selectedTemplate, templateNeedsFactory, type ImportTypeChoice } from '../../features/imports/index.js';
import { ImportDetectionDetails, ImportTypeChoices } from './import-type-choice.js';
import { useCanWrite } from '../../shared/actor.js';
import { loadPartyOptions } from '../../features/master-data/index.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';
import { ImportBatchHistory } from './ImportBatchHistory.js';

type FactoryLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly items: readonly { readonly id: string; readonly displayName: string }[]; readonly total: number };

type DetectLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly fileName: string }
  | { readonly kind: 'ready'; readonly fileName: string; readonly generation: number; readonly value: DetectResponse }
  | { readonly kind: 'failed'; readonly fileName: string; readonly message: string };

export function ImportCenter() {
  const canImport = useCanWrite('imports.write');
  return (
    <WorkbenchPage title="导入中心">
      {canImport ? <ImportUploadForm /> : null}
      <ImportBatchHistory />
    </WorkbenchPage>
  );
}

// eslint-disable-next-line max-lines-per-function, complexity
function ImportUploadForm() {
  const navigate = useNavigate();
  const canWriteRecords = useCanWrite('records.write');
  const [detectLoad, setDetectLoad] = useState<DetectLoad>({ kind: 'idle' });
  const [manualChoice, setManualChoice] = useState<TemplateId | null>(null);
  const [factoryPartyId, setFactoryPartyId] = useState('');
  const [factories, setFactories] = useState<FactoryLoad>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [isStarting, setStarting] = useState(false);
  const generation = useRef(0);
  const detected = detectLoad.kind === 'ready' ? detectLoad.value : null;
  const choice: ImportTypeChoice = manualChoice === null
    ? recommendedTemplate(detected?.candidates ?? [])
    : { kind: 'selected', template: manualChoice };
  const chosen = selectedTemplate(choice);
  const shouldAskFactory = chosen !== null && templateNeedsFactory(chosen);
  const isArrivalBlocked = chosen === 'batch-confirmed-arrival-v1' && !canWriteRecords;
  const canStart = detected !== null && !isArrivalBlocked && canSubmitImport({
    choice,
    candidates: detected.candidates,
    factoryPartyId: factoryPartyId === '' ? null : factoryPartyId,
  });
  useEffect(() => {
    if (!shouldAskFactory) {
      setFactories({ kind: 'idle' });
      return undefined;
    }
    let isActive = true;
    void readFactories({
      isCurrent: () => isActive,
      setFactories,
      setFactoryPartyId,
    });
    return () => { isActive = false; };
  }, [shouldAskFactory]);
  const selectFile = (file: File) => {
    if (isStarting) return;
    const nextGeneration = generation.current + 1;
    generation.current = nextGeneration;
    setDetectLoad({ kind: 'loading', fileName: file.name });
    setManualChoice(null);
    setFactoryPartyId('');
    setFactories({ kind: 'idle' });
    setError('');
    void detect({
      file,
      generation: nextGeneration,
      isCurrent: () => generation.current === nextGeneration,
      setDetectLoad,
    });
  };
  return (
    <>
      <div id="import-file" tabIndex={-1}>
        <SectionGroup title="选择文件" meta="支持 CSV 和 XLSX">
          <FilePick fileName={detectLoad.kind === 'idle' ? null : detectLoad.fileName} isStarting={isStarting} onFile={selectFile} />
        </SectionGroup>
      </div>
      <SectionGroup title="解析设置">
        <DetectStatus load={detectLoad} />
        {detected === null ? null : (
          <DetectResult detected={detected} choice={choice} disabled={isStarting} onChoose={(template) => {
            setManualChoice(template);
            setFactoryPartyId('');
          }} factoryPartyId={factoryPartyId} factories={factories} onFactory={setFactoryPartyId} />
        )}
        {isArrivalBlocked ? <Alert type="info" title="请由采购或管理员导入采购确认到货日。" /> : null}
        <Flex gap={space[2]} wrap style={{ marginTop: space[2] }}>
          <Button type="primary" loading={isStarting} disabled={!canStart || isStarting} onClick={() => {
            if (detectLoad.kind !== 'ready' || detectLoad.generation !== generation.current || chosen === null || !canStart || isStarting) return;
            setStarting(true);
            setError('');
            void start({ detected: detectLoad.value, template: chosen, factoryPartyId, navigate, setError }).finally(() => setStarting(false));
          }}>开始解析</Button>
          <Button href="/api/v1/templates/po-master-v1.xlsx">下载采购订单总表模板</Button>
          <Button href="/api/v1/templates/factory-progress-v1.xlsx">下载代工厂空白模板 v1</Button>
        </Flex>
        {error === '' ? null : <Alert type="error" showIcon title={error} />}
        {detected === null ? null : <ImportDetectionDetails candidates={detected.candidates} />}
      </SectionGroup>
    </>
  );
}

function DetectStatus({ load }: { readonly load: DetectLoad }) {
  if (load.kind === 'idle') return <Typography.Text type="secondary">上传文件后查看识别结果。</Typography.Text>;
  if (load.kind === 'loading') return <Typography.Text type="secondary" role="status">正在识别文件…</Typography.Text>;
  if (load.kind === 'failed') return <Alert type="error" showIcon title={load.message} />;
  return null;
}

function FilePick(props: { readonly fileName: string | null; readonly isStarting: boolean; readonly onFile: (file: File) => void }) {
  return (
    <Upload.Dragger
      accept=".csv,.xlsx"
      maxCount={1}
      disabled={props.isStarting}
      showUploadList={false}
      beforeUpload={(file) => { props.onFile(file); return false; }}
    >
      <p className="ant-upload-text" style={{ overflowWrap: 'anywhere' }}>{props.fileName ?? '点击选择文件或拖到这里'}</p>
      {props.fileName === null ? null : <p className="ant-upload-hint">点击或拖入其他文件可更换</p>}
    </Upload.Dragger>
  );
}

function DetectResult(props: {
  readonly detected: DetectResponse;
  readonly choice: ImportTypeChoice;
  readonly disabled: boolean;
  readonly onChoose: (template: TemplateId) => void;
  readonly factoryPartyId: string;
  readonly factories: FactoryLoad;
  readonly onFactory: (value: string) => void;
}) {
  const chosen = selectedTemplate(props.choice);
  const shouldAskFactory = chosen !== null && templateNeedsFactory(chosen);
  return (
    <Form disabled={props.disabled} layout="vertical" style={{ maxWidth: 420 }}>
      <Form.Item label="导入类型" htmlFor="import-template" style={{ marginBottom: space[2] }}>
        <ImportTypeChoices candidates={props.detected.candidates} choice={props.choice} onChoose={props.onChoose} />
      </Form.Item>
      {shouldAskFactory ? (
        <Form.Item label="代工厂" htmlFor="import-factory" required style={{ marginBottom: space[2] }}>
          <FactorySelect factoryPartyId={props.factoryPartyId} factories={props.factories} onFactory={props.onFactory} />
          <FactoryGuidance />
        </Form.Item>
      ) : null}
    </Form>
  );
}

function FactoryGuidance() {
  const canReview = useCanWrite('master.review');
  const guidance = (
    <>
      {canReview ? (
        <p>有待审核的工厂名称时，可在别名审核中关联或新建代工厂。<Link to="/master">去主数据审核别名</Link></p>
      ) : <p>请把代工厂全名和文件名提供给主数据审核人，处理完成后再回到导入中心选择。</p>}
      <a href="#import-file">返回选择文件</a>
    </>
  );
  return <Collapse ghost size="small" items={[{ key: 'missing-factory', label: '找不到代工厂？', children: guidance }]} />;
}

export function FactorySelect(props: {
  readonly factoryPartyId: string;
  readonly factories: FactoryLoad;
  readonly onFactory: (value: string) => void;
}) {
  const ready = readyFactories(props.factories);
  return (
    <>
      {factoryError(props.factories)}
      <Select
        id="import-factory"
        aria-required="true"
        placeholder="选择代工厂"
        style={{ width: 160, maxWidth: '100%' }}
        loading={factoryLoading(props.factories)}
        value={factoryValue({ ready, factoryPartyId: props.factoryPartyId })}
        options={factoryOptions(ready)}
        onChange={props.onFactory}
      />
      {missingFactoryAlert(ready)}
    </>
  );
}

function readyFactories(value: FactoryLoad) {
  return value.kind === 'ready' ? value : undefined;
}

function factoryError(value: FactoryLoad) {
  return value.kind === 'failed' ? <Alert type="error" showIcon title={value.message ?? '代工厂没有读出来。'} /> : null;
}

function factoryLoading(value: FactoryLoad): boolean {
  return value.kind === 'loading' || value.kind === 'idle';
}

function factoryValue(input: { readonly ready: Extract<FactoryLoad, { readonly kind: 'ready' }> | undefined; readonly factoryPartyId: string }): string | null {
  if (input.ready === undefined || input.factoryPartyId === '') return null;
  return input.factoryPartyId;
}

function factoryOptions(ready: Extract<FactoryLoad, { readonly kind: 'ready' }> | undefined) {
  if (ready === undefined) return [];
  return ready.items.map((party) => ({ value: party.id, label: party.displayName }));
}

function missingFactoryAlert(ready: Extract<FactoryLoad, { readonly kind: 'ready' }> | undefined) {
  if (ready === undefined || ready.items.length >= ready.total) return null;
  return <Alert type="warning" title="还有代工厂没显示在这页" />;
}

async function readFactories(input: {
  readonly isCurrent: () => boolean;
  readonly setFactories: (value: FactoryLoad) => void;
  readonly setFactoryPartyId: (value: string) => void;
}): Promise<void> {
  if (!input.isCurrent()) return;
  input.setFactories({ kind: 'loading' });
  try {
    const loaded = await loadPartyOptions({ role: 'factory' });
    if (!input.isCurrent()) return;
    input.setFactories({ kind: 'ready', items: loaded.items, total: loaded.total });
  } catch (error) {
    if (!input.isCurrent()) return;
    input.setFactoryPartyId('');
    input.setFactories({ kind: 'failed', message: errorMessage(error, '代工厂没有读出来。') });
  }
}

async function detect(input: {
  readonly file: File;
  readonly generation: number;
  readonly isCurrent: () => boolean;
  readonly setDetectLoad: (value: DetectLoad) => void;
}) {
  const body = new FormData();
  body.set('file', input.file);
  try {
    const value = await apiUpload({ path: '/api/v1/imports/detect', body, schema: DetectResponseSchema });
    if (!input.isCurrent()) return;
    input.setDetectLoad({ kind: 'ready', fileName: input.file.name, generation: input.generation, value });
  } catch (error) {
    if (!input.isCurrent()) return;
    const message = errorMessage(error, '文件没有识别成功。请换一份 CSV 或 XLSX 再试。');
    input.setDetectLoad({ kind: 'failed', fileName: input.file.name, message });
  }
}

async function start(input: {
  readonly detected: DetectResponse;
  readonly template: TemplateId;
  readonly factoryPartyId: string;
  readonly navigate: (path: string) => void;
  readonly setError: (value: string) => void;
}) {
  const shouldSendFactory = templateNeedsFactory(input.template) && input.factoryPartyId !== '';
  try {
    const created = await apiSend({
      path: '/api/v1/imports',
      method: 'POST',
      body: {
        fileId: input.detected.fileId,
        template: input.template,
        ...(shouldSendFactory ? { factoryPartyId: input.factoryPartyId } : {}),
      },
      schema: ImportBatchSummarySchema,
    });
    input.navigate(`/imports/${created.id}`);
  } catch (error) {
    input.setError(errorMessage(error, '解析没有开始。请确认模板和代工厂后再试。'));
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return '网络或服务异常，请稍后重试。';
  const { details } = error;
  if (error.code === 'VALIDATION_FAILED' && typeof details === 'object' && details !== null && 'reason' in details && details.reason === 'file_unreadable') {
    return '无法解析文件。请更换文件，或从原系统重新导出 XLSX 后再上传。';
  }
  return apiErrorMessage(error) ?? fallback;
}
