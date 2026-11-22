import { ERROR_CODE_LABELS, type ErrorCode } from '@sw/domain';

const NEXT: Partial<Record<ErrorCode, string>> = {
  UNDO_WINDOW_EXPIRED: '如果登记错了，请在时间线里把它作废。',
  IMPORT_HAS_CONFLICTS: '先处理冲突行，再确认导入。',
  IMPORT_FACTORY_REQUIRED: '先选择代工厂，再开始解析。',
  FEISHU_NOT_CONFIGURED: '请管理员在设置里配置飞书应用。',
};

export function errorText(code: ErrorCode): string {
  const next = NEXT[code];
  return next === undefined ? ERROR_CODE_LABELS[code] : `${ERROR_CODE_LABELS[code]}。${next}`;
}
