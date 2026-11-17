import { createZodDto } from 'nestjs-zod';
import z from 'zod';
import { toEmail } from 'src/validation.js';

export const PHOLY_TERMS_VERSION = '2026-11-17';
const token = z.string().regex(/^[\w-]{43}$/);
export class PholyInvitationCreateDto extends createZodDto(
  z
    .object({
      email: toEmail,
      sendEmail: z.boolean().optional().default(false),
      quotaGiB: z.number().int().min(1).max(10_000).nullable().default(null),
    })
    .strict(),
) {}
export class PholyInvitationTokenDto extends createZodDto(z.object({ token }).strict()) {}
export class PholyInvitationAcceptDto extends createZodDto(
  z
    .object({
      token,
      name: z.string().trim().min(2).max(100),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes'),
      termsAccepted: z.literal(true),
      termsVersion: z.literal(PHOLY_TERMS_VERSION),
    })
    .strict(),
) {}
