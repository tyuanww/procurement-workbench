import { IMPORT_FILE_MAX_BYTES, entityId, type ProductId } from '@sw/domain';
import type { Clock } from '../../ports/clock.js';
import type { FileStore } from '../../ports/file-store.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import type { UnitOfWork } from '../../ports/unit-of-work.js';
import type { WorkbookLike, WorkbookReader } from '../../ports/workbook-reader.js';
import type { Actor } from '../../shared/actor.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { FileTooLargeError, FileTypeNotAllowedError, NotFoundError, StateConflictError, WorkbookUnreadableError } from '../../shared/errors.js';
import type { ParsedProductWorkbook, ProductWorkbookPreview, ProductWorkbookStores, WorkbookSession } from './model.js';
import { planProductWorkbook, workbookBarcodes, type WorkbookScope } from './plan.js';

type Upload = { readonly productId: ProductId | null; readonly fileName: string; readonly bytes: Uint8Array };
type Location = { readonly productId: ProductId | null; readonly batchId: string };
type ImageLocation = Location & { readonly sha256: string };
type ActorInput<T> = { readonly input: T; readonly actor: Actor };
type PlannedWorkbook = Awaited<ReturnType<typeof planProductWorkbook>>;
type Deps = {
  readonly uow: UnitOfWork<ProductWorkbookStores>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly files: FileStore;
  readonly previewFiles: FileStore;
  readonly workbooks: WorkbookReader;
  readonly parse: (workbook: WorkbookLike, options: { readonly putImage: (input: Parameters<FileStore['put']>[0]) => Promise<string>; readonly anchorBarcode: string | null }) => Promise<ParsedProductWorkbook>;
  readonly generateTemplate: () => Uint8Array;
  readonly imageMime: (bytes: Uint8Array) => string | null;
  readonly hash: (bytes: Uint8Array) => string;
};
type ProductWorkbookApi = {
  readonly preview: (input: Upload, actor: Actor) => Promise<ProductWorkbookPreview>;
  readonly get: (input: Location, actor: Actor) => Promise<ProductWorkbookPreview>;
  readonly commit: (input: Location, actor: Actor) => Promise<ProductWorkbookPreview>;
  readonly template: (productId: ProductId | null, actor: Actor) => Promise<Uint8Array>;
  readonly image: (input: ImageLocation, actor: Actor) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;
};

export function makeProductWorkbookImports(deps: Deps): ProductWorkbookApi {
  return {
    preview: async (input, actor) => preview(deps, { input, actor }),
    get: async (input, actor) => inspect(deps, { input, actor, commit: false }),
    commit: async (input, actor) => inspect(deps, { input, actor, commit: true }),
    template: async (productId, actor) => {
      authorize(actor, 'imports.write');
      await deps.uow.run((tx) => ensureAnchor(tx, productId));
      return deps.generateTemplate();
    },
    image: async (input, actor) => previewImage(deps, { input, actor }),
  };
}

async function preview(deps: Deps, { input, actor }: ActorInput<Upload>): Promise<ProductWorkbookPreview> {
  authorize(actor, 'imports.write');
  if (!/\.xlsx$/iu.test(input.fileName)) throw new FileTypeNotAllowedError();
  if (input.bytes.byteLength > IMPORT_FILE_MAX_BYTES) throw new FileTooLargeError('import');
  const anchorBarcode = await deps.uow.run((tx) => ensureAnchor(tx, input.productId));
  const fileHash = deps.hash(input.bytes);
  const workbook = await readWorkbook(deps, input);
  const parsed = await deps.parse(workbook, { putImage: async (image) => (await deps.previewFiles.put(image)).sha256, anchorBarcode });
  return deps.uow.run(async (tx) => {
    const target = { anchorId: input.productId, actorId: actor.id, fileHash };
    await tx.productWorkbooks.lockUpload(target);
    const previous = await tx.productWorkbooks.lastUpload(target);
    if (input.productId === null && previous?.preview.status === 'committed') return previous.preview;
    const isReusable = previous !== undefined && ['ready', 'blocked', 'unchanged'].includes(previous.preview.status);
    const id = isReusable ? entityId(previous.preview.id) : deps.ids.next();
    const scope = await lockWorkbookScope(tx, { anchorId: input.productId, workbook: parsed });
    const stamp = { id, actorId: actor.id, at: deps.clock.now(), scope };
    const planned = await planProductWorkbook(tx, { workbook: parsed, stamp });
    if (isReusable && samePreview(previous, { deps, plan: planned })) return previous.preview;
    const receiptId = isReusable ? deps.ids.next() : id;
    const plan = isReusable ? await planProductWorkbook(tx, { workbook: parsed, stamp: { ...stamp, id: receiptId } }) : planned;
    const view = previewOf({ id: receiptId, fileName: input.fileName, plan });
    await tx.productWorkbooks.save({ anchorId: input.productId, createdBy: actor.id, fileHash, workbook: parsed, preview: view, comparison: comparisonOf(deps, plan) });
    return view;
  });
}

