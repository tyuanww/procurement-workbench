import { Popover, Typography } from 'antd';
import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type PointerEvent, type ReactNode, type SetStateAction } from 'react';
import { Link } from 'react-router';
import type { ProductCard } from '@sw/contracts';
import { imageSlotLabel } from '@sw/domain';
import { useCatalogProductLink } from './product-cards.js';

const TablePreview = createContext<{ id: string | null; narrow: boolean; setId: Dispatch<SetStateAction<string | null>> } | null>(null);

export function ProductTablePreviews({ children, narrow }: { readonly children: ReactNode; readonly narrow: boolean }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (id === null) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setId(null);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [id]);
  return <TablePreview value={{ id, narrow, setId }}>{children}</TablePreview>;
}

export function ProductNamePreview({ item }: { readonly item: ProductCard }) {
  const link = useCatalogProductLink(item.id);
  const preview = useContext(TablePreview);
  const anchor = useRef<HTMLAnchorElement>(null);
  const lastPointer = useRef('');
  const notePointer = (event: PointerEvent<HTMLAnchorElement>) => { lastPointer.current = event.pointerType; };
  const setOpen = (isOpen: boolean) => {
    // 触屏会模拟悬停；留出本次点击给品名链接，键盘聚焦仍可预览。
    if (isOpen && lastPointer.current === 'touch' && !anchor.current?.matches(':focus-visible')) return;
    if (isOpen) preview?.setId(item.id);
    else preview?.setId(current => current === item.id ? null : current);
  };
  return <Popover trigger={['hover', 'focus']} placement={preview?.narrow ? 'bottom' : 'right'} mouseEnterDelay={0.23} mouseLeaveDelay={0.16}
    open={preview?.id === item.id} onOpenChange={setOpen} destroyOnHidden motion={{ motionName: '' }} classNames={{ root: 'dossier-name-popover' }}
    title={item.skuName} content={<>
      <Typography.Text type="secondary">{item.barcodeRaw}</Typography.Text>
      <PackagingPreview images={item.packagingImages ?? []} />
    </>}>
    <Link {...link} ref={anchor} onPointerEnter={notePointer} onPointerDownCapture={notePointer}>{item.skuName}</Link>
  </Popover>;
}

type PackagingImages = NonNullable<ProductCard['packagingImages']>;

function PackagingPreview({ images }: { readonly images: PackagingImages }) {
  if (images.length === 0) return <p role="status">暂无包装图</p>;
  return <div className="dossier-preview-images">
    {images.map(image => <PreviewFigure key={image.slot} image={image} />)}
  </div>;
}

function PreviewFigure({ image }: { readonly image: PackagingImages[number] }) {
  const [hasError, setHasError] = useState(false);
  const label = imageSlotLabel(image.slot);
  return <figure>
    {hasError ? <span>图片加载失败</span> : <img src={`/files/${encodeURIComponent(image.fileId)}`} alt={label} onError={() => setHasError(true)} />}
    <figcaption>{label}</figcaption>
  </figure>;
}
