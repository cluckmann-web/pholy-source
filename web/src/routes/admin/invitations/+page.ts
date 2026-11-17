import { queryClient } from '#lib/queries/client.ts';
import { getPholyAuthStatusQuery } from '#lib/queries/pholy-auth.query.ts';
import { getPholyInvitationsQuery } from '#lib/queries/pholy-invitation.query.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url, { admin: true });
  await Promise.all([queryClient.query(getPholyInvitationsQuery()), queryClient.query(getPholyAuthStatusQuery())]);
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_invitation.admin_title') } };
}) satisfies PageLoad;
