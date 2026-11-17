import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const context = z.object({
  kind: z.enum(['private', 'album', 'community']),
  albumId: z.uuid().optional(),
  // `slug` is reserved for Immich shared-link authentication query parameters.
  profileSlug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/)
    .optional(),
});
const validContext = (value: z.infer<typeof context>) =>
  value.kind === 'private'
    ? value.albumId === undefined && value.profileSlug === undefined
    : value.kind === 'album'
      ? value.albumId !== undefined && value.profileSlug === undefined
      : value.profileSlug !== undefined && value.albumId === undefined;
const body = z.string().trim().min(1).max(2000);

export class PholyCommentContextDto extends createZodDto(
  context.strict().refine(validContext, 'Invalid comment context'),
) {}
export class PholyCommentListDto extends createZodDto(
  context
    .extend({ offset: z.coerce.number().int().min(0).max(500).default(0) })
    .strict()
    .refine(validContext, 'Invalid comment context'),
) {}
export class PholyCommentCreateDto extends createZodDto(
  context.extend({ body, parentId: z.uuid().optional() }).strict().refine(validContext, 'Invalid comment context'),
) {}
export class PholyCommentEditDto extends createZodDto(
  context.extend({ body }).strict().refine(validContext, 'Invalid comment context'),
) {}
export class PholyCommentAssetParamDto extends createZodDto(z.object({ assetId: z.uuid() })) {}
export class PholyCommentParamDto extends createZodDto(z.object({ assetId: z.uuid(), commentId: z.uuid() })) {}
export class PholyCommentAuthorParamDto extends createZodDto(z.object({ assetId: z.uuid(), userId: z.uuid() })) {}
