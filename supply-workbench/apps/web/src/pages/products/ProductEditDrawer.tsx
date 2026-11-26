import { DownloadOutlined, InboxOutlined, PictureOutlined } from '@ant-design/icons';
import { Attachments } from '@ant-design/x';
import { Alert, Button, Drawer, Form, Typography, Upload } from 'antd';
import { useEffect, useId, useRef, useState, type ReactNode, type RefCallback } from 'react';
import { isChannelVariant } from '../../features/product-archive/index.js';
import type { ProductOverview } from '@sw/contracts';
import { drawerWide } from '../../theme/tokens.js';
import { ProductVariantTag } from './product-cards.js';
import { workbookBatchPath, workbookPath } from './product-workbook-api.js';
import { countWorkbookProducts, hasWorkbookIssues, WorkbookPreview, type ReceiptDestination } from './product-workbook-preview.js';
import { useProductWorkbook, type WorkbookRead } from './use-product-workbook.js';
import './product-workbook.css';

export type ProductEditDrawerProps = {
  readonly product: ProductOverview | null;
  readonly isOpen: boolean;
  readonly batchId: string | null;
  readonly onClose: () => void;
  readonly setBatchId: (value: string | null) => void;
  readonly onCommitted: () => void;
  readonly receiptDestination: (productId: string) => ReceiptDestination;
};

type WorkbookEditor = ReturnType<typeof useProductWorkbook>;

export function ProductEditDrawer(props: ProductEditDrawerProps) {
  const productId = props.product?.product.id ?? null;
  const editor = useProductWorkbook({
    isOpen: props.isOpen, productId, batchId: props.batchId,
    setBatchId: props.setBatchId, onCommitted: props.onCommitted,
  });
  const formId = useId();
  const focus = useWorkbookFocus({ isOpen: props.isOpen, editor });
  return <Drawer placement="right" size={drawerWide} rootClassName="dossier-workbook-drawer"
    open={props.isOpen} onClose={props.onClose} afterOpenChange={open => { if (open) focus.move(); }}
    title={props.product === null
      ? <Typography.Title level={1} className="dossier-workbook-catalog-title">新建产品</Typography.Title>
      : <DrawerIdentity overview={props.product} />}
    closable={{ 'aria-label': '关闭 Excel 导入' }} mask={{ closable: false }}
    focusable={{ trap: true, focusTriggerAfterClose: true }}
    styles={{ wrapper: { maxWidth: '100vw' } }}
    classNames={{ body: 'dossier-workbook-body', footer: 'dossier-workbook-footer' }}
    footer={<WorkbookFooter editor={editor} formId={formId} onClose={props.onClose} createOnly={productId === null} />}>
    <WorkbookFlow editor={editor} formId={formId} productId={productId} focus={focus}
      receiptDestination={props.receiptDestination} />
  </Drawer>;
}

function useWorkbookFocus({ isOpen, editor }: { readonly isOpen: boolean; readonly editor: WorkbookEditor }) {
  const target = useRef<HTMLElement | null>(null);
  const { read, error } = editor;
  const status = read.kind === 'batch' ? read.batch.status : read.kind;
  const batchId = read.kind === 'batch' ? read.batch.id : null;
  const kind = focusKind(read, error);
  const bind: RefCallback<HTMLElement> = (element) => { target.current = element; };
  const move = () => target.current?.focus();
  useEffect(() => {
    if (isOpen) target.current?.focus();
  }, [isOpen, batchId, status, kind, error]);
  return { bind, move, kind };
}

function focusKind(read: WorkbookRead, error: string | null): 'error' | 'issues' | 'impact' | 'heading' {
  if (error !== null) return 'error';
  if (read.kind !== 'batch') return 'heading';
  if (hasWorkbookIssues(read.batch)) return 'issues';
  return read.batch.status === 'ready' ? 'impact' : 'heading';
}

type WorkbookFocus = ReturnType<typeof useWorkbookFocus>;
function WorkbookFlow({ editor, focus, formId, productId, receiptDestination }: {
  readonly editor: WorkbookEditor;
  readonly focus: WorkbookFocus;
  readonly formId: string;
  readonly productId: string | null;
  readonly receiptDestination: ProductEditDrawerProps['receiptDestination'];
}) {
  const headingId = useId();
  const { read, error } = editor;
  return <>
    <WorkbookSteps current={stepOf(read)} />
    <Form id={formId} aria-labelledby={headingId} className="dossier-workbook-form" method="post" encType="multipart/form-data"
      action={read.kind === 'batch' ? `${workbookBatchPath(productId, read.batch.id)}/commit` : workbookPath(productId)}
      onFinish={() => { submitWorkbook(editor); if (error !== null && editor.file === null) focus.move(); }}>
      <Typography.Title level={2} id={headingId} tabIndex={-1} className="dossier-workbook-focus" ref={focus.kind === 'heading' ? focus.bind : undefined}>
        {headingOf(read)}
      </Typography.Title>
      {error !== null && <div ref={focus.bind} tabIndex={-1} className="dossier-workbook-focus">
        <Alert type="error" showIcon title={error} />
      </div>}
      <WorkbookStage editor={editor} focus={focus} receiptDestination={receiptDestination} productId={productId} />
    </Form>
  </>;
}