function previewOf({ id, fileName, plan }: { readonly id: string; readonly fileName: string; readonly plan: PlannedWorkbook }): ProductWorkbookPreview {
  const products = plan.plans.map((item) => item.view);
  const status = plan.issues.length > 0 ? 'blocked' : products.some((product) => product.changes.length > 0) ? 'ready' : 'unchanged';
  return { id, fileName, status, products, issues: plan.issues };
}

function samePreview(previous: WorkbookSession, { deps, plan }: { readonly deps: Deps; readonly plan: PlannedWorkbook }): boolean {
  return previous.comparison === comparisonOf(deps, plan)
    && JSON.stringify(previous.preview.issues.map(issueSignature)) === JSON.stringify(plan.issues.map(issueSignature));
}

async function readWorkbook(deps: Deps, input: Upload): Promise<WorkbookLike> {
  try {
    return await deps.workbooks.read(input.bytes, input.fileName);
  } catch (error) {
    throw new WorkbookUnreadableError(error);
  }
}

function comparisonOf(deps: Deps, plan: PlannedWorkbook): string {
  return deps.hash(new TextEncoder().encode(plan.comparison));
}

function issueSignature(issue: ProductWorkbookPreview['issues'][number]): readonly unknown[] {
  return [issue.sheet, issue.row, issue.field, issue.message];
}

async function inspect(deps: Deps, { input, actor, commit }: ActorInput<Location> & { readonly commit: boolean }): Promise<ProductWorkbookPreview> {
  authorize(actor, 'imports.write');
  return deps.uow.run(async (tx) => {
    const session = await lockSessionForInspection(tx, { input, actor, commit });
    const view = session.preview;
    if (commit && view.status === 'blocked') throw new StateConflictError(view.status);
    if (view.status !== 'ready' && view.status !== 'unchanged') return view;
    const scope = await lockWorkbookScope(tx, session);
    const stamp = { id: entityId(view.id), actorId: actor.id, at: deps.clock.now(), scope };
    const plan = await planProductWorkbook(tx, { workbook: session.workbook, stamp });
    if (comparisonOf(deps, plan) !== session.comparison || plan.issues.length > 0) {
      return saveStatus(tx, {
        session,
        preview: { ...view, status: 'stale', products: [], issues: plan.issues },
      });
    }
    if (!commit || view.status === 'unchanged') return view;
    await applyPlan(deps, { tx, plan });
    const products = plan.plans.map((item) => ({ ...item.view, id: item.id }));
    const affected = products.filter((product) => product.changes.length > 0).map(({ id }) => id);
    await tx.audit.record(auditOf({ action: 'product.workbook-import', subject: view, ctx: { actor, at: stamp.at, entity: '产品档案 Excel', after: { affectedProductIds: affected } } }));
    return saveStatus(tx, { session, preview: { ...view, products, status: 'committed' } });
  });
}

