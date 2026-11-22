import { z } from 'zod';
import { nullable, strictObject } from './shape.js';

export const partyRef = strictObject({
  id: nullable(z.string()),
  displayName: nullable(z.string()),
  rawName: nullable(z.string()),
});

export const UserRef = strictObject({ id: z.string(), name: z.string() });
