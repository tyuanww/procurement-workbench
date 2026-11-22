type CoverImage = {
  readonly id: string;
  readonly slot: string;
  readonly fileId: string;
  readonly order: number;
  readonly hiddenAt: string | null;
};

export function coverFile(images: readonly CoverImage[]): { readonly fileId: string } | null {
  const visible = images.filter((image) => image.hiddenAt === null);
  const ranked = [...visible].sort(byCover);
  const first = ranked[0];
  return first === undefined ? null : { fileId: first.fileId };
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
