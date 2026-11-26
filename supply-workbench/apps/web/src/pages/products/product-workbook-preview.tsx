import { useState, type Ref } from 'react';
import { FileCard } from '@ant-design/x';
import { Alert, Button, Typography } from 'antd';
import { Link, type To } from 'react-router';
import type { WorkbookBatch } from './product-workbook-api.js';

type Change = WorkbookBatch['products'][number]['changes'][number];
type PreviewProduct = Omit<WorkbookBatch['products'][number], 'changes'> & { readonly changes: readonly Change[] };
export type ReceiptDestination = { readonly to: To; readonly state: unknown };

export function hasWorkbookIssues(batch: WorkbookBatch): boolean {
  return batch.status === 'blocked' || batch.issues.some(({ row, field }) => row !== null || field !== null);
}

export function countWorkbookProducts(batch: WorkbookBatch): number {
  return batch.products.filter(({ changes }) => changes.length > 0).length;
}

const sections = { product: '档案字段', image: '包装图片', bom: '组成物料' } satisfies Record<Change['section'], string>;

export function WorkbookPreview({ batch, issueFocus, impactFocus, receiptDestination, productId }: {
  readonly productId: string | null;
  readonly batch: WorkbookBatch;
  readonly issueFocus: Ref<HTMLDivElement> | null;
  readonly impactFocus: Ref<HTMLElement> | null;
  readonly receiptDestination: (productId: string) => ReceiptDestination;
}) {
  const products = batch.products.map(product => ({ ...product, changes: pairImageReplacements(product.changes) }));
  const changeCount = products.reduce((total, product) => total + product.changes.length, 0);
  const productCount = countWorkbookProducts(batch);
  const hasIssues = hasWorkbookIssues(batch);
  const isCommitted = batch.status === 'committed';
  return <>
    <FileCard name={batch.fileName} icon="excel" size="small" description={batch.status === 'committed' ? '已导入的工作簿' : '已解析的工作簿'} />
    {batch.status === 'unchanged' && <Alert type="info" showIcon title="当前档案与工作簿一致，无需提交。" />}
    {batch.status === 'stale' && !hasIssues && <Alert type="warning" showIcon title="档案已更新，本次预览已失效。" description="请重新选择文件并核对最新差异。" />}
    {batch.status === 'ready' && <Typography.Title level={3} tabIndex={-1} ref={impactFocus} className="dossier-workbook-count dossier-workbook-focus">
      {productId === null ? `将新增 ${productCount} 款产品` : '将更新此产品'} · 共 {changeCount} 项变更
    </Typography.Title>}
    {batch.status === 'committed' && <Alert type="success" showIcon title={receiptTitle(batch, { productId, productCount, changeCount })} />}
    {hasIssues && <WorkbookIssues batch={batch} focusTarget={issueFocus} />}
    {batch.status !== 'stale' && products.map(product => <ProductChanges key={`${product.barcode}:${product.id ?? ''}`} product={product}
      isCommitted={isCommitted} receipt={isCommitted && product.id !== null ? receiptDestination(product.id) : null} />)}
  </>;
}

function ProductChanges({ product, receipt, isCommitted }: {
  readonly product: PreviewProduct;
  readonly receipt: ReceiptDestination | null;
  readonly isCommitted: boolean;
}) {
    const labels = isCommitted
      ? { before: '导入前', after: '导入后', beforeImage: '导入前包装图片', afterImage: '导入后包装图片' }
      : { before: '当前值', after: '导入值', beforeImage: '当前包装图片', afterImage: '导入包装图片' };
    return <article className="dossier-workbook-product">
      <div className="dossier-workbook-product-head">
        <div><h3>{product.name || '品名待补充'}</h3><span className="dossier-note">{product.barcode}</span></div>
        {receipt !== null && <Link {...receipt} className="dossier-workbook-product-link"
          aria-label={`查看产品档案 ${product.barcode}`}>查看产品</Link>}
      </div>
      {product.changes.length === 0 && <p className="dossier-note">此产品无变更。</p>}
      {Object.entries(sections).map(([section, label]) => {
        const changes = product.changes.filter(change => change.section === section);
        if (changes.length === 0) return null;
        return <section key={section} className="dossier-workbook-section" aria-label={label}>
          <h4>{label}</h4>
          <ul>{changes.map((change, index) => <li key={`${change.label}:${index}`}>
            <strong>{change.label}</strong>
            <dl className="dossier-workbook-change">
              <div><dt>{labels.before}</dt><dd><ChangeValue value={change.before} url={change.beforeImageUrl} alt={labels.beforeImage} /></dd></div>
              <div><dt>{labels.after}</dt><dd><ChangeValue value={change.after} url={change.afterImageUrl} alt={labels.afterImage} /></dd></div>
            </dl>
          </li>)}</ul>
        </section>;
      })}
    </article>;
}

