import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { queryClient } from '#lib/queries/client.ts';
import {
  CommunityRequestError,
  getCommunityProfileQuery,
  getCommunityRelationQuery,
} from '#lib/queries/pholy-community.query.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
  const $t = await getFormatter();
  try {
    const profile = await queryClient.query(getCommunityProfileQuery(params.slug));
    await authManager.load();
    if (authManager.authenticated) await queryClient.query(getCommunityRelationQuery(params.slug));
    return { slug: params.slug, available: true, meta: { title: profile.displayName + ' · PHOLY' } };
  } catch (error) {
    if (!(error instanceof CommunityRequestError) || error.status !== 404) throw error;
    return { slug: params.slug, available: false, meta: { title: $t('pholy_community.unavailable') } };
  }
}) satisfies PageLoad;
