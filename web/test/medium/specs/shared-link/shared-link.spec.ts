import { Route } from '#lib/route.ts';
import type { MockData } from '#test/common/data.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import { SharedLinkType } from '@immich/sdk';

const setup = (data: MockData, overrides = {}) => {
  const assets = [factory.asset(), factory.asset()];
  data.addAssets(assets);
  const album = factory.album({ albumName: 'Test Album' });
  data.addAlbums(album).addToAlbum(album.id, assets);
  const link = factory.sharedLink({ type: SharedLinkType.Album, album, ...overrides });
  data.addSharedLinks(link);
  return { link, album, assets };
};

test.describe('shared link', () => {
  test('guest downloads one asset and then the whole album', async ({ page, context, data, api, app }) => {
    const { link, album, assets } = setup(data);
    await context.clearCookies();
    await page.goto(Route.viewSharedLink({ key: link.key }));
    await expect(app.sharedLink.heading('Test Album')).toBeVisible();

    await app.timeline.select(assets[0]);
    const [single] = await Promise.all([page.waitForEvent('download'), app.sharedLink.downloadButton.click()]);
    expect(single.suggestedFilename()).toBe(assets[0].originalFileName);
    expect(api.downloadAsset).toHaveBeenCalledWith({
      params: expect.objectContaining({ id: assets[0].id, key: link.key }),
    });

    await page.goto(Route.viewSharedLink({ key: link.key }));
    await expect(app.sharedLink.heading('Test Album')).toBeVisible();
    const [all] = await Promise.all([page.waitForEvent('download'), app.sharedLink.downloadButton.click()]);
    expect(all.suggestedFilename()).toMatch(/\.zip$/);
    expect(api.downloadArchive).toHaveBeenCalled();
    expect(api.getDownloadInfo).toHaveBeenCalledWith({
      params: expect.objectContaining({ key: link.key }),
      body: { albumId: album.id },
    });
  });

  test('password link asks for it and can show or hide it', async ({ page, context, data, api, logger, app }) => {
    const { link } = setup(data, { password: 'test-password' });
    await context.clearCookies();
    await page.goto(Route.viewSharedLink({ key: link.key }));

    await app.sharedLink.passwordInput.fill('test-password');
    await app.sharedLink.showPasswordButton.click();
    await expect(app.sharedLink.passwordInput).toHaveAttribute('type', 'text');
    await app.sharedLink.hidePasswordButton.click();
    await expect(app.sharedLink.passwordInput).toHaveAttribute('type', 'password');

    await app.sharedLink.submitButton.click();
    await expect(app.sharedLink.heading('Test Album')).toBeVisible();
    expect(api.sharedLinkLogin).toHaveBeenCalledWith({
      params: expect.objectContaining({ key: link.key }),
      body: { password: 'test-password' },
    });
    expect(logger.error).toHaveBeenCalledWith(/401/);
  });

  test('invalid key shows the not found page', async ({ page, context, logger, app }) => {
    await context.clearCookies();
    await page.goto(Route.viewSharedLink({ key: 'invalid' }));
    await expect(app.sharedLink.notFoundHeading).toBeVisible();
    expect(logger.error).toHaveBeenCalledWith(/404/);
  });

  test('authenticated user can navigate from the share page to the timeline', async ({ page, data, app }) => {
    const { link, assets } = setup(data);
    await page.goto(Route.viewSharedLink({ key: link.key }));
    await expect(app.sharedLink.heading('Test Album')).toBeVisible();

    await app.sharedLink.homeLink.click();
    await page.waitForURL(Route.photos());
    await expect(app.timeline.thumbnail(assets[0])).toBeVisible();
  });

  test('turning show metadata off also turns downloads off in the create form', async ({ page, data, app }) => {
    const asset = factory.asset();
    data.addAssets(asset);
    await page.goto(Route.viewAsset({ id: asset.id }));
    await app.viewer.waitForAsset(asset);

    await app.viewer.shareButton.click();
    await expect(app.sharedLink.form.allowDownloadSwitch).toBeChecked();

    await app.sharedLink.form.showMetadataSwitch.click();
    await expect(app.sharedLink.form.showMetadataSwitch).not.toBeChecked();
    await expect(app.sharedLink.form.allowDownloadSwitch).not.toBeChecked();
    await expect(app.sharedLink.form.allowDownloadSwitch).toBeDisabled();
  });

  test('the list shows a cover for album, individual, empty and broken links', async ({ page, data, logger, app }) => {
    const { link: albumLink } = setup(data);
    const broken = factory.asset();
    const individual = factory.sharedLink({ type: SharedLinkType.Individual, assets: [factory.asset()] });
    const empty = factory.sharedLink({ type: SharedLinkType.Individual, assets: [] });
    const notResized = factory.sharedLink({ type: SharedLinkType.Individual, assets: [broken] });
    data.addSharedLinks(individual).addSharedLinks(empty).addSharedLinks(notResized).markBroken(broken);
    await page.goto(Route.sharedLinks());

    for (const link of [albumLink, individual, empty]) {
      await expect(app.sharedLink.cover(link)).toBeVisible();
    }
    await expect(app.sharedLink.brokenCover(notResized)).toBeVisible();
    expect(logger.error).toHaveBeenCalledWith(/404/);
  });

  test('owner removes an asset from an individual link', async ({ page, data, api, app }) => {
    const [first, second, third] = [factory.asset(), factory.asset(), factory.asset()];
    const link = factory.sharedLink({ type: SharedLinkType.Individual, assets: [first, second, third] });
    data.addSharedLinks(link);
    await page.goto(Route.viewSharedLink({ key: link.key }));
    await expect(app.timeline.thumbnails).toHaveCount(3);

    await app.timeline.select(first);
    await app.sharedLink.removeFromSharedLinkButton.click();
    await app.sharedLink.confirmRemove();

    await expect(app.timeline.thumbnail(first)).toHaveCount(0);
    await expect(app.timeline.thumbnail(second)).toHaveCount(1);
    expect(api.removeSharedLinkAssets).toHaveBeenCalledWith({
      params: { id: link.id },
      body: { assetIds: [first.id] },
    });
  });
});

