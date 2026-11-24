import { DownOutlined } from '@ant-design/icons';
import { Alert, Button, Dropdown, Grid } from 'antd';
import { useState, type CSSProperties } from 'react';
import { useCanWrite } from '../../../shared/actor.js';
import { HintBatchResultSchema, UpdatedCountSchema } from '@sw/contracts';
import { apiDownload, apiErrorMessage, apiSend } from '../../../shared/api/client.js';
import { hintSkipText, saveView } from '../../../features/follow-up/index.js';
import { brand, radius } from '../../../theme/tokens.js';
import { OwnerControls } from './owners.js';

type DeskWriters = {
  readonly onReload: () => void | Promise<void>;
  readonly setMessage: (message: string) => void;
};

async function assignLines(input: DeskWriters & {
  readonly lineIds: readonly string[];
  readonly buyerUserId: string;
}) {
  if (input.lineIds.length === 0 || input.buyerUserId === '') {
    input.setMessage('先勾选订单行，再选择负责人。');
    return;
  }
  try {
    await apiSend({
      path: '/api/v1/lines/bulk/assign',
      method: 'POST',
      body: { lineIds: input.lineIds, buyerUserId: input.buyerUserId },
      schema: UpdatedCountSchema,
    });
    input.setMessage(`已分配 ${input.lineIds.length} 行`);
    await input.onReload();
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    input.setMessage(message);
  }
}

export async function hintBatches(input: DeskWriters & {
  readonly lineIds: readonly string[];
  readonly setSkips: (lines: readonly string[]) => void;
}) {
  if (input.lineIds.length === 0) {
    input.setMessage('先勾选要生成批次的订单行。');
    return;
  }
  try {
    const result = await apiSend({
      path: '/api/v1/lines/bulk/hint-batches',
      method: 'POST',
      body: { lineIds: input.lineIds, includeCompleted: false },
      schema: HintBatchResultSchema,
    });
    input.setSkips(hintSkipText(result.skipped));
    input.setMessage(`新建 ${result.created} 个批次`);
    await input.onReload();
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    input.setMessage(message);
  }
}

export function saveCurrent(input: { readonly userId: string; readonly search: string; readonly label: string; readonly setMessage: (message: string) => void }): string | undefined {
  const id = input.label.trim();
  if (input.userId === '' || id === '') return undefined;
  saveView({ storage: window.localStorage, userId: input.userId, view: { id, label: id, query: input.search } });
  input.setMessage(`已保存视图 ${id}`);
  return id;
}

export function LineBulkBar(props: DeskWriters & {
  readonly users: readonly { readonly id: string; readonly name: string }[];
  readonly isOwnerVisible: boolean;
  readonly buyerId: string;
  readonly setBuyerId: (id: string) => void;
  readonly picked: readonly string[];
  readonly setSkips: (lines: readonly string[]) => void;
}) {
  const canAssign = useCanWrite('lines.write');
  const generateBatches = canAssign ? () => {
    void hintBatches({ ...props, lineIds: props.picked });
  } : undefined;
  return (
    <div style={bulkBarStyle()}>
      <span style={bulkCountStyle()}>已选 {props.picked.length} 行</span>
      <OwnerControls
        isOwnerVisible={props.isOwnerVisible}
        owners={props.users}
        buyerId={props.buyerId}
        onBuyer={props.setBuyerId}
        onAssign={() => { void assignLines({ ...props, lineIds: props.picked, buyerUserId: props.buyerId }); }}
      />
      <LineBatchActions picked={props.picked} setMessage={props.setMessage} onGenerate={generateBatches} />
    </div>
  );
}

function LineBatchActions({ picked, setMessage, onGenerate }: {
  readonly picked: readonly string[];
  readonly setMessage: (message: string) => void;
  readonly onGenerate: (() => void) | undefined;
}) {
  const canExport = useCanWrite('records.write');
  const isCompact = Grid.useBreakpoint().xs === true;
  const [isExporting, setExporting] = useState(false);
  const isExportDisabled = picked.length === 0;
  const generateLabel = '按总表生成批次';
  const exportLabel = '导出确认日表';

  async function download() {
    setExporting(true);
    try {
      await apiDownload({ path: '/api/v1/lines/bulk/confirmed-arrival.xlsx', fileName: '采购确认到货日.xlsx', body: { lineIds: picked } });
    } catch {
      setMessage('导出失败。请确认所选订单有未关闭、未取消的批次。');
    } finally {
      setExporting(false);
    }
  }

  const exportDates = () => { void download(); };
  if (isCompact && onGenerate !== undefined && canExport) {
    const items = [
      { key: 'generate', label: generateLabel, onClick: onGenerate },
      { key: 'export', label: exportLabel, onClick: exportDates, disabled: isExportDisabled || isExporting },
    ];
    return (
      <Dropdown trigger={['click']} menu={{ items }}>
        <Button aria-haspopup="menu" icon={<DownOutlined aria-hidden />} loading={isExporting}>批次操作</Button>
      </Dropdown>
    );
  }

  return (
    <>
      {onGenerate === undefined ? null : <Button onClick={onGenerate}>{generateLabel}</Button>}
      {canExport ? <Button disabled={isExportDisabled} loading={isExporting} onClick={exportDates}>{exportLabel}</Button> : null}
    </>
  );
}

export function LineAlerts(props: {
  readonly skips: readonly string[];
  readonly setSkips: (lines: readonly string[]) => void;
  readonly message: string;
}) {
  return (
    <>
      {props.skips.length === 0 ? null : <Alert style={{ marginTop: 16 }} type="warning" showIcon title="跳过原因" description={props.skips.join('；')} closable={{ onClose: () => props.setSkips([]) }} />}
      {props.message === '' ? null : <Alert style={{ marginTop: 16 }} type="info" showIcon title={props.message} />}
    </>
  );
}

function bulkBarStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 40,
    paddingInline: 12,
    borderRadius: radius,
    background: brand[100],
  };
}

function bulkCountStyle(): CSSProperties {
  return { color: brand[800], fontWeight: 600 };
}
