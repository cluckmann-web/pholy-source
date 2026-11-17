import { queryClient } from '#lib/queries/client.ts';
import { getPholyInvitationsQuery } from '#lib/queries/pholy-invitation.query.ts';
import { getQueuesQuery } from '#lib/queries/queue.query.ts';
import { getStorageQuery } from '#lib/queries/server-info.query.ts';
import { searchUsersAdminQuery } from '#lib/queries/user-admin.query.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url, { admin: true });
  // A failed status endpoint must not hide the other administration sections.
  await Promise.allSettled([
    queryClient.query({ ...searchUsersAdminQuery(), staleTime: 0 }),
    queryClient.query(getPholyInvitationsQuery()),
    queryClient.query(getQueuesQuery()),
    queryClient.query({ ...getStorageQuery(), staleTime: 0 }),
  ]);
  const $t = await getFormatter();
  return { meta: { title: $t('pholy_admin_title') } };
}) satisfies PageLoad;
