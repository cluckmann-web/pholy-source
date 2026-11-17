import { queryClient } from '#lib/queries/client.ts';
import { getCommunityModerationQuery } from '#lib/queries/pholy-community.query.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url, { admin: true });
  await queryClient.query(getCommunityModerationQuery());
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_community.moderation_title') } };
}) satisfies PageLoad;
