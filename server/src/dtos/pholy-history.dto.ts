import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const PHOLY_HISTORY_RETENTION_DAYS = 90;
export const PHOLY_HISTORY_PAGE_SIZE = 100;

export class PholyHistorySearchDto extends createZodDto(
  z
    .object({
      page: z.coerce.number().int().min(0).max(10_000).default(0),
    })
    .strict(),
) {}

// Browser reports describe attempts only. Accepted media is recorded by the server's AssetCreate event.
export class PholyHistoryAttemptDto extends createZodDto(
  z
    .object({
      id: z.uuid(),
      fileName: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[^/\\]+$/)
        .refine(
          (name) => [...name].every((character) => character.codePointAt(0)! >= 32),
          'Filename contains control characters',
        ),
      fileSize: z
        .number()
        .int()
        .min(0)
        .max(1024 ** 4),
      status: z.enum(['duplicate', 'cancelled', 'failed', 'accepted']),
      assetId: z.uuid().optional(),
    })
    .strict()
    .refine((value) => value.status !== 'accepted' || !!value.assetId, {
      message: 'Accepted uploads require an existing asset.',
    }),
) {}
