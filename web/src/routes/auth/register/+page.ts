import { readPreloadedQuery } from '#lib/queries/client.ts';
import { getServerConfigQuery } from '#lib/queries/server-info.query.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ parent }) => {
  await parent();
  const isInitialized = readPreloadedQuery(getServerConfigQuery()).isInitialized;

  const $t = await getFormatter();

  return {
    isInitialized,
    meta: {
      title: isInitialized ? $t('pholy_invitation.title') : $t('admin.registration'),
    },
  };
}) satisfies PageLoad;
