import { queryClient } from '#lib/queries/client.ts';
import { getPholyAccountQuery } from '#lib/queries/pholy-account.query.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  await queryClient.query(getPholyAccountQuery());
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_account.title') } };
}) satisfies PageLoad;
