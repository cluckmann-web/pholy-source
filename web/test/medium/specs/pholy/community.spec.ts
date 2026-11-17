import type { CommunityMine } from '#lib/queries/pholy-community.query.ts';
import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';

const pattern = '**/api/pholy/community**';
const slug = 'synthetic-gallery';
const assetId = '00000000-0000-4000-8000-000000000101';
const profile = {
  slug,
  displayName: 'Synthetic Gallery',
  bio: 'A deliberately public selection.',
  assets: [{ id: assetId }],
  followers: 1,
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=',
  'base64',
);
test.use({ language: 'de' });
test.afterEach(async ({ page }) => {
  await page.unroute(pattern);
});

test('public profile is accessible anonymously without exposing private account information', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.route(pattern, (route) =>
    route
      .request()
      .url()
      .endsWith('/assets/' + assetId)
      ? route.fulfill({ contentType: 'image/png', body: png })
      : route.fulfill({ json: profile }),
  );
  await page.goto(Route.communityProfile(slug));
  await expect(page.getByRole('heading', { name: profile.displayName })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Öffentliches Galeriefoto von Synthetic Gallery' })).toBeVisible();
  await expect(page.getByText('Melde dich an, um Profilen zu folgen oder Inhalte zu melden.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Folgen', exact: true })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
});

test('private or withdrawn public profiles show no gallery', async ({ page, context, logger }) => {
  await context.clearCookies();
  await page.route(pattern, (route) =>
    route.fulfill({ status: 404, json: { message: 'Dieses Profil ist nicht öffentlich verfügbar.' } }),
  );
  await page.goto(Route.communityProfile(slug));
  await expect(page.getByRole('heading', { name: 'Dieses Profil ist nicht öffentlich verfügbar.' })).toBeVisible();
  await expect(page.locator('.public-gallery img')).toHaveCount(0);
  expect(logger.error).toHaveBeenCalledWith(/404/);
});

for (const width of [1440, 320]) {
  test(
    'explicit selection publishes only checked photos and immediate opt-out works at ' + width + 'px',
    async ({ page, data }) => {
      data.user.isAdmin = false;
      const asset = factory.asset({ id: assetId, originalFileName: 'synthetic-photo.png', ownerId: data.user.id });
      data.addAssets(asset);
      let mine: CommunityMine = { profile: null, assets: [] };
      let submitted: unknown;
      let withdrawals = 0;
      await page.setViewportSize({ width, height: 1000 });
      await page.route(pattern, async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (path.endsWith('/publication')) {
          withdrawals++;
          mine = { ...mine, profile: mine.profile ? { ...mine.profile, published: false } : null };
          await route.fulfill({ json: mine });
        } else if (path.endsWith('/me') && req.method() === 'PUT') {
          const body = req.postDataJSON();
          submitted = body;
          mine = {
            profile: {
              slug: body.slug,
              displayName: body.displayName,
              bio: body.bio,
              published: body.published,
              blocked: false,
            },
            assets: body.assetIds.map((id: string) => ({
              assetId: id,
              hidden: false,
              originalFileName: asset.originalFileName,
            })),
          };
          await route.fulfill({ json: mine });
        } else if (path.endsWith('/me')) await route.fulfill({ json: mine });
        else if (path.endsWith('/me/assets'))
          await route.fulfill({
            json: { assets: [{ id: assetId, originalFileName: asset.originalFileName }], nextOffset: null },
          });
        else await route.fulfill({ json: { profiles: [], nextOffset: null } });
      });
      await page.goto(Route.community());
      await expect(page.getByText('Dein Profil ist privat.', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Profil und ausgewählte Fotos öffentlich anzeigen')).not.toBeChecked();
      await page.getByLabel('Öffentlicher Anzeigename').fill(profile.displayName);
      await page.getByLabel('Profiladresse', { exact: true }).fill(slug);
      await page.getByLabel('Über deine Fotografie').fill(profile.bio);
      await page.getByRole('checkbox', { name: asset.originalFileName, exact: true }).check();
      await page.getByLabel('Profil und ausgewählte Fotos öffentlich anzeigen').check();
      await page.getByRole('button', { name: 'Auswahl und Profil speichern' }).click();
      await expect(page.getByText('Profil und Auswahl wurden gespeichert.', { exact: true })).toBeVisible();
      expect(submitted).toEqual({
        slug,
        displayName: profile.displayName,
        bio: profile.bio,
        published: true,
        assetIds: [assetId],
      });
      await expect(page.getByRole('link', { name: 'Öffentliches Profil ansehen' })).toHaveAttribute(
        'href',
        Route.communityProfile(slug),
      );
      await page.getByRole('button', { name: 'Sofort privat stellen' }).click();
      await expect(page.getByText('Dein Profil ist privat.', { exact: true })).toBeVisible();
      expect(withdrawals).toBe(1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1);
    },
  );
}

test('members can follow and send a private moderation report for a selected photo', async ({ page, data }) => {
  data.user.isAdmin = false;
  let following = false;
  const reports: unknown[] = [];
  await page.route(pattern, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/assets/' + assetId)) await route.fulfill({ contentType: 'image/png', body: png });
    else if (path.endsWith('/follow')) {
      following = req.method() === 'PUT';
      await route.fulfill({ json: { following, ownProfile: false } });
    } else if (path.endsWith('/relation')) await route.fulfill({ json: { following, ownProfile: false } });
    else if (path.endsWith('/reports')) {
      reports.push(req.postDataJSON());
      await route.fulfill({ json: { received: true } });
    } else await route.fulfill({ json: profile });
  });
  await page.goto(Route.communityProfile(slug));
  await page.getByRole('button', { name: 'Folgen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nicht mehr folgen' })).toBeVisible();
  expect(following).toBe(true);
  await page.getByRole('button', { name: 'Foto melden' }).click();
  await page.getByLabel('Beschreibung', { exact: true }).fill('Synthetic privacy concern for a selected photo.');
  await page.getByRole('button', { name: 'Meldung absenden' }).click();
  await expect(page.getByText('Deine Meldung ist bei der Moderation eingegangen.')).toBeVisible();
  expect(reports).toEqual([
    { slug, assetId, reason: 'privacy', details: 'Synthetic privacy concern for a selected photo.' },
  ]);
});

test('moderation requires an explicit decision and reports the resulting visibility state', async ({ page, data }) => {
  data.user.isAdmin = true;
  const report = {
    id: '00000000-0000-4000-8000-000000000201',
    assetId,
    reason: 'privacy',
    details: 'Synthetic privacy report for review.',
    createdAt: '2026-11-17T12:00:00Z',
    resolvedAt: null as string | null,
    action: null as string | null,
    slug,
    displayName: profile.displayName,
    blocked: false,
    hidden: false,
  };
  const actions: unknown[] = [];
  await page.route(pattern, async (route) => {
    if (route.request().method() === 'PATCH') {
      actions.push(route.request().postDataJSON());
      report.hidden = true;
      report.action = 'hide_asset';
      report.resolvedAt = new Date().toISOString();
      await route.fulfill({ json: { resolved: true } });
    } else await route.fulfill({ json: [report] });
  });
  await page.goto(Route.adminCommunity());
  await page.getByRole('button', { name: 'Foto öffentlich ausblenden', exact: true }).click();
  expect(actions).toEqual([]);
  await page.getByRole('button', { name: 'Entscheidung bestätigen' }).click();
  await expect(page.getByText('Moderationsentscheidung gespeichert.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fotosperre aufheben' })).toBeVisible();
  expect(actions).toEqual([{ action: 'hide_asset' }]);
});
