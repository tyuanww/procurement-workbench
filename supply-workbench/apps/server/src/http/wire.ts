import { HttpError } from './plugins/errors.js';

type Schema = { safeParse(value: unknown): { success: boolean } };

export function wire(schema: Schema, value: unknown): unknown {
  const body: unknown = JSON.parse(JSON.stringify(value));
  if (schema.safeParse(body).success) return value;
  throw new HttpError({ code: 'INTERNAL', message: '内部错误' });
}
