import { queryClient } from '#lib/queries/client.ts';
import { getPholySupportQuery } from '#lib/queries/pholy-support.query.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  await queryClient.query(getPholySupportQuery()).catch(() => undefined);
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_support.help_title') } };
}) satisfies PageLoad;
