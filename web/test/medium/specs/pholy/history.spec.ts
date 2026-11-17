import type { PholyHistory, PholyHistoryItem, PholyQuota } from '#lib/queries/pholy-history.query.ts';
import { Route } from '#lib/route.ts';
import { expect, test } from '#test/medium/fixtures.ts';

const pattern = '**/api/pholy/history**';
const item = (input: Partial<PholyHistoryItem>): PholyHistoryItem => ({
  id: '00000000-0000-4000-8000-000000000041',
  fileName: 'synthetic.png',
  fileSize: 1024,
  status: 'ready',
  processingStep: null,
  createdAt: '2026-11-17T12:00:00Z',
  updatedAt: '2026-11-17T12:01:00Z',
  assetId: '00000000-0000-4000-8000-000000000042',
  previewReady: true,
  thumbnailReady: true,
  ...input,
});
const quota: PholyQuota = {
  usage: 95 * 1024 ** 3,
  limit: 100 * 1024 ** 3,
  remaining: 5 * 1024 ** 3,
  level: 'critical',
};

test.use({ language: 'de' });
test.afterEach(async ({ page }) => {
  await page.unroute(pattern);
});

for (const width of [1440, 390, 320]) {
  test(`persistent history distinguishes saved originals from failed processing at ${width}px`, async ({
    page,
    data,
  }) => {
    data.user.isAdmin = false;
    data.user.quotaUsageInBytes = quota.usage;
    data.user.quotaSizeInBytes = quota.limit;
    await page.setViewportSize({ width, height: 900 });
    const history: PholyHistory = {
      items: [
        item({}),
        item({ id: 'processing', fileName: 'still-processing.jpg', status: 'processing', previewReady: false }),
        item({ id: 'error', fileName: 'video-error.mp4', status: 'processing-error', processingStep: 'video' }),
        item({ id: 'failed', fileName: 'network-error.jpg', status: 'failed', assetId: null }),
      ],
      hasMore: false,
      page: 0,
      retentionDays: 90,
    };
    await page.route(pattern, (route) =>
      route.fulfill({ json: route.request().url().endsWith('/quota') ? quota : history }),
    );
    await page.goto(Route.uploadHistory());
    await expect(page.getByRole('heading', { name: 'Uploadverlauf', exact: true })).toBeVisible();
    await expect(page.locator('.history-list li')).toHaveCount(4);
    await expect(page.getByText('Vorschau bereit', { exact: true })).toBeVisible();
    await expect(page.getByText('Wird verarbeitet', { exact: true })).toBeVisible();
    await expect(page.getByText('Verarbeitung prüfen', { exact: true })).toBeVisible();
    await expect(page.getByText('Upload fehlgeschlagen', { exact: true })).toBeVisible();
    const processingError = page.locator('.history-list li').filter({ hasText: 'video-error.mp4' });
    await expect(processingError).toContainText('Du musst die Datei nicht erneut hochladen');
    await expect(processingError.getByRole('link', { name: 'Hilfe & Support', exact: true })).toHaveAttribute(
      'href',
      Route.help(),
    );
    await expect(
      page
        .locator('.history-list li')
        .filter({ hasText: 'network-error.jpg' })
        .getByRole('link', { name: 'Datei ansehen' }),
    ).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Speicherhinweis' })).toContainText(
      'Dein Speicher wird knapp',
    );
    await expect(page.getByRole('button', { name: 'Zurück', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await page.reload();
    await expect(page.locator('.history-list li')).toHaveCount(4);
  });
}

test('pagination loads the next saved history page and returns to the first', async ({ page, data }) => {
  data.user.isAdmin = false;
  const requested: number[] = [];
  await page.route(pattern, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/quota')) return route.fulfill({ json: quota });
    const index = Number(url.searchParams.get('page') ?? 0);
    requested.push(index);
    await route.fulfill({
      json: {
        items: [item({ fileName: index ? 'older-photo.jpg' : 'latest-photo.jpg' })],
        hasMore: index === 0,
        page: index,
        retentionDays: 90,
      },
    });
  });
  await page.goto(Route.uploadHistory());
  await expect(page.getByText('latest-photo.jpg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('older-photo.jpg', { exact: true })).toBeVisible();
  await expect(page.getByText('Seite 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.getByText('latest-photo.jpg', { exact: true })).toBeVisible();
  expect(requested).toContain(1);
});

test('unlimited accounts do not receive a quota warning and the empty state explains history scope', async ({
  page,
  data,
}) => {
  data.user.isAdmin = false;
  data.user.quotaSizeInBytes = null;
  await page.route(pattern, (route) =>
    route.fulfill({
      json: route.request().url().endsWith('/quota')
        ? { usage: 20, limit: null, remaining: null, level: 'normal' }
        : { items: [], hasMore: false, page: 0, retentionDays: 90 },
    }),
  );
  await page.goto(Route.uploadHistory());
  await expect(page.getByRole('region', { name: 'Dein Speicher', exact: true })).toContainText('ohne festes Kontingent');
  await expect(page.getByRole('complementary', { name: 'Speicherhinweis' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Noch keine Einträge', exact: true })).toBeVisible();
  await expect(page.getByText(/Geschützte Galerie bleibt ausgeblendet/)).toBeVisible();
});
