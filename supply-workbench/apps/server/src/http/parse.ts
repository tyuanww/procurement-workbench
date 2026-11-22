import { HttpError } from './plugins/errors.js';
import type { z } from 'zod';

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) throw new HttpError({ code: 'VALIDATION_FAILED', message: '请求不合法', details: { issues: parsed.error.issues } });
  return parsed.data;
}
