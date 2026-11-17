import { Route } from '#lib/route.ts';
import type { MockData } from '#test/common/data.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import type { Page, TestInfo } from '@playwright/test';

test.use({ language: 'de' });
test.setTimeout(60_000);

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow', width: 320, height: 800 },
] as const;

const seedWorkspace = (data: MockData) => {
  Object.assign(data.user, {
    name: 'PHOLY Testprofil',
    email: 'pholy-oberflaeche@example.invalid',
  });
  data.setPreferences(factory.preferences({ sharedLinks: { enabled: true, sidebarWeb: true } }));
  const assets = Array.from({ length: 8 }, (_, index) =>
    factory.asset({
      originalFileName: `PHOLY-Testbild-${index + 1}.jpg`,
      fileCreatedAt: `2025-10-24T12:${String(30 - index).padStart(2, '0')}:00.000Z`,
      width: index % 3 === 0 ? 1200 : 1800,
      height: 1200,
      exifInfo: { model: 'PHOLY Testkamera' },
    }),
  );
  const album = factory.album({
    albumName: 'PHOLY Testalbum',
    description: 'Synthetische Bilder für die Prüfung der Oberfläche.',
  });
  data.addAssets(assets).addAlbums(album).addToAlbum(album.id, assets);
  return { assets, album };
};

const openSidebar = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Primär', exact: true });
  const menu = page.getByRole('button', { name: 'Hauptmenü', exact: true });
  if ((page.viewportSize()?.width ?? 1440) < 850) {
    await expect(menu).toBeVisible();
    if ((await page.locator('#sidebar').getAttribute('data-visible')) !== 'true') {
      await menu.click();
    }
  }
  await expect(sidebar).toHaveAttribute('data-visible', 'true');
  return sidebar;
};

const followSidebar = async (page: Page, name: string, href: string) => {
  const sidebar = await openSidebar(page);
  const link = sidebar.getByRole('link', { name, exact: true });
  await expect(link).toHaveAttribute('href', href);
  await link.click();
  await page.waitForURL(href);
  if (await page.getByRole('button', { name: 'Hauptmenü', exact: true }).isVisible()) {
    await expect(page.locator('#sidebar')).toHaveAttribute('data-visible', 'false');
  }
};

const capture = async (page: Page, testInfo: TestInfo, name: string) => {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const expectNoHorizontalOverflow = async (page: Page) => {
  try {
    await expect
      .poll(
        () =>
          page.evaluate(
            () => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth,
          ),
        { message: 'The page must fit the viewport without horizontal body scrolling' },
      )
      .toBeLessThanOrEqual(1);
  } catch (error) {
    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id,
            classes: element.getAttribute('class'),
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter(({ left, right, width, height }) => width > 0 && height > 0 && (left < -1 || right > innerWidth + 1))
        .slice(0, 20),
    }));
    await test.info().attach('overflow-geometry', {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json',
    });
    throw error;
  }
};

