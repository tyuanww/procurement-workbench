import { PictureOutlined } from '@ant-design/icons';
import { Card, Flex, Image, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { ProductCard } from '@sw/contracts';
import { comparableBarcode } from '@sw/domain';
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

export function filingNameText(name: string | null): string {
  return name?.trim() || '待补充';
}

export function ProductCards({ items, exactBarcode = '' }: { readonly items: readonly ProductCard[]; readonly exactBarcode?: string }): ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: space[3] }}>
      {items.map((item) => (
        <CatalogCard key={item.id} item={item} exactBarcode={exactBarcode} />
      ))}
    </div>
  );
}

export function CatalogProductLink({ id, children, style }: { readonly id: string; readonly children: ReactNode; readonly style?: CSSProperties }) {
  const { search } = useLocation();
  const to = `/products/${encodeURIComponent(id)}`;
  const focus = useDetailFocusLink(to);
  return <Link to={to} {...focus} state={{ ...focus.state, catalogSearch: search }}
    style={{ scrollMarginBlockStart: topBar + space[2], ...style }}>{children}</Link>;
}

function CatalogCard({ item, exactBarcode }: { readonly item: ProductCard; readonly exactBarcode: string }): ReactNode {
  const [isBroken, setIsBroken] = useState(false);
  const src = thumbnailSrc(item.thumbnail);
  const hasImage = src !== null && !isBroken;
  const cover = hasImage ? <Image alt="" src={src} preview={false} width="100%" styles={{ image: coverImageStyle() }} onError={() => setIsBroken(true)} /> : null;
  return (
    <CatalogProductLink id={item.id} style={cardLinkStyle()}>
      <Card hoverable size="small" styles={{ body: { padding: space[2] } }} cover={cover}>
        <CardBody item={item} exactBarcode={exactBarcode} hasImage={hasImage} />
      </Card>
    </CatalogProductLink>
  );
}

function CardBody({ item, exactBarcode, hasImage }: { readonly item: ProductCard; readonly exactBarcode: string; readonly hasImage: boolean }): ReactNode {
  return (
    <Flex vertical gap={space[1]} style={{ overflowWrap: 'anywhere' }}>
      <Flex align="flex-start" justify="space-between" gap={space[1]}>
        <Typography.Text strong style={{ fontSize: fontSize.body, lineHeight: '20px' }}>{item.skuName}</Typography.Text>
        <ProductVariantTag isChannelVariant={item.isChannelVariant} />
      </Flex>
      <ProductBarcode item={item} exactBarcode={exactBarcode} />
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>备案名 {filingNameText(item.filingName)}</Typography.Text>
      <ProductPackagingText item={item} />
      {hasImage ? null : <CoverPlaceholder item={item} />}
    </Flex>
  );
}

export function ProductVariantTag({ isChannelVariant }: { readonly isChannelVariant: boolean }) {
  const tone = isChannelVariant ? statusColor.info : statusColor.neutral;
  return <Tag style={{ flexShrink: 0, marginInlineEnd: 0, color: tone.text, background: tone.bg, borderColor: tone.border }}>
    {isChannelVariant ? '渠道规格' : '标准规格'}
  </Tag>;
}

export function ProductBarcode({ item, exactBarcode }: { readonly item: ProductCard; readonly exactBarcode: string }): ReactNode {
  const isExact = exactBarcode !== '' && comparableBarcode(item.barcodeRaw) === comparableBarcode(exactBarcode);
  return (
    <Flex align="center" wrap gap={space[1]}>
      <Typography.Text strong={isExact} style={{ fontSize: fontSize.table, fontVariantNumeric: 'tabular-nums' }}>{item.barcodeRaw}</Typography.Text>
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

function coverImageStyle(): CSSProperties {
  return { display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' };
}
