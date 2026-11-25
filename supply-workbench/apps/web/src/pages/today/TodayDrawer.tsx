import type { ReactNode } from 'react';
import { Alert, Button, Drawer, Flex } from 'antd';
import { CalendarOutlined, FormOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons';
import { businessToday } from '../../features/follow-up/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { drawerWidth } from '../../theme/tokens.js';
import type { BoardRow, QuickAction, RowFace } from '../../features/today/index.js';
import { ActionForm, formErrors, type OpenForm } from './TodayForms.js';
import { faceStackStyle, metaStyle, overdueStyle, reasonStyle } from './today-style.js';

export function TodayDrawer(props: {
  readonly row: BoardRow | null;
  readonly batchSeq?: number | undefined;
  readonly isOpen: boolean;
  readonly draft: OpenForm | null;
  readonly hadDate: boolean;
  readonly lane: 'finished' | 'material';
  readonly isSaving: boolean;
  readonly saveError: string;
  readonly onClose: () => void;
  readonly onDraft: (draft: OpenForm) => void;
  readonly onSubmit: () => void;
}) {
  const canRecord = useCanWrite('records.write');
  return (
    <Drawer
      placement="right"
      size={drawerWidth}
      open={props.isOpen}
      onClose={props.onClose}
      keyboard={false}
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      title={drawerTitle(props.row)}
      footer={props.draft === null || !canRecord ? null : <RecordFooter draft={props.draft} hadDate={props.hadDate} isSaving={props.isSaving} onSubmit={props.onSubmit} />}
    >
      {props.saveError === '' ? null : <Alert style={{ marginBottom: 16 }} type="error" showIcon title={props.saveError} />}
      {props.row === null ? null : <FaceBlock face={props.row.face} batchSeq={props.batchSeq} />}
      {props.draft === null || !canRecord ? null : <ActionForm draft={props.draft} hadDate={props.hadDate} lane={props.lane} onChange={props.onDraft} onSubmit={props.onSubmit} />}
    </Drawer>
  );
}

export function RecordFooter(props: {
  readonly draft: OpenForm | null;
  readonly hadDate: boolean;
  readonly isSaving: boolean;
  readonly onSubmit: () => void;
}) {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  const isBlocked = props.draft !== null && formErrors({ draft: props.draft, hadDate: props.hadDate, today: businessToday() }).length > 0;
  return (
    <Flex justify="flex-end">
      <Button type="primary" loading={props.isSaving} disabled={props.isSaving || isBlocked} onClick={props.onSubmit}>确认</Button>
    </Flex>
  );
}

export function FaceBlock(props: { readonly face: RowFace; readonly batchSeq?: number | undefined }) {
  return (
    <div style={faceStackStyle()}>
      <div style={reasonStyle()}>{props.face.reason}</div>
      {props.face.overdueTone === 'quiet' ? null : <span style={overdueStyle(props.face.overdueTone)}>{props.face.overdue}</span>}
      <div style={metaStyle()}>{props.face.orderNo}{props.batchSeq === undefined ? '' : ` · 第 ${props.batchSeq} 批`} · {props.face.productName} · {props.face.date}</div>
      {props.face.waiting === undefined ? null : <div style={metaStyle()}>等待方 · {props.face.waiting}</div>}
      {props.face.remaining === undefined ? null : <div>{props.face.remaining}</div>}
      {props.face.inTransit === undefined ? null : <div>{props.face.inTransit}</div>}
      {props.face.nextFollowUpAt === undefined ? null : <div style={metaStyle()}>下次跟进 · {formatDateTime(props.face.nextFollowUpAt)}</div>}
      {props.face.latestFollowUp === undefined ? null : <div style={metaStyle()}>最近跟进 · {props.face.latestFollowUp}</div>}
      {props.face.latestPromise === undefined ? null : <div style={metaStyle()}>最近承诺 · {props.face.latestPromise}</div>}
    </div>
  );
}

export function actionIcon(kind: QuickAction['kind']): ReactNode {
  if (kind === 'receipt') return <InboxOutlined />;
  if (kind === 'ship') return <SendOutlined />;
  if (kind === 'date') return <CalendarOutlined />;
  return <FormOutlined />;
}

function drawerTitle(row: BoardRow | null): string {
  if (row === null) return '今日事项';
  if (row.face.productName !== '—') return row.face.productName;
  if (row.face.reason !== '') return row.face.reason;
  return '今日事项';
}