async function lockSessionForInspection(tx: ProductWorkbookStores, { input, actor, commit }: ActorInput<Location> & { readonly commit: boolean }): Promise<WorkbookSession> {
  if (commit && input.productId === null) {
    const { anchorId, createdBy, fileHash } = await sessionFor(tx, { input, actor, lock: false });
    await tx.productWorkbooks.lockUpload({ anchorId, actorId: createdBy, fileHash });
  }
  return sessionFor(tx, { input, actor, lock: true });
}

async function applyPlan(deps: Deps, { tx, plan }: { readonly tx: ProductWorkbookStores; readonly plan: PlannedWorkbook }): Promise<void> {
  for (const { id, view, product, contact, images, parts, owners } of plan.plans) {
    if (product !== undefined) await tx.products.save(product);
    if (contact !== undefined) await tx.productContacts.replaceRole({ productId: id, role: 'product_info', people: [contact] });
    for (const image of images) {
      if (image.hiddenAt === null) await requirePreviewImage(deps, image.fileId);
      await tx.productImages.save(image);
    }
    if (parts !== undefined) await tx.bomLines.replace(view.barcode, parts);
    for (const owner of owners) await tx.productOwners.set({ productId: id, ...owner });
  }
}

async function requirePreviewImage(deps: Deps, sha256: string): Promise<void> {
  const bytes = await deps.previewFiles.read(sha256);
  const mime = bytes === undefined ? null : deps.imageMime(bytes);
  if (bytes === undefined || mime === null) throw new StateConflictError('missing_workbook_image');
}

async function previewImage(deps: Deps, { input, actor }: ActorInput<ImageLocation>) {
  authorize(actor, 'imports.write');
  const session = await deps.uow.run((tx) => sessionFor(tx, { input, actor, lock: false }));
  const ending = `/images/${encodeURIComponent(input.sha256)}`;
  const changes = session.preview.products.flatMap((product) => product.changes);
  const hasPrevious = changes.some((change) => change.beforeImageUrl?.endsWith(ending));
  const hasNext = changes.some((change) => change.afterImageUrl?.endsWith(ending));
  const previousBytes = hasPrevious ? await deps.files.read(input.sha256) : undefined;
  const bytes = previousBytes ?? (hasPrevious || hasNext ? await deps.previewFiles.read(input.sha256) : undefined);
  const mime = bytes === undefined ? null : deps.imageMime(bytes) ?? (hasPrevious ? legacyRasterMime(bytes) : null);
  if (bytes === undefined || mime === null) throw new NotFoundError('预览图片');
  return { bytes, mime };
}

function legacyRasterMime(bytes: Uint8Array): string | null {
  const header = new TextDecoder().decode(bytes.subarray(0, 'GIF89a'.length));
  if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  if (header.startsWith('BM')) return 'image/bmp';
  return null;
}

async function ensureAnchor(tx: ProductWorkbookStores, id: ProductId | null): Promise<string | null> {
  if (id === null) return null;
  const product = await tx.products.find(id);
  if (product === undefined) throw new NotFoundError('产品', id);
  return product.barcodeRaw;
}

async function lockWorkbookScope(tx: ProductWorkbookStores, { anchorId, workbook }: Pick<WorkbookSession, 'anchorId' | 'workbook'>): Promise<WorkbookScope> {
  if (anchorId === null) {
    await tx.productWorkbooks.lockProducts(workbookBarcodes(workbook));
    return { kind: 'catalog' };
  }
  const product = await tx.products.get(anchorId);
  return { kind: 'product', productId: product.id, barcode: product.barcodeRaw };
}

async function sessionFor(tx: ProductWorkbookStores, { input, actor, lock }: ActorInput<Location> & { readonly lock: boolean }): Promise<WorkbookSession> {
  const session = await tx.productWorkbooks.find({ id: input.batchId, anchorId: input.productId, actorId: actor.id, lock });
  if (session === undefined) throw new NotFoundError('产品档案导入预览', input.batchId);
  return session;
}

async function saveStatus(tx: ProductWorkbookStores, { session, preview }: { readonly session: WorkbookSession; readonly preview: ProductWorkbookPreview }): Promise<ProductWorkbookPreview> {
  await tx.productWorkbooks.save({ ...session, preview });
  return preview;
}