function WorkbookStage({ editor, focus, receiptDestination, productId }: {
  readonly productId: string | null;
  readonly editor: WorkbookEditor;
  readonly focus: WorkbookFocus;
  readonly receiptDestination: ProductEditDrawerProps['receiptDestination'];
}) {
  const { read, busy } = editor;
  if (read.kind === 'loading') return <p role="status">正在读取导入批次…</p>;
  if (read.kind === 'unavailable') return <Alert type="error" showIcon title="导入批次没有读出来。" description="可以重试读取，或选择一份新文件。" />;
  return <>
    {read.kind === 'upload' ? <WorkbookUpload editor={editor} createOnly={productId === null} /> : <WorkbookPreview batch={read.batch} productId={productId}
      issueFocus={focus.kind === 'issues' ? focus.bind : null} impactFocus={focus.kind === 'impact' ? focus.bind : null}
      receiptDestination={receiptDestination} />}
    {busy === 'upload' && <p role="status" className="dossier-note">正在解析工作簿…</p>}
    {busy === 'commit' && <p role="status" className="dossier-note">正在确认此批次…</p>}
  </>;
}

function WorkbookSteps({ current }: { readonly current: number }) {
  return <nav aria-label="Excel 导入进度" className="dossier-workbook-steps">
    <ol>{stepLabels.map((label, index) => <li key={label} aria-current={current === index ? 'step' : undefined}>
      <span aria-hidden="true">{index + 1}</span>{label}
    </li>)}</ol>
  </nav>;
}

const stepLabels = ['选文件', '核对预览', '导入回执'];

function stepOf(read: WorkbookRead): number {
  if (read.kind === 'upload') return 0;
  if (read.kind === 'batch' && read.batch.status === 'committed') return 2;
  return 1;
}

function headingOf(read: WorkbookRead): string {
  if (read.kind === 'upload') return '上传产品档案工作簿';
  if (read.kind === 'loading') return '读取导入批次';
  if (read.kind === 'unavailable') return '批次读取失败';
  return read.batch.status === 'committed' ? '导入回执' : '核对导入预览';
}

function DrawerIdentity({ overview }: { readonly overview: ProductOverview }) {
  const thumbnail = overview.images.find(image => !image.hidden && image.slot === 'outer')
    ?? overview.images.find(image => !image.hidden);
  const thumbnailUrl = thumbnail ? `/files/${encodeURIComponent(thumbnail.fileId)}` : null;
  const [failed, setFailed] = useState<string | null>(null);
  return <div className="dossier-workbook-heading">
    <Typography.Title level={1}>更新此产品</Typography.Title>
    <div className="dossier-workbook-identity">
      <span className="dossier-workbook-thumb">{thumbnailUrl === null || failed === thumbnailUrl
        ? <PictureOutlined role="img" aria-label="暂无包装缩略图" />
        : <img src={thumbnailUrl} alt="包装缩略图" onError={() => setFailed(thumbnailUrl)} />}</span>
      <div><strong>{overview.product.skuName.value ?? '品名待补充'}</strong>
        <div className="dossier-workbook-barcode"><ProductVariantTag isChannelVariant={isChannelVariant(overview.product.barcodeRaw)} />
          <span>{overview.product.barcodeRaw}</span></div></div>
    </div>
  </div>;
}

function WorkbookUpload({ editor, createOnly }: { readonly editor: WorkbookEditor; readonly createOnly: boolean }) {
  return <>
    <p>{createOnly
      ? '用产品条码和 SKU 名称新建产品。已有完整条码请打开对应商品详情，选择「更新此产品」。'
      : '两张表只接受上方的完整条码。档案字段留空时保留原值。'}</p>
    <Button htmlType="button" icon={<DownloadOutlined />} loading={editor.isDownloading} disabled={editor.busy !== null}
      onClick={() => { void editor.download(); }}>下载 Excel 模板</Button>
    <Attachments name="file" getDropContainer={inlineDropOnly} maxCount={1} accept=".xlsx" multiple={false} disabled={editor.busy !== null}
      classNames={{ root: 'dossier-workbook-attachments', placeholder: 'dossier-workbook-dropzone' }}
      overflow="wrap" items={editor.file === null ? [] : [{ uid: 'workbook', name: editor.file.name, size: editor.file.size, icon: 'excel' }]}
      placeholder={{ icon: <InboxOutlined />, title: '选择或拖入 Excel 文件', description: '每次导入一份 .xlsx 工作簿' }}
      beforeUpload={(file) => { editor.chooseFile(file); return Upload.LIST_IGNORE; }}
      onRemove={() => { editor.newFile(); return false; }} />
  </>;
}

function inlineDropOnly() { return null; }

function submitWorkbook(editor: WorkbookEditor) {
  if (editor.read.kind === 'batch') void editor.commit(editor.read.batch);
  if (editor.read.kind === 'upload') void editor.preview();
}

function WorkbookFooter({ editor, formId, onClose, createOnly }: {
  readonly editor: WorkbookEditor;
  readonly formId: string;
  readonly onClose: () => void;
  readonly createOnly: boolean;
}) {
  const { read, busy } = editor;
  let action: ReactNode = null;
  let secondary: ReactNode = null;
  if (read.kind === 'upload') {
    action = <Button type="primary" htmlType="submit" form={formId} loading={busy === 'upload'} disabled={busy !== null}>生成预览</Button>;
  }
  if (read.kind === 'batch' || read.kind === 'unavailable') {
    const choose = <Button onClick={editor.newFile} disabled={busy !== null}>选择新文件</Button>;
    if (read.kind === 'unavailable') {
      secondary = choose;
      action = <Button type="primary" onClick={editor.retryRead}>重试读取</Button>;
    } else if (read.batch.status === 'ready') {
      secondary = choose;
      const label = createOnly ? `确认新增 ${countWorkbookProducts(read.batch)} 款` : '确认更新此产品';
      action = <Button type="primary" htmlType="submit" form={formId} loading={busy === 'commit'} disabled={busy !== null}>{label}</Button>;
    } else {
      action = <Button type="primary" onClick={editor.newFile}>选择新文件</Button>;
    }
  }
  return <><Button onClick={onClose}>关闭</Button>{secondary}{action}</>;
}