for (const viewport of viewports) {
  test.describe(`PHOLY workspace ${viewport.name}`, () => {
    test('photos, albums, profile and viewer remain usable', async ({ page, data, app, mock }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { assets, album } = seedWorkspace(data);
      await page.goto(Route.photos());
      await expect(app.timeline.thumbnail(assets[0])).toBeVisible();
      await capture(page, testInfo, `${viewport.name}-photos`);
      await expectNoHorizontalOverflow(page);

      const sidebar = await openSidebar(page);
      for (const [name, href] of [
        ['Meine Fotos', Route.photos()],
        ['Alben', Route.albums()],
        ['Geteilte Links', Route.sharedLinks()],
        ['Profil & Einstellungen', Route.userSettings()],
      ] as const) {
        await expect(sidebar.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
      }
      await capture(page, testInfo, `${viewport.name}-sidebar`);
      await expectNoHorizontalOverflow(page);
      if (viewport.width < 640) {
        await page.keyboard.press('Escape');
        await expect(page.locator('#sidebar')).toHaveAttribute('data-visible', 'false');
      }

      await followSidebar(page, 'Alben', Route.albums());
      const albumLink = page.getByRole('main').locator(`a[href="${Route.viewAlbum(album)}"]`);
      await expect(albumLink).toContainText(album.albumName);
      await capture(page, testInfo, `${viewport.name}-albums`);
      await expectNoHorizontalOverflow(page);
      // Body width alone misses controls clipped inside the album toolbar.
      const main = page.getByRole('main');
      for (const control of [
        main.getByRole('button', { name: 'Liste', exact: true }),
        main.getByRole('button', { name: 'Album erstellen', exact: true }),
        main.getByRole('group', { name: 'Alben anzeigen', exact: true }),
        main.getByRole('textbox', { name: 'Album suchen', exact: true }),
      ]) {
        await expect(control).toBeInViewport({ ratio: 1 });
      }
      await albumLink.click();
      await page.waitForURL(Route.viewAlbum(album));
      await expect(app.timeline.thumbnail(assets[0])).toBeVisible();

      // Return to the album overview before following account navigation.
      await page.goto(Route.albums());
      await expect(albumLink).toContainText(album.albumName);
      await followSidebar(page, 'Profil & Einstellungen', Route.userSettings());
      await expect(page.getByRole('heading', { name: data.user.name, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Profil & Freigaben', exact: true })).toBeVisible();
      await capture(page, testInfo, `${viewport.name}-profile`);
      await expectNoHorizontalOverflow(page);

      await page.getByRole('button', { name: 'Avatar-Farbe auswählen', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByText('Avatar-Farbe auswählen', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(mock.api.updateMyUser).not.toHaveBeenCalled();
      expect(mock.api.deleteProfileImage).not.toHaveBeenCalled();

      await page.getByRole('button', { name: /^Mein Konto/ }).click();
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(data.user.name);
      await expect(page.getByRole('textbox', { name: 'E-Mail', exact: true })).toHaveValue(data.user.email);
      await capture(page, testInfo, `${viewport.name}-profile-details`);
      await expectNoHorizontalOverflow(page);

      await followSidebar(page, 'Geteilte Links', Route.sharedLinks());
      await expect(page.getByRole('heading', { name: 'Geteilte Links', exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await followSidebar(page, 'Meine Fotos', Route.photos());
      await expect(app.timeline.thumbnail(assets[0])).toBeVisible();

      await app.timeline.select(assets[0]);
      await expect(app.timeline.selected).toHaveCount(1);
      await expect(page.getByTestId('control-bar')).toBeVisible();
      await capture(page, testInfo, `${viewport.name}-selection`);
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press('Escape');
      await expect(app.timeline.selected).toHaveCount(0);

      await app.timeline.thumbnail(assets[0]).click();
      await app.viewer.waitForAsset(assets[0]);
      await capture(page, testInfo, `${viewport.name}-viewer`);
      await expectNoHorizontalOverflow(page);
      await app.viewer.root.getByLabel('Info', { exact: true }).click();
      await expect(app.viewer.detailPanel).toBeVisible();
      await expect(app.viewer.detailPanel.getByText('PHOLY Testkamera', { exact: false })).toBeVisible();
      await capture(page, testInfo, `${viewport.name}-viewer-info`);
      await expect(app.viewer.detailPanel).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press('i');
      await expect(app.viewer.detailPanel).toBeHidden();
      await app.viewer.root.getByLabel('Zurück', { exact: true }).click();
      await expect(app.viewer.root).toBeHidden();
      await expect(app.timeline.thumbnail(assets[0])).toBeVisible();
    });
  });
}

test('wide and tablet workspaces remain readable in light and dark themes', async ({ page, data, app }, testInfo) => {
  const { assets } = seedWorkspace(data);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(Route.photos());
  await expect(app.timeline.thumbnail(assets[0])).toBeVisible();
  await expect(page.getByRole('main')).toHaveCSS('font-family', /PHOLY Inter/);
  await page.evaluate(() => document.fonts.ready);

  try {
    for (const dark of [false, true]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark);
      for (const viewport of [
        { name: 'wide', width: 2560, height: 1440 },
        { name: 'tablet', width: 768, height: 1024 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(app.timeline.thumbnail(assets[0])).toBeVisible();
        await expectNoHorizontalOverflow(page);
        const main = page.getByRole('main');
        await expect(main).toBeInViewport({ ratio: 1 });
        if (viewport.name === 'wide') {
          // A gallery should not stretch its controls across an entire ultra-wide monitor.
          const getContentWidth = async () => {
            const box = await main.boundingBox();
            return box?.width ?? 0;
          };
          await expect.poll(getContentWidth).toBeLessThan(1800);
          await expect.poll(getContentWidth).toBeGreaterThan(1200);
        }
        await capture(page, testInfo, `${viewport.name}-${dark ? 'dark' : 'light'}`);

        const sidebar = await openSidebar(page);
        await expect(sidebar.getByRole('link', { name: 'Meine Fotos', exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
        await expect(sidebar.getByRole('heading', { name: 'Mediathek', exact: true })).toBeVisible();
        if (viewport.name !== 'tablet') {
          continue;
        }
        await page.keyboard.press('Escape');
        await expect(sidebar).toHaveAttribute('data-visible', 'false');
        await expect(page.getByRole('button', { name: 'Hauptmenü', exact: true })).toBeFocused();
      }
    }
  } finally {
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  }
});

test.describe('PHOLY public metadata', () => {
  for (const { name, showMetadata, allowDownload } of [
    { name: 'hidden', showMetadata: false, allowDownload: false },
    { name: 'visible-without-download', showMetadata: true, allowDownload: false },
    { name: 'visible-with-download', showMetadata: true, allowDownload: true },
  ]) {
    test(`shared metadata ${name}`, async ({ page, context, data, app }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const asset = factory.asset({
        originalFileName: 'privates-metadaten-testbild.jpg',
        exifInfo: { model: 'PHOLY Private Testkamera' },
      });
      const link = factory.sharedLink({ assets: [asset], showMetadata, allowDownload });
      data.addSharedLinks(link);
      await context.clearCookies();
      await page.goto(Route.viewSharedLink(link));
      // A single-asset public link opens the viewer immediately.
      await app.viewer.waitForAsset(asset);
      // The shared worker retains the user's local panel preference across tests.
      if (await app.viewer.detailPanel.isVisible()) {
        await page.keyboard.press('i');
        await expect(app.viewer.detailPanel).toBeHidden();
      }
      const identity = app.viewer.root.locator('.pholy-viewer-name');
      const info = app.viewer.root.getByLabel('Info', { exact: true });
      await expect(app.viewer.root.getByLabel('Herunterladen', { exact: true })).toHaveCount(allowDownload ? 1 : 0);

      if (showMetadata) {
        await expect(identity).toHaveText(asset.originalFileName);
        await expect(identity).toBeVisible();
        await expect(info).toBeVisible();
        await info.click();
        await expect(app.viewer.detailPanel.getByText('PHOLY Private Testkamera', { exact: false })).toBeVisible();
      } else {
        await expect(identity).toHaveText('Geteiltes Bild');
        await expect(app.viewer.root.getByText(asset.originalFileName, { exact: true })).toHaveCount(0);
        await expect(info).toHaveCount(0);
        await page.keyboard.press('i');
        await expect(app.viewer.detailPanel).toBeHidden();
        await expect(app.viewer.root.getByText('PHOLY Private Testkamera', { exact: false })).toHaveCount(0);
      }
      await capture(page, testInfo, `desktop-shared-metadata-${name}`);
      if (showMetadata) {
        await expect(app.viewer.detailPanel).toBeInViewport({ ratio: 1 });
      }
      await expectNoHorizontalOverflow(page);
      for (const viewport of viewports) {
        if (viewport.width >= 640) {
          continue;
        }
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        if (showMetadata) {
          await expect(app.viewer.detailPanel.getByText('PHOLY Private Testkamera', { exact: false })).toBeVisible();
        } else {
          await expect(app.viewer.detailPanel).toBeHidden();
        }
        await capture(page, testInfo, `${viewport.name}-shared-metadata-${name}`);
        if (showMetadata) {
          await expect(app.viewer.detailPanel).toBeInViewport({ ratio: 1 });
        }
        await expectNoHorizontalOverflow(page);
      }
      if (showMetadata) {
        await page.keyboard.press('i');
        await expect(app.viewer.detailPanel).toBeHidden();
      }
    });
  }
});
