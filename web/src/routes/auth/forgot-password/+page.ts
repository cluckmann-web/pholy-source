import { queryClient } from '#lib/queries/client.ts';
import { getPholyAuthStatusQuery } from '#lib/queries/pholy-auth.query.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ parent }) => {
  await parent();
  await queryClient.query(getPholyAuthStatusQuery());
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_auth.forgot_title') } };
}) satisfies PageLoad;
