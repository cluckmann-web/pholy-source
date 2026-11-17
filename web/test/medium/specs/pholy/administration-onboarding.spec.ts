import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import { QueueName, type QueueResponseDto } from '@immich/sdk';

test.use({ language: 'de' });

const queues: QueueResponseDto[] = [
  {
    name: QueueName.ThumbnailGeneration,
    isPaused: false,
    statistics: { active: 2, waiting: 3, delayed: 1, paused: 0, failed: 4, completed: 50 },
  },
  {
    name: QueueName.VideoConversion,
    isPaused: true,
    statistics: { active: 0, waiting: 0, delayed: 0, paused: 6, failed: 0, completed: 20 },
  },
];
const invitation = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'synthetic-invite@example.test',
  createdAt: '2026-01-01T00:00:00Z',
  expiresAt: '2099-01-01T00:00:00Z',
  usedAt: null,
  revokedAt: null,
  quotaSizeInBytes: 100 * 1024 ** 3,
};

test.afterEach(async ({ page }) => {
  await page.unroute('**/api/pholy/invitations**');
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('pholy:onboarding:v1:')) localStorage.removeItem(key);
    }
  });
});

test('admin overview combines existing storage, invitation and processing data', async ({ page, data, api }) => {
  api.on({ getQueues: () => ({ json: queues }) });
  const nearQuota = factory.user({
    name: 'Synthetic near quota',
    quotaSizeInBytes: 100 * 1024 ** 3,
    quotaUsageInBytes: 95 * 1024 ** 3,
  });
  const deleted = factory.user({ name: 'Synthetic deleted', deletedAt: '2026-01-01T00:00:00Z' });
  data.addUsers([nearQuota, deleted]);
  await page.route('**/api/pholy/invitations**', (route) =>
    route.fulfill({
      json: [
        invitation,
        { ...invitation, id: 'used', usedAt: '2026-01-02T00:00:00Z' },
        { ...invitation, id: 'revoked', revokedAt: '2026-01-02T00:00:00Z' },
        { ...invitation, id: 'expired', expiresAt: '2020-01-01T00:00:00Z' },
      ],
    }),
  );
  await page.goto(Route.admin());
  const cards = page.locator('.summary-card');
  await expect(cards.nth(0).locator('strong')).toHaveText('2');
  await expect(cards.nth(1).locator('strong')).toHaveText('1');
  await expect(cards.nth(2).locator('strong')).toHaveText('2');
  await expect(cards.nth(2)).toContainText('10 warten');
  await expect(cards.nth(3).locator('strong')).toHaveText('4');
  await expect(page.getByText('Mindestens 90 % belegt')).toBeVisible();
  await expect(page.getByText(deleted.name)).toHaveCount(0);
  await expect(page.getByRole('link', { name: nearQuota.name, exact: true })).toHaveAttribute(
    'href',
    Route.viewUser(nearQuota),
  );
  await expect(page.getByText('1 Warteschlangen pausiert. Vor dem Fortsetzen prüfen.')).toBeVisible();
  await expect(page.getByRole('table').locator('a').first()).toHaveAttribute('href', Route.viewQueue(queues[0]));
  await expect(page.getByRole('link', { name: 'Einladungslink erstellen', exact: true })).toHaveAttribute(
    'href',
    Route.invitations(),
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
  }
  expect(api.getQueues).toHaveBeenCalled();
});

test('one failing status endpoint leaves other administration sections usable', async ({ page, api, logger }) => {
  api.on({ getQueues: () => ({ status: 503, json: { message: 'Synthetic unavailable status' } }) });
  await page.route('**/api/pholy/invitations**', (route) => route.fulfill({ json: [] }));
  await page.goto(Route.admin());
  await expect(page.getByRole('alert')).toContainText('Dieser Status konnte nicht geladen werden.');
  await expect(page.getByRole('link', { name: 'Einladungslink erstellen', exact: true })).toBeVisible();
  await expect(page.locator('.storage-value')).toBeVisible();
  expect(logger.error).toHaveBeenCalledWith(/503/);
  api.on({ getQueues: () => ({ json: queues }) });
  await page.getByRole('button', { name: 'Aktualisieren', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.summary-card').nth(3).locator('strong')).toHaveText('4');
});

test('the overview does not expose admin endpoints to a regular account', async ({ page, data, api }) => {
  data.user.isAdmin = false;
  await page.goto(Route.admin());
  await expect(page).toHaveURL(Route.photos());
  expect(api.searchUsersAdmin).not.toHaveBeenCalled();
  expect(api.getQueues).not.toHaveBeenCalled();
});

test('new-account guide persists dismissal and app progress and reopens from settings', async ({ page, data }) => {
  data.user.quotaUsageInBytes = 0;
  await page.goto(Route.photos());
  const guide = page.getByTestId('pholy-onboarding');
  await expect(guide).toBeVisible();
  await expect(guide.locator('code')).toHaveText('https://pholy.de');
  await expect(guide.getByRole('link', { name: 'App Store' })).toHaveAttribute(
    'href',
    'https://apps.apple.com/us/app/immich/id1613945652',
  );
  await expect(guide.getByRole('link', { name: 'Google Play' })).toHaveAttribute(
    'href',
    'https://play.google.com/store/apps/details?id=app.alextran.immich',
  );
  await guide.getByRole('checkbox', { name: 'Ich habe die App verbunden' }).check();
  await expect(guide.getByText('1 von 3 Schritten abgeschlossen')).toBeVisible();
  await guide.getByRole('button', { name: 'Vorerst ausblenden' }).click();
  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.goto(Route.userSettings());
  await page.getByRole('button', { name: 'Erste Schritte mit PHOLY' }).click();
  await expect(guide.getByRole('checkbox', { name: 'Ich habe die App verbunden' })).toBeChecked();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
  }
});

test('onboarding creates one album through the existing API and opens the upload picker', async ({
  page,
  data,
  api,
}) => {
  data.user.quotaUsageInBytes = 0;
  await page.goto(Route.photos());
  await page.getByRole('button', { name: 'Erstes Album erstellen', exact: true }).click();
  await expect(page).toHaveURL(/\/albums\/[0-9a-f-]+$/);
  expect(api.createAlbum).toHaveBeenCalledWith({ body: { albumName: 'Mein erstes Album' } });
  await page.goto(Route.photos());
  const guide = page.getByTestId('pholy-onboarding');
  await expect(guide.getByText('Dein erstes Album ist bereit.')).toBeVisible();
  const picker = page.waitForEvent('filechooser');
  await guide.getByRole('button', { name: 'Fotos auswählen', exact: true }).click();
  const chooser = await picker;
  await chooser.setFiles([]);
});

test('dismissal from one account does not hide the guide for another account', async ({ page, data }) => {
  data.user.quotaUsageInBytes = 0;
  await page.goto(Route.photos());
  await page.getByRole('button', { name: 'Vorerst ausblenden' }).click();
  data.user.id = '00000000-0000-4000-8000-000000000099';
  await page.reload();
  await expect(page.getByTestId('pholy-onboarding')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Ich habe die App verbunden' })).not.toBeChecked();
});
