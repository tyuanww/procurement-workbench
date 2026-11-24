import { Alert, Button, Drawer, Empty, Flex, Form, Pagination, Radio, Skeleton, Typography } from 'antd';
import { useId } from 'react';
import type { ImportRowView } from '@sw/contracts';
import { allConflictChoices, type ConflictCandidate } from '../../features/imports/index.js';
import { drawerWide } from '../../theme/tokens.js';
import { useCanWrite } from '../../shared/actor.js';

export type ImportConflictDrawerProps = {
  readonly open: boolean;
  readonly rows: readonly ImportRowView[];
  readonly candidates: Readonly<Record<string, readonly ConflictCandidate[]>>;
  readonly choices: Readonly<Record<string, string>>;
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly error: string;
  readonly page: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onChoice: (rowId: string, choice: string) => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
};

export function ImportConflictDrawer(props: ImportConflictDrawerProps) {
  const canImport = useCanWrite('imports.write');
  if (!canImport) return null;
  const canSave = allConflictChoices({ rows: props.rows, choices: props.choices });
  return (
    <Drawer
      placement="right"
      size={drawerWide}
      open={props.open}
      onClose={props.onClose}
      title="处理导入冲突"
      footer={<ConflictSaveBar rowCount={props.rows.length} page={props.page} total={props.total} isSaving={props.isSaving} isLoading={props.isLoading} canSave={canSave} onPageChange={props.onPageChange} onSave={props.onSave} />}
    >
      {props.error === '' ? null : <Alert type="error" showIcon title={props.error} style={{ marginBottom: 16 }} />}
      {props.isLoading ? <Skeleton active paragraph={{ rows: 5 }} /> : <ImportConflictDrawerFields rows={props.rows} candidates={props.candidates} choices={props.choices} onChoice={props.onChoice} />}
    </Drawer>
  );
}

export function ConflictSaveBar(props: {
  readonly rowCount: number;
  readonly page: number;
  readonly total: number;
  readonly isSaving: boolean;
  readonly isLoading: boolean;
  readonly canSave: boolean;
  readonly onPageChange: (page: number) => void;
  readonly onSave: () => void;
}) {
  const canImport = useCanWrite('imports.write');
  return (
    <Flex justify="space-between" align="center" wrap gap={12}>
      <Typography.Text type="secondary">当前页 {props.rowCount} 行，共 {props.total} 行</Typography.Text>
      <Flex gap={12} align="center" wrap>
        <Pagination size="small" current={props.page} total={props.total} pageSize={100} showSizeChanger={false} onChange={props.onPageChange} disabled={props.isSaving || props.isLoading} />
        {canImport ? <Button type="primary" loading={props.isSaving} disabled={props.isSaving || props.isLoading || !props.canSave} onClick={props.onSave}>保存当前页</Button> : null}
      </Flex>
    </Flex>
  );
}

export function ImportConflictDrawerFields(props: {
  readonly rows: readonly ImportRowView[];
  readonly candidates: Readonly<Record<string, readonly ConflictCandidate[]>>;
  readonly choices: Readonly<Record<string, string>>;
  readonly onChoice: (rowId: string, choice: string) => void;
}) {
  const canImport = useCanWrite('imports.write');
  if (!canImport) return null;
  if (props.rows.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前页没有待处理的冲突。" />;
  return (
    <>
      <Alert type="info" showIcon title="选择现有订单行或新建" style={{ marginBottom: 16 }} />
      <Form layout="vertical">
        {props.rows.map((row) => <ConflictRow key={row.id} row={row} candidates={props.candidates[row.id] ?? []} choice={props.choices[row.id]} onChoice={props.onChoice} />)}
      </Form>
    </>
  );
}

function ConflictRow(props: {
  readonly row: ImportRowView;
  readonly candidates: readonly ConflictCandidate[];
  readonly choice: string | undefined;
  readonly onChoice: (rowId: string, choice: string) => void;
}) {
  const labelId = useId();
  const issue = props.row.issues[0];
  const options = [
    ...props.candidates.map((candidate) => ({ value: candidate.id, label: candidateLabel(candidate) })),
    { value: 'new', label: '新建' },
  ];
  return (
    <Form.Item label={<span id={labelId}>第 {props.row.rowNo} 行 · {props.row.sheetName}</span>}>
      <Typography.Paragraph type="secondary">{issue?.message ?? '这行有多个可能的订单行。'}</Typography.Paragraph>
      {props.candidates.length === 0 ? <Alert type="warning" showIcon title="没有找到现有订单行，可以选择新建。" style={{ marginBottom: 12 }} /> : null}
      <Radio.Group aria-labelledby={labelId} orientation="vertical" value={props.choice} options={options} onChange={(event) => props.onChoice(props.row.id, event.target.value)} />
    </Form.Item>
  );
}

function candidateLabel(candidate: ConflictCandidate): string {
  return [candidate.poRaw, candidate.nameRaw, candidate.barcodeRaw].filter((value): value is string => value !== null && value !== '').join(' · ');
}
