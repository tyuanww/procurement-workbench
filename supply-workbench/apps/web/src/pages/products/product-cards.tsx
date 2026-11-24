import { PictureOutlined } from '@ant-design/icons';
import { Card, Flex, Image, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { ProductCard } from '@sw/contracts';
import { formatQuantity } from '../../shared/ui/format.js';
import { bg, border, fontSize, radius, space, text } from '../../theme/tokens.js';

export type { ProductCard };

export type ProductView = 'card' | 'table';

export type CardMetric = {
  readonly label: string;
  readonly value: string;
};

/** 卡片是默认视图，只有显式 view=table 才切到表格。 */
export function productViewOf(params: { readonly get: (name: string) => string | null }): ProductView {
  return params.get('view') === 'table' ? 'table' : 'card';
}

export function thumbnailSrc(thumbnail: { readonly fileId: string } | null): string | null {
  return thumbnail === null ? null : `/files/${thumbnail.fileId}`;
}

/** 卡片上的四个采购指标，缺值走 U+2014，不显示成 0。 */
export function cardMetrics(item: ProductCard): readonly CardMetric[] {
  return [
    { label: '采购中', value: formatQuantity(item.openPurchaseLines.reportedInProgress) },
    { label: '工厂库存', value: formatQuantity(item.factoryStock.value) },
    { label: 'BOM', value: formatQuantity(item.bomPartCount) },
    { label: '联系人', value: formatQuantity(item.contactsAssigned) },
  ];
}

export function ProductCards({ items }: { readonly items: readonly ProductCard[] }): ReactNode {
  return (
    <div style={gridStyle()}>
      {items.map((item) => (
        <CatalogProductLink key={item.id} id={item.id} style={cardLinkStyle()}>
          <Card
            hoverable
            size="small"
            styles={{ body: { padding: space[2] } }}
            style={{ height: '100%' }}
            cover={<ProductCover item={item} />}
          >
            <CardBody item={item} />
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

function CardBody({ item }: { readonly item: ProductCard }): ReactNode {
  return (
    <div style={cardBodyStyle()}>
      <Flex align="flex-start" justify="space-between" gap={space[1]}>
        <Typography.Text strong style={{ fontSize: fontSize.body, lineHeight: '20px' }}>{item.skuName}</Typography.Text>
        {item.isChannelVariant ? <Tag variant="outlined" style={{ marginInlineEnd: 0 }}>渠道规格</Tag> : null}
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{item.barcodeRaw}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{specText(item)}</Typography.Text>
      <MetricGrid item={item} />
    </div>
  );
}

function specText(item: ProductCard): string {
  return `净含量 ${item.netContent ?? '—'} · 箱规 ${item.casePack ?? '—'}`;
}

function MetricGrid({ item }: { readonly item: ProductCard }): ReactNode {
  return (
    <div style={metricGridStyle()}>
      {cardMetrics(item).map((metric) => (
        <div key={metric.label} style={metricCellStyle()}>
          <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{metric.label}</Typography.Text>
          <Typography.Text style={{ fontSize: fontSize.body, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</Typography.Text>
        </div>
      ))}
    </div>
  );
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
      <PictureOutlined style={{ fontSize: fontSize.metric, color: text.tertiary }} />
    </div>
  );
}

function gridStyle(): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: space[3],
    marginTop: space[2],
    alignItems: 'stretch',
  };
}

function cardLinkStyle(): CSSProperties {
  return { display: 'block', height: '100%', minWidth: 0, color: 'inherit', textDecoration: 'none' };
}

function cardBodyStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0 };
}

function coverImageStyle(): CSSProperties {
  return { display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' };
}

function placeholderStyle(): CSSProperties {
  return {
    aspectRatio: '4 / 3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: bg.page,
    borderBottom: `1px solid ${border}`,
    color: text.tertiary,
  };
}

function metricGridStyle(): CSSProperties {
  return { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: space[1], marginTop: space[0] };
}

function metricCellStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    padding: `${space[1]}px ${space[2]}px`,
    background: bg.page,
    borderRadius: radius,
  };
}
