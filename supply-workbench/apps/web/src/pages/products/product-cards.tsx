import { PictureOutlined } from '@ant-design/icons';
import { Card, Flex, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { ProductCard } from '@sw/contracts';
import { comparableBarcode, imageSlotLabel } from '@sw/domain';
import { useDetailFocusLink } from '../../shared/hooks/detail-return-focus.js';
import { brand, fontSize, space, statusColor, text, topBar } from '../../theme/tokens.js';

export type ProductView = 'card' | 'table';

/** 卡片是默认视图，只有显式 view=table 才切到表格。 */
export function productViewOf(params: { readonly get: (name: string) => string | null }): ProductView {
  return params.get('view') === 'table' ? 'table' : 'card';
}

export function thumbnailSrc(thumbnail: { readonly fileId: string } | null): string | null {
  return thumbnail === null ? null : `/files/${thumbnail.fileId}`;
}

export function filingText(value: string | null | undefined): string {
  return value?.trim() || '待补充';
}

export function ProductCards({ items, exactBarcode = '' }: { readonly items: readonly ProductCard[]; readonly exactBarcode?: string }): ReactNode {
  return (
    <div className="dossier-grid">
      {items.map((item) => (
        <CatalogCard key={item.id} item={item} exactBarcode={exactBarcode} />
      ))}
    </div>
  );
}

export function useCatalogProductLink(id: string) {
  const { search } = useLocation();
  const to = `/products/${encodeURIComponent(id)}`;
  const focus = useDetailFocusLink(to);
  return { to, ...focus, state: { ...focus.state, catalogSearch: search }, style: { scrollMarginBlockStart: topBar + space[2] } };
}

export function CatalogProductLink({ id, children, style }: { readonly id: string; readonly children: ReactNode; readonly style?: CSSProperties }) {
  const link = useCatalogProductLink(id);
  return <Link {...link} style={{ ...link.style, ...style }}>{children}</Link>;
}

function CatalogCard({ item, exactBarcode }: { readonly item: ProductCard; readonly exactBarcode: string }): ReactNode {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = thumbnailSrc(item.thumbnail);
  const hasImage = src !== null && src !== failedSrc;
  const slotLabel = item.thumbnail?.slot ? imageSlotLabel(item.thumbnail.slot) : '包装图';
  const cover = hasImage ? (
    <div className="dossier-cover">
      <img src={src} loading="lazy" alt={slotLabel} onError={() => setFailedSrc(src)} />
      <span>{slotLabel}</span>
    </div>
  ) : undefined;
  return (
    <CatalogProductLink id={item.id} style={cardLinkStyle()}>
      <Card className="dossier-card" size="small" hoverable cover={cover}>
        <ProductVariantTag isChannelVariant={item.isChannelVariant} />
        <Typography.Title level={2}>{item.skuName}</Typography.Title>
        <ProductBarcode item={item} exactBarcode={exactBarcode} />
        <div className="dossier-filing">
          <div>备案名 {filingText(item.filingName)}</div>
          <div>备案编号 {filingText(item.filingNo)}</div>
        </div>
        <dl className="dossier-package"><div><dt>净含量</dt><dd>{item.netContent ?? '—'}</dd></div>
          <div><dt>箱规</dt><dd>{item.casePack ?? '—'}</dd></div>
          <div><dt>负责人</dt><dd>{item.ownerName ?? '未指定'}</dd></div></dl>
        {!hasImage && <CoverPlaceholder item={item} />}
      </Card>
    </CatalogProductLink>
  );
}

export function ProductVariantTag({ isChannelVariant }: { readonly isChannelVariant: boolean }) {
  const tone = isChannelVariant ? statusColor.info : statusColor.neutral;
  return <Tag style={{ flexShrink: 0, marginInlineEnd: 0, color: tone.text, background: tone.bg, borderColor: tone.border }}>
    {isChannelVariant ? '渠道装' : '普通装'}
  </Tag>;
}

export function ProductBarcode({ item, exactBarcode }: { readonly item: ProductCard; readonly exactBarcode: string }): ReactNode {
  const isExact = exactBarcode !== '' && comparableBarcode(item.barcodeRaw) === comparableBarcode(exactBarcode);
  const suffix = item.isChannelVariant ? item.barcodeRaw.match(/-[0-9]+$/)?.[0] : undefined;
  return (
    <Flex align="center" wrap gap={space[1]}>
      <Typography.Text strong={isExact} style={{ fontSize: fontSize.table, fontVariantNumeric: 'tabular-nums' }}>{suffix ? <>{item.barcodeRaw.slice(0, -suffix.length)}<strong className="dossier-suffix">{suffix}</strong></> : item.barcodeRaw}</Typography.Text>
      {isExact ? <Tag style={{ background: brand[100], color: brand[800], marginInlineEnd: 0 }}>条码精确匹配</Tag> : null}
    </Flex>
  );
}

export function ProductPackagingText({ item }: { readonly item: Pick<ProductCard, 'netContent' | 'casePack'> }) {
  return (
    <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>
      净含量 {item.netContent ?? '—'} · 箱规 {item.casePack ?? '—'}
    </Typography.Text>
  );
}

function CoverPlaceholder({ item }: { readonly item: ProductCard }): ReactNode {
  return (
    <Flex role="img" aria-label={`${item.skuName} 无图`} gap={space[1]} align="center" style={{ color: text.tertiary, fontSize: fontSize.meta }}>
      <PictureOutlined aria-hidden />无图
    </Flex>
  );
}

function cardLinkStyle(): CSSProperties {
  return { display: 'block', minWidth: 0, color: 'inherit', textDecoration: 'none' };
}
