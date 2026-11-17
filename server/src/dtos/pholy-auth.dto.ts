import { createZodDto } from 'nestjs-zod';
import z from 'zod';
import { toEmail } from 'src/validation.js';

export class PholyForgotPasswordDto extends createZodDto(z.object({ email: toEmail }).strict()) {}
export class PholyResetPasswordDto extends createZodDto(
  z
    .object({
      token: z.string().regex(/^[\w-]{43}$/),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes'),
    })
    .strict(),
) {}
