import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/);
export class PholyCommunitySlugDto extends createZodDto(z.object({ slug })) {}
export class PholyCommunityAssetParamDto extends createZodDto(z.object({ slug, id: z.uuid() })) {}
export class PholyCommunityProfileDto extends createZodDto(
  z
    .object({
      slug,
      displayName: z.string().trim().min(2).max(60),
      bio: z.string().trim().max(600),
      published: z.boolean(),
      assetIds: z
        .array(z.uuid())
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, 'Duplicate photo'),
    })
    .strict(),
) {}
export class PholyCommunityPageDto extends createZodDto(
  z.object({ offset: z.coerce.number().int().min(0).max(100_000).default(0) }).strict(),
) {}
export class PholyCommunityReportDto extends createZodDto(
  z
    .object({
      slug,
      assetId: z.uuid().nullable().default(null),
      reason: z.enum(['privacy', 'copyright', 'abuse', 'other']),
      details: z.string().trim().min(10).max(2000),
    })
    .strict(),
) {}
export class PholyCommunityModerateDto extends createZodDto(
  z
    .object({
      action: z.enum(['dismiss', 'hide_asset', 'disable_profile', 'restore_profile', 'restore_asset']),
    })
    .strict(),
) {}
