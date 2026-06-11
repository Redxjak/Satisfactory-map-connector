import { z } from 'zod';
import { HttpError } from './http-error.js';

export const connectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(4096),
  remoteDir: z.string().trim().min(1).max(1024),
  active: z.boolean().default(true),
});

export const updateConnectionSchema = connectionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
);

export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new HttpError(400, message);
  }
  return result.data;
}
