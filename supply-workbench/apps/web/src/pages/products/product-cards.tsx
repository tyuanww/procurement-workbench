import { PictureOutlined } from '@ant-design/icons';
import { Card, Flex, Image, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { ProductCard } from '@sw/contracts';
import { comparableBarcode } from '@sw/domain';
import { bg, border, brand, fontSize, space, text } from '../../theme/tokens.js';

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
        <CatalogProductLink key={item.id} id={item.id} style={cardLinkStyle()}>
          <Card hoverable size="small" styles={{ body: { padding: space[2] } }} cover={<ProductCover item={item} />}>
            <CardBody item={item} exactBarcode={exactBarcode} />
          </Card>
        </CatalogProductLink>
      ))}
    </div>
  );
}

export function CatalogProductLink({ id, children, style }: { readonly id: string; readonly children: ReactNode; readonly style?: CSSProperties }) {
  const { search } = useLocation();
  return <Link to={`/products/${encodeURIComponent(id)}`} state={{ catalogSearch: search }} style={style}>{children}</Link>;
}

function CardBody({ item, exactBarcode }: { readonly item: ProductCard; readonly exactBarcode: string }): ReactNode {
  return (
    <Flex vertical gap={space[1]} style={{ overflowWrap: 'anywhere' }}>
      <Flex align="flex-start" justify="space-between" gap={space[1]}>
        <Typography.Text strong style={{ fontSize: fontSize.body, lineHeight: '20px' }}>{item.skuName}</Typography.Text>
        {item.isChannelVariant ? <Tag variant="outlined" style={{ flexShrink: 0, marginInlineEnd: 0 }}>渠道规格</Tag> : null}
      </Flex>
      <ProductBarcode item={item} exactBarcode={exactBarcode} />
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>备案名 {filingNameText(item.filingName)}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{specText(item)}</Typography.Text>
    </Flex>
  );
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

function specText(item: ProductCard): string {
  return `净含量 ${item.netContent ?? '—'} · 箱规 ${item.casePack ?? '—'}`;
}

function ProductCover({ item }: { readonly item: ProductCard }): ReactNode {
  const [isBroken, setIsBroken] = useState(false);
  const src = thumbnailSrc(item.thumbnail);
  if (src === null || isBroken) return <CoverPlaceholder item={item} />;
  return (
    <Image
      alt={item.skuName}
      src={src}
      preview={false}
      width="100%"
      styles={{ image: coverImageStyle() }}
      onError={() => setIsBroken(true)}
    />
  );
}

function CoverPlaceholder({ item }: { readonly item: ProductCard }): ReactNode {
  return (
    <div role="img" aria-label={`${item.skuName} 无图`} style={placeholderStyle()}>
      <PictureOutlined aria-hidden style={{ fontSize: fontSize.page }} />
    </div>
  );
}

function cardLinkStyle(): CSSProperties {
  return { display: 'block', minWidth: 0, color: 'inherit', textDecoration: 'none' };
}

function coverImageStyle(): CSSProperties {
  return { display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' };
}

function placeholderStyle(): CSSProperties {
  return {
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: bg.page,
    borderBottom: `1px solid ${border}`,
    color: text.tertiary,
  };
}
