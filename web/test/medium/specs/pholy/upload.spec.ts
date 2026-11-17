import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import { AssetUploadAction } from '@immich/sdk';
import type { Page } from '@playwright/test';

// A synthetic one-pixel PNG; no personal media is needed for upload tests.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=',
  'base64',
);
const fixture = (name: string) => ({ name, mimeType: 'image/png', buffer: png });
const assetsPattern = '**/api/assets';
const uploadsPattern = '**/api/pholy/uploads/**';
const storageKey = 'pholy-upload-sessions-v1';

test.use({ language: 'de' });
test.setTimeout(60_000);

test.afterEach(async ({ page }) => {
  await page.unroute(assetsPattern);
  await page.unroute(uploadsPattern);
  if (page.url().startsWith('http')) {
    await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  }
});

const selectFiles = async (page: Page, names: string[]) => {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#dashboard-navbar').getByRole('button', { name: 'Hochladen', exact: true }).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(names.map((name) => fixture(name)));
};

const expectPanelFits = async (page: Page) => {
  const geometry = await page.getByTestId('upload-panel').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
};

for (const width of [1440, 390, 320]) {
  test(`uploads pause, survive navigation and distinguish processing from ready at ${width}px`, async ({
    page,
    data,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    data.user.isAdmin = false;
    const names = ['pholy-test-1.png', 'pholy-test-2.png', 'pholy-cancelled.png'];
    const assets = names.map((originalFileName) => factory.asset({ originalFileName }));
    data.addAssets(assets);
    const requests: string[] = [];
    let allowReady = false;
    let releaseUploads: () => void = () => {};
    const pendingUploads = new Promise<void>((resolve) => (releaseUploads = resolve));

    await page.route(assetsPattern, async (route) => {
      const name = /filename="([^"]+)"/.exec(route.request().postData() ?? '')?.[1] ?? '';
      requests.push(name);
      await pendingUploads;
      const asset = assets.find((asset) => asset.originalFileName === name);
      // Pausing aborts the first request. Its replacement is fulfilled after resume.
      try {
        await route.fulfill({ status: 201, json: { id: asset?.id, status: 'created' } });
      } catch {
        return;
      }
    });
    await page.route(uploadsPattern, (route) =>
      route.fulfill({
        json: {
          id: route.request().url().split('/').at(-2),
          status: allowReady ? 'ready' : 'processing',
          previewReady: allowReady,
          thumbnailReady: allowReady,
        },
      }),
    );

    try {
      await page.goto(Route.photos());
      await selectFiles(page, names);
      const panel = page.getByTestId('upload-panel');
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('upload-file')).toHaveCount(3);
      await expect.poll(() => requests.length).toBe(2);
      await expect(panel.getByRole('progressbar', { name: 'Gesamter Upload-Fortschritt' })).toBeVisible();
      await panel.getByRole('button', { name: 'Uploads pausieren', exact: true }).click();
      await expect(panel.locator('[data-state="paused"]')).toHaveCount(3);
      await panel.getByRole('button', { name: `Upload von ${names[2]} abbrechen`, exact: true }).click();
      await expect(panel.locator('[data-state="cancelled"]')).toHaveCount(1);
      await expectPanelFits(page);
      await page.screenshot({ path: testInfo.outputPath(`uploads-paused-${width}.png`) });

      await panel.getByRole('button', { name: 'Uploads minimieren', exact: true }).click();
      const menu = page.getByRole('button', { name: 'Hauptmenü', exact: true });
      if (await menu.isVisible()) {
        await menu.click();
      }
      await page
        .getByRole('navigation', { name: 'Primär', exact: true })
        .getByRole('link', { name: 'Alben', exact: true })
        .click();
      await page.waitForURL(Route.albums());
      await expect(panel.getByRole('button', { name: 'Upload-Details anzeigen', exact: true })).toBeVisible();
      await expect(panel.getByText('Uploads sind pausiert')).toBeVisible();
      await panel.getByRole('button', { name: 'Upload-Details anzeigen', exact: true }).click();
      releaseUploads();
      await panel.getByRole('button', { name: 'Uploads fortsetzen', exact: true }).click();
      await expect(panel.locator('[data-state="processing"]')).toHaveCount(2);
      await expect(panel.locator('[data-state="ready"]')).toHaveCount(0);
      allowReady = true;
      await expect(panel.locator('[data-state="ready"]')).toHaveCount(2);
      expect(requests).not.toContain(names[2]);
      await expectPanelFits(page);
      await page.screenshot({ path: testInfo.outputPath(`uploads-ready-${width}.png`) });
      await panel.getByRole('button', { name: 'Erledigte ausblenden', exact: true }).click();
      await expect(panel).toHaveCount(0);
    } finally {
      releaseUploads();
    }
  });
}

