import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ parent }) => {
  await parent();
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_auth.reset_title') } };
}) satisfies PageLoad;
