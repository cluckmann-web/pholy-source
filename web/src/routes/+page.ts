import { readPreloadedQuery } from '#lib/queries/client.ts';
import { getServerConfigQuery } from '#lib/queries/server-info.query.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const ssr = false;
export const csr = true;

export const load = (async ({ parent }) => {
  const { error } = await parent();
  const isInitialized = Boolean(error) || readPreloadedQuery(getServerConfigQuery()).isInitialized;
  const $t = await getFormatter();
  return {
    isInitialized,
    meta: { title: isInitialized ? $t('pholy_landing.page_title') : $t('welcome') + ' 🎉' },
  };
}) satisfies PageLoad;
