import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const pholySupportCategory = z.enum(['upload', 'account', 'storage', 'app', 'privacy', 'other']);
export const pholySupportStatus = z.enum(['open', 'waiting', 'resolved']);
const message = z.string().trim().min(3).max(8000);
export class PholySupportCreateDto extends createZodDto(
  z.object({ category: pholySupportCategory, subject: z.string().trim().min(3).max(160), message }).strict(),
) {}
export class PholySupportReplyDto extends createZodDto(z.object({ message }).strict()) {}
export class PholySupportUpdateDto extends createZodDto(z.object({ status: pholySupportStatus }).strict()) {}
export class PholySupportListDto extends createZodDto(
  z
    .object({ offset: z.coerce.number().int().min(0).max(100_000).default(0), status: pholySupportStatus.optional() })
    .strict(),
) {}
