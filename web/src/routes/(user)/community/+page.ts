import { queryClient } from '#lib/queries/client.ts';
import {
  getCommunityDirectoryQuery,
  getCommunityFollowingQuery,
  getCommunityMineQuery,
  getCommunityPickerQuery,
} from '#lib/queries/pholy-community.query.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  await Promise.all([
    queryClient.query(getCommunityMineQuery()),
    queryClient.query(getCommunityPickerQuery()),
    queryClient.query(getCommunityDirectoryQuery()),
    queryClient.query(getCommunityFollowingQuery()),
  ]);
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_community.title') } };
}) satisfies PageLoad;