test('duplicates keep an accessible original link without transferring the file again', async ({ page, data, api }) => {
  data.user.isAdmin = false;
  const asset = factory.asset({ originalFileName: 'pholy-duplicate.png' });
  data.addAssets(asset);
  api.on({
    checkBulkUpload: ({ body }) => ({
      json: {
        results: body.assets.map(({ id }) => ({
          id,
          action: AssetUploadAction.Reject,
          assetId: asset.id,
          isTrashed: false,
        })),
      },
    }),
  });
  let transfers = 0;
  await page.route(assetsPattern, async (route) => {
    transfers++;
    await route.fulfill({ status: 201, json: { id: asset.id, status: 'created' } });
  });
  await page.goto(Route.photos());
  await selectFiles(page, [asset.originalFileName]);
  const panel = page.getByTestId('upload-panel');
  await expect(panel.locator('[data-state="duplicate"]')).toHaveCount(1);
  await expect(panel.getByRole('link', { name: `${asset.originalFileName} öffnen`, exact: true })).toHaveAttribute(
    'href',
    Route.viewAsset(asset),
  );
  expect(transfers).toBe(0);
  await panel
    .getByRole('button', { name: `${asset.originalFileName} aus dieser Liste ausblenden`, exact: true })
    .click();
  await expect(panel).toHaveCount(0);
});

test('quota failures remain actionable and retry without duplicating the queue entry', async ({
  page,
  data,
  logger,
}) => {
  data.user.isAdmin = false;
  data.user.quotaSizeInBytes = 0;
  data.user.quotaUsageInBytes = 0;
  const asset = factory.asset({ originalFileName: 'pholy-quota.png' });
  data.addAssets(asset);
  let transfers = 0;
  await page.route(assetsPattern, async (route) => {
    transfers++;
    await route.fulfill({ status: 201, json: { id: asset.id, status: 'created' } });
  });
  await page.route(uploadsPattern, (route) =>
    route.fulfill({ json: { id: asset.id, status: 'ready', previewReady: true, thumbnailReady: true } }),
  );
  await page.goto(Route.photos());
  await selectFiles(page, [asset.originalFileName]);
  const panel = page.getByTestId('upload-panel');
  await expect(panel.locator('[data-state="error"]')).toHaveCount(1);
  await expect(
    panel.getByRole('button', { name: `${asset.originalFileName} erneut versuchen`, exact: true }),
  ).toBeVisible();
  expect(transfers).toBe(0);
  expect(logger.error).toHaveBeenCalledWith(/\[handleError\].*Speicher/);
  data.user.quotaSizeInBytes = 1024 * 1024;
  await panel.getByRole('button', { name: 'Fehlgeschlagene erneut versuchen', exact: true }).click();
  await expect(panel.locator('[data-state="ready"]')).toHaveCount(1);
  await expect(panel.getByTestId('upload-file')).toHaveCount(1);
  expect(transfers).toBe(1);
  await expect(panel.getByRole('button', { name: 'Fehlgeschlagene erneut versuchen', exact: true })).toHaveCount(0);
});

test('reloaded uploads require reselecting the original file and can be discarded', async ({
  page,
  data,
}, testInfo) => {
  data.user.isAdmin = false;
  const record = {
    id: '00000000-0000-4000-8000-000000000042',
    ownerId: data.user.id,
    fileName: 'pholy-resume.mov',
    fileSize: 64 * 1024 * 1024,
    lastModified: 1,
    checksum: 'a'.repeat(40),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    offset: 8 * 1024 * 1024,
  };
  const requests: string[] = [];
  await page.route(uploadsPattern, async (route) => {
    requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 204 });
  });
  await page.goto(Route.photos());
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify([record])), {
    key: storageKey,
    record,
  });
  await page.reload();
  const panel = page.getByTestId('upload-panel');
  await expect(
    panel.getByRole('heading', { name: 'Dort weitermachen, wo du aufgehört hast', exact: true }),
  ).toBeVisible();
  await expect(panel.getByText('pholy-resume.mov', { exact: true })).toBeVisible();
  await expect(panel.getByText('8 MiB / 64 MiB', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  const chooser = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: `${record.fileName} zum Fortsetzen erneut auswählen`, exact: true }).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(fixture('different-original.png'));
  await expect(
    page.getByText(
      'Die Datei stimmt nicht mit dem unterbrochenen Upload überein. Wähle dieselbe Originaldatei erneut aus.',
    ),
  ).toBeVisible();
  await expect(panel.getByTestId('upload-file')).toHaveCount(0);
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('uploads-reselect.png') });
  await panel
    .getByRole('button', { name: `Unterbrochenen Upload von ${record.fileName} verwerfen`, exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  expect(requests).toEqual([`DELETE /api/pholy/uploads/sessions/${record.id}`]);
});
