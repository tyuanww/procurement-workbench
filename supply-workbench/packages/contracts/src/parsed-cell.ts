import { z } from 'zod';
import { PoFormatSchema } from './enums.js';
import { nullable, strictObject } from './shape.js';
import { LocalDateSchema } from './values.js';

export function parsedCellSchema<T>(value: z.ZodType<T>) {
  return strictObject({
    raw: nullable(z.string()),
    value: nullable(value),
  });
}

export const ParsedPoSchema = strictObject({
  poRaw: nullable(z.string()),
  poNorm: nullable(z.string()),
  poFormat: PoFormatSchema,
  relatedPoRaws: z.array(z.string()),
});

export const parsedText = parsedCellSchema(z.string());
export const parsedNumber = parsedCellSchema(z.number());
export const parsedDate = parsedCellSchema(LocalDateSchema);
export const parsedPo = parsedCellSchema(ParsedPoSchema);
