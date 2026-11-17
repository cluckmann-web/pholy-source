import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class PholyAccountVerifyDto extends createZodDto(z.object({ password: z.string().min(1).max(256) })) {}
export class PholyAccountCloseDto extends createZodDto(
  z.object({
    password: z.string().min(1).max(256),
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    confirm: z.literal(true),
  }),
) {}
export class PholyAccountPartDto extends createZodDto(z.object({ cursor: z.uuid().optional() })) {}
