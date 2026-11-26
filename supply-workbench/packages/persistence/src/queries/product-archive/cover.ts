type CoverImage = {
  readonly id: string;
  readonly slot: string;
  readonly fileId: string;
  readonly order: number;
  readonly hiddenAt: string | null;
};

export function coverFile(images: readonly CoverImage[], cover?: 'packaging') {
  const visible = images.filter((image) => image.hiddenAt === null).sort(byCover);
  if (cover === 'packaging') {
    const first = visible.find((image) => image.slot === 'outer') ?? visible.find((image) => image.slot === 'inner');
    if (first === undefined) return null;
    const slot = first.slot === 'outer' ? 'outer' as const : 'inner' as const;
    return { fileId: first.fileId, slot };
  }
  const first = visible[0];
  return first === undefined ? null : { fileId: first.fileId };
}

export function packagingFiles(images: readonly CoverImage[]) {
  const visible = images.filter((image) => image.hiddenAt === null).sort(byCover);
  return (['outer', 'inner'] as const).flatMap((slot) => {
    const image = visible.find((candidate) => candidate.slot === slot);
    return image === undefined ? [] : [{ fileId: image.fileId, slot }];
  });
}

function byCover(left: CoverImage, right: CoverImage): number {
  if (left.order !== right.order) return left.order - right.order;
  const slot = coverSlot(left.slot) - coverSlot(right.slot);
  if (slot !== 0) return slot;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function coverSlot(slot: string): number {
  return slot === 'inner' ? 0 : 1;
}
