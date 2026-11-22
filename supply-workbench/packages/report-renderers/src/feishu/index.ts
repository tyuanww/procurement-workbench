import { AppError } from '../../../application/src/shared/errors.js';
import type { DocumentPublisher } from '../../../application/src/ports/document-publisher.js';
import type { WeeklyReportData } from '../../../application/src/reporting/views.js';
import { managementMeetingTables } from '../management-meeting.js';

type FetchLike = (url: string, init: { readonly method: string; readonly headers: Record<string, string>; readonly body: string }) => Promise<{ readonly ok: boolean; readonly status: number; readonly json: () => Promise<unknown> }>;

export type FeishuBlock = { readonly blockType: 'heading' | 'paragraph' | 'table'; readonly text: string };
const BLOCKS_PER_REQUEST = 20;
const TEXT_SEGMENTS = /[\s\S]{1,1000}/gu;

export function weeklyBlocks(data: WeeklyReportData): FeishuBlock[] {
  return [
    { blockType: 'heading', text: '周报' },
    { blockType: 'paragraph', text: `应到 ${data.overview.dueBatches.value}，逾期 ${data.overview.overdue.value}` },
    { blockType: 'table', text: data.risks.map((row) => `${row.batchId} ${row.nameRaw ?? ''}`).join('\n') },
    ...managementMeetingTables(data.managementMeeting).flatMap(({ title, headers, rows }): FeishuBlock[] => [
      { blockType: 'heading', text: title },
      { blockType: 'table', text: [headers, ...rows].map((row) => row.map((cell) => cell.replaceAll('\n', '；')).join(' | ')).join('\n') },
    ]),
  ];
}

export function feishuPublisher(input: { readonly appId: string; readonly appSecret: string; readonly folderToken: string; readonly fetchImpl?: FetchLike; readonly baseUrl?: string }): DocumentPublisher {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.baseUrl ?? 'https://open.feishu.cn';
  return { publish: (data) => publish({ ...input, data, fetchImpl, baseUrl }) };
}

async function publish(input: { readonly appId: string; readonly appSecret: string; readonly folderToken: string; readonly data: WeeklyReportData; readonly fetchImpl: FetchLike; readonly baseUrl: string }): Promise<{ readonly docUrl: string }> {
  const token = await tenantToken(input);
  const documentId = await createDoc(input, token);
  await writeBlocks({ input, token, documentId });
  return { docUrl: `${input.baseUrl}/docx/${documentId}` };
}

async function tenantToken(input: { readonly appId: string; readonly appSecret: string; readonly fetchImpl: FetchLike; readonly baseUrl: string }): Promise<string> {
  const response = await input.fetchImpl(`${input.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: input.appId, app_secret: input.appSecret }),
  });
  const body = await response.json();
  if (!response.ok || !isToken(body)) throw callError('飞书令牌失败', body);
  return body.tenant_access_token;
}

async function createDoc(input: { readonly folderToken: string; readonly fetchImpl: FetchLike; readonly baseUrl: string }, token: string): Promise<string> {
  const response = await input.fetchImpl(`${input.baseUrl}/open-apis/docx/v1/documents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ folder_token: input.folderToken, title: '周报' }),
  });
  const body = await response.json();
  if (!response.ok || !isDoc(body)) throw callError('飞书写入失败', body);
  return body.data.document.document_id;
}

async function writeBlocks({ input, token, documentId }: { readonly input: { readonly data: WeeklyReportData; readonly fetchImpl: FetchLike; readonly baseUrl: string }; readonly token: string; readonly documentId: string }): Promise<void> {
  const url = `${input.baseUrl}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`;
  const blocks = weeklyBlocks(input.data).flatMap(({ blockType, text }) =>
    text.split('\n').flatMap((line) => (line.match(TEXT_SEGMENTS) ?? []).map((content) => documentBlock(blockType, content))),
  );
  for (let offset = 0; offset < blocks.length; offset += BLOCKS_PER_REQUEST) {
    const response = await input.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ index: -1, children: blocks.slice(offset, offset + BLOCKS_PER_REQUEST) }),
    });
    const body = await response.json();
    if (!response.ok || !succeeded(body)) throw callError('飞书写入失败', body);
  }
}

function documentBlock(kind: FeishuBlock['blockType'], content: string) {
  const text = { elements: [{ text_run: { content } }] };
  return kind === 'heading' ? { block_type: 3, heading1: text } : { block_type: 2, text };
}

function callError(message: string, cause: unknown): AppError {
  const error = new AppError({ code: 'INTERNAL', message, details: { cause: String(cause) } });
  error.cause = cause;
  return error;
}

function isToken(value: unknown): value is { readonly tenant_access_token: string } {
  return succeeded(value) && typeof value.tenant_access_token === 'string';
}

function isDoc(value: unknown): value is { readonly data: { readonly document: { readonly document_id: string } } } {
  return succeeded(value) && isRecord(value.data) && isRecord(value.data.document) && typeof value.data.document.document_id === 'string';
}

function succeeded(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.code === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