test.describe('PHOLY shared-link management', () => {
  for (const width of [320, 768, 1440]) {
    test(`search and filters stay usable at ${width}px`, async ({ page, data }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const { link } = setup(data, { description: 'Urlaub an der Ostsee', slug: 'ostsee-2026' });
      const individual = factory.sharedLink({
        type: SharedLinkType.Individual,
        assets: [],
        description: 'Einzelbilder für die Familie',
        slug: 'familie-2026',
      });
      const expired = factory.sharedLink({
        type: SharedLinkType.Individual,
        assets: [],
        description: 'Eine sehr lange Beschreibung '.repeat(12),
        expiresAt: '2020-01-01T00:00:00.000Z',
      });
      data.addSharedLinks([individual, expired]);
      await page.goto(Route.sharedLinks());
      const cards = page.locator('.pholy-share-card');
      const filters = page.getByRole('group', { name: 'show_shared_links', exact: true });
      const search = page.getByRole('searchbox', { name: 'pholy_search_shared_links', exact: true });
      await expect(cards).toHaveCount(3);
      await expect(search).toBeInViewport({ ratio: 1 });
      for (const label of ['all', 'albums', 'individual_shares']) {
        await expect(filters.getByText(label, { exact: true })).toBeInViewport({ ratio: 1 });
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1);

      await filters.getByText('albums', { exact: true }).click();
      await expect(page).toHaveURL(Route.sharedLinks({ filter: 'album' }));
      await expect(cards).toHaveCount(1);
      await expect(cards.first().locator('a')).toHaveAttribute('href', Route.viewSharedLink(link));
      await search.fill('  OSTSEE-2026  ');
      await expect(cards).toHaveCount(1);
      await search.fill('Familie');
      await expect(cards).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('pholy_no_matching_shared_links');
      await page.getByRole('button', { name: 'pholy_clear_shared_link_filters', exact: true }).click();
      await expect(cards).toHaveCount(3);
      await expect(search).toHaveValue('');

      await search.fill('Familie');
      await expect(cards).toHaveCount(1);
      await expect(cards.first().locator('a')).toHaveAttribute('href', Route.viewSharedLink(individual));
      await search.fill('');
      await filters.getByText('individual_shares', { exact: true }).click();
      await expect(cards).toHaveCount(2);
      const expiredCard = cards.filter({ hasText: expired.description! });
      await expect(expiredCard.getByText('expired', { exact: true })).toBeVisible();
      await expect(expiredCard.locator('a')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`shared-links-${width}.png`), animations: 'disabled' });

      const card = cards.filter({ hasText: individual.description! });
      if (width < 640) {
        await card.getByRole('button', { name: 'shared_link_options', exact: true }).click();
        await page.getByRole('menuitem', { name: 'edit_link', exact: true }).click();
      } else {
        await card.getByRole('button', { name: 'edit_link', exact: true }).click();
      }
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('textbox', { name: 'description', exact: true })).toHaveValue(
        individual.description!,
      );
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }

  test('an empty list explains how to create a link', async ({ page }) => {
    await page.goto(Route.sharedLinks());
    await expect(page.getByText('pholy_shared_links_empty_hint', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'photos', exact: true })).toHaveAttribute(
      'href',
      Route.photos(),
    );
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  });
});
