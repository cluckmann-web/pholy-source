import { queryClient } from '#lib/queries/client.ts';
import { getPholyHistoryQuery, getPholyQuotaQuery } from '#lib/queries/pholy-history.query.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  await Promise.all([queryClient.query(getPholyHistoryQuery()), queryClient.query(getPholyQuotaQuery())]);
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_history_title') } };
}) satisfies PageLoad;