function receiptTitle(batch: WorkbookBatch, { productId, productCount, changeCount }: {
  readonly productId: string | null;
  readonly productCount: number;
  readonly changeCount: number;
}): string {
  if (productId === null) return `已新增 ${productCount} 款产品`;
  if (batch.products.some(({ id, changes }) => id !== productId && changes.length > 0)) {
    return `已导入 ${productCount} 款产品的 ${changeCount} 项变更`;
  }
  return `已更新此产品的 ${changeCount} 项内容`;
}

function pairImageReplacements(changes: readonly Change[]): readonly Change[] {
  const imageLabels = new Set(changes.filter(({ section }) => section === 'image').map(({ label }) => label));
  const pairs = new Map<Change, Change>();
  const pairedAdditions = new Set<Change>();
  for (const label of imageLabels) {
    const slotChanges = changes.filter(change => change.section === 'image' && change.label === label);
    if (slotChanges.length !== 2) continue;
    const previous = slotChanges.find(change => change.beforeImageUrl !== undefined && change.afterImageUrl === undefined);
    const next = slotChanges.find(change => change.beforeImageUrl === undefined && change.afterImageUrl !== undefined);
    if (previous?.beforeImageUrl === undefined || next?.afterImageUrl === undefined) continue;
    pairs.set(previous, { ...previous, after: '替换图片', afterImageUrl: next.afterImageUrl });
    pairedAdditions.add(next);
  }
  return changes.filter(change => !pairedAdditions.has(change)).map(change => pairs.get(change) ?? change);
}

function WorkbookIssues({ batch, focusTarget }: { readonly batch: WorkbookBatch; readonly focusTarget: Ref<HTMLDivElement> | null }) {
  const { issues } = batch;
  const title = issues.length === 0 ? '工作簿未通过校验。' : `请修正工作簿中的 ${issues.length} 处问题。`;
  return <div ref={focusTarget} tabIndex={-1} role="region" aria-label="工作簿问题" className="dossier-workbook-focus">
    <Alert type="error" showIcon
      title={batch.status === 'stale' ? `本次预览已失效。${title}` : title}
      description={<>
        <p>在 Excel 中修正后重新选择文件。</p>
        {issues.length > 0 && <ul className="dossier-workbook-issues">{issues.map((issue, index) => <li key={index}>
          <strong>{[issue.sheet, issue.row === null ? null : `第 ${issue.row} 行`, issue.field].filter(Boolean).join(' · ') || '工作簿'}</strong>
          <span>{issue.message}</span>
        </li>)}</ul>}
      </>} />
  </div>;
}

function ChangeValue({ value, url, alt }: { readonly value: string | null; readonly url: string | undefined; readonly alt: string }) {
  return <>
    <span>{value ?? '空白'}</span>
    {url !== undefined && /^\/(?![/\\])/.test(url) && <ChangeThumbnail key={url} url={url} alt={alt} />}
  </>;
}

function ChangeThumbnail({ url, alt }: { readonly url: string; readonly alt: string }) {
  const [hasFailed, setFailed] = useState(false);
  return hasFailed ? <Button type="link" htmlType="button" aria-label={`重试加载${alt}`} onClick={() => setFailed(false)}>图片加载失败，重试</Button>
    : <img className="dossier-workbook-value-image" src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
