import { entityId, parseItemCode, type CodeLink, type EntityId, type ItemCode, type ParsedItemCode } from '@sw/domain';
import type { CommitContext } from './context.js';

type RawLink = {
  readonly fromCodeRaw: string;
  readonly toCodeRaw: string;
  readonly sheetName: string;
  readonly rowNo: number;
};

type Pair = RawLink & {
  readonly from: ParsedItemCode;
  readonly to: ParsedItemCode;
};

export async function saveFactoryCodeLinks(ctx: CommitContext): Promise<void> {
  const seen = new Set<string>();
  for (const link of linksOf(ctx.batch.fileMeta)) {
    const pair = pairOf(link);
    if (pair === null || seen.has(pairKey(pair))) continue;
    seen.add(pairKey(pair));
    await savePair(ctx, pair);
  }
}

async function savePair(ctx: CommitContext, pair: Pair): Promise<void> {
  await ensureLink({ ctx, pair, ids: {
    fromId: await ensureCode({ ctx, parsed: pair.from, raw: pair.fromCodeRaw }),
    toId: await ensureCode({ ctx, parsed: pair.to, raw: pair.toCodeRaw }),
  } });
}

async function ensureCode({ ctx, parsed, raw }: { readonly ctx: CommitContext; readonly parsed: ParsedItemCode; readonly raw: string }): Promise<EntityId> {
  const existing = (await ctx.tx.itemCodes.listByNorm(parsed.codeNorm)).find((row) => row.codeType === parsed.codeType);
  if (existing !== undefined) return existing.id;
  const id = entityId(`code:${parsed.codeType}:${parsed.codeNorm}`);
  await ctx.tx.itemCodes.save(newCode({ id, parsed, raw, at: ctx.at }));
  return id;
}

async function ensureLink({ ctx, pair, ids }: { readonly ctx: CommitContext; readonly pair: Pair; readonly ids: { readonly fromId: EntityId; readonly toId: EntityId } }): Promise<void> {
  const id = entityId(`link:${pair.from.codeNorm}:${pair.to.codeNorm}`);
  const existing = await ctx.tx.codeLinks.find(id);
  if (existing !== undefined && existing.status !== 'pending') return;
  await ctx.tx.codeLinks.save(pendingLink({ ctx, pair, fromId: ids.fromId, toId: ids.toId, id, existing }));
}

function pendingLink(input: { readonly ctx: CommitContext; readonly pair: Pair; readonly fromId: EntityId; readonly toId: EntityId; readonly id: EntityId; readonly existing: CodeLink | undefined }): CodeLink {
  return {
    id: input.id,
    createdAt: input.existing?.createdAt ?? input.ctx.at,
    updatedAt: input.ctx.at,
    fromCodeId: input.fromId,
    toCodeId: input.toId,
    status: 'pending',
    evidence: { importBatchId: input.ctx.batch.id, sheetName: input.pair.sheetName, rowNo: input.pair.rowNo },
    reviewedBy: input.existing?.reviewedBy ?? null,
    reviewedAt: input.existing?.reviewedAt ?? null,
  };
}

function newCode(input: { readonly id: EntityId; readonly parsed: ParsedItemCode; readonly raw: string; readonly at: string }): ItemCode {
  return { id: input.id, createdAt: input.at, updatedAt: input.at, codeType: input.parsed.codeType, codeRaw: input.raw, codeNorm: input.parsed.codeNorm, itemId: null, status: 'pending' };
}

function pairOf(link: RawLink): Pair | null {
  const from = parseItemCode(link.fromCodeRaw).value;
  const to = parseItemCode(link.toCodeRaw).value;
  if (from === null || from === undefined || to === null || to === undefined) return null;
  return { ...link, from, to };
}

function pairKey(pair: Pair): string {
  return `${pair.from.codeType}:${pair.from.codeNorm}|${pair.to.codeType}:${pair.to.codeNorm}`;
}

function linksOf(fileMeta: unknown): RawLink[] {
  if (!isRecord(fileMeta) || !Array.isArray(fileMeta.codeLinks)) return [];
  return fileMeta.codeLinks.flatMap(rawLink);
}

function rawLink(value: unknown): RawLink[] {
  if (!isRecord(value)) return [];
  if (typeof value.fromCodeRaw !== 'string' || typeof value.toCodeRaw !== 'string') return [];
  if (typeof value.sheetName !== 'string' || typeof value.rowNo !== 'number') return [];
  return [{ fromCodeRaw: value.fromCodeRaw, toCodeRaw: value.toCodeRaw, sheetName: value.sheetName, rowNo: value.rowNo }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
