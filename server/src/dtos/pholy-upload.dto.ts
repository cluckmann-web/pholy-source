import { createZodDto } from 'nestjs-zod';
import z from 'zod';
import { AssetVisibilitySchema } from 'src/enum.js';

export const PHOLY_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
export const PHOLY_UPLOAD_LIFETIME = 7 * 24 * 60 * 60 * 1000;

export class PholyUploadCreateDto extends createZodDto(
  z
    .object({
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
        .positive()
        .max(1024 ** 4),
      fileModifiedAt: z.iso.datetime({ offset: true }),
      fileCreatedAt: z.iso.datetime({ offset: true }).optional(),
      mimeType: z.string().max(255),
      checksum: z.string().regex(/^(?:[a-fA-F0-9]{40}|[A-Za-z0-9+/]{27}=)$/),
      visibility: AssetVisibilitySchema.optional(),
    })
    .strict(),
) {}
