import { z } from 'zod';

export const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const optional = <T extends z.ZodType>(schema: T) => z.exactOptional(schema);

export const nullable = <T extends z.ZodType>(schema: T) => z.nullable(schema);
