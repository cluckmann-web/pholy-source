import type { PhotoComment, PhotoCommentsPage } from '#lib/queries/pholy-comments.query.ts';
import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import type { Page } from '@playwright/test';

const pattern = '**/api/pholy/comments/**';
const communityPattern = '**/api/pholy/community**';
const slug = 'synthetic-comment-gallery';
const assetId = '00000000-0000-4000-8000-000000000301';
const secondAssetId = '00000000-0000-4000-8000-000000000302';
const commentId = '00000000-0000-4000-8000-000000000401';
const replyId = '00000000-0000-4000-8000-000000000402';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750" viewBox="0 0 1000 750"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#9ac8e8"/><stop offset="1" stop-color="#e4e9e3"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1000v750H0z"/><circle cx="740" cy="160" r="62" fill="#f9e3b1"/><path fill="#73868b" d="M0 590L320 170l250 320 180-190 250 330v120H0z"/><path fill="#dce1dd" d="M250 260l70-90 87 112-76-36-31 47z"/><path fill="#405f65" d="M0 650l260-200 260 220 290-160 190 140v100H0z"/><path fill="#658686" d="M0 690q250-75 480 0t520 0v60H0z"/></svg>';
const author = {
  id: '00000000-0000-4000-8000-000000000501',
  name: 'Lena Berg',
  avatarColor: 'blue',
  hasProfileImage: false,
};
const comment = (options: Partial<PhotoComment> = {}): PhotoComment => ({
  id: commentId,
  assetId,
  parentId: null,
  body: 'Das Licht zwischen den Bergen ist wunderschön.',
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
  deleted: false,
  author,
  likeCount: 2,
  liked: false,
  canEdit: false,
  canDelete: false,
  replies: [],
  ...options,
});
const result = (comments: PhotoComment[], options: Partial<PhotoCommentsPage> = {}): PhotoCommentsPage => ({
  comments,
  nextOffset: null,
  total: comments.reduce((sum, item) => sum + 1 + item.replies.length, 0),
  canComment: true,
  ...options,
});
async function gallery(page: Page, assets = [assetId]) {
  await page.route(communityPattern, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/assets/')) await route.fulfill({ contentType: 'image/svg+xml', body: svg });
    else if (path.endsWith('/relation')) await route.fulfill({ json: { following: false, ownProfile: false } });
    else
      await route.fulfill({
        json: {
          slug,
          displayName: 'Lena Berg',
          bio: 'Licht und Landschaften.',
          followers: 2,
          assets: assets.map((id) => ({ id })),
        },
      });
  });
}
async function open(page: Page) {
  await page.goto(Route.communityProfile(slug));
  await page.getByRole('button', { name: 'Foto und Kommentare', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
test.use({ language: 'de' });
test.afterEach(async ({ page }) => {
  await page.unroute(pattern);
  await page.unroute(communityPattern);
});

test('members comment, reply, like, edit and delete with a preserved reply thread', async ({ page, data }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gallery(page);
  const roots = [comment({ canDelete: true })];
  const mutations: { method: string; path: string; body: unknown }[] = [];
  await page.route(pattern, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET') {
      expect(url.searchParams.get('kind')).toBe('community');
      expect(url.searchParams.get('profileSlug')).toBe(slug);
      await route.fulfill({ json: result(roots) });
      return;
    }
    const body = req.method() === 'DELETE' ? undefined : req.postDataJSON();
    mutations.push({ method: req.method(), path: url.pathname, body });
    if (req.method() === 'POST') {
      const value = comment({
        id: body.parentId ? replyId : '00000000-0000-4000-8000-000000000403',
        body: body.body,
        author: { ...author, id: data.user.id, name: 'Luke' },
        parentId: body.parentId ?? null,
        canEdit: true,
        canDelete: true,
        likeCount: 0,
      });
      if (body.parentId) roots.find((item) => item.id === body.parentId)!.replies.push(value);
      else roots.push(value);
      await route.fulfill({ json: value });
    } else if (url.pathname.endsWith('/like')) {
      roots[0].liked = true;
      roots[0].likeCount++;
      await route.fulfill({ json: { liked: true, likeCount: roots[0].likeCount } });
    } else if (req.method() === 'PATCH') {
      roots[1].body = body.body;
      roots[1].updatedAt = '2026-11-18T10:10:00.000Z';
      await route.fulfill({ json: roots[1] });
    } else {
      expect(url.searchParams.get('kind')).toBe('community');
      roots[0] = {
        ...roots[0],
        body: '',
        author: null,
        deleted: true,
        canDelete: false,
        canEdit: false,
        liked: false,
        likeCount: 0,
      };
      await route.fulfill({ status: 204 });
    }
  });
  await open(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Schreibe einen Kommentar …' }).fill('Danke fürs Teilen!');
  await dialog.getByRole('button', { name: 'Kommentar senden', exact: true }).click();
  await expect(dialog.getByText('Danke fürs Teilen!', { exact: true })).toBeVisible();
  const original = dialog.getByRole('article', { name: 'Kommentar von Lena Berg' });
  await original.getByRole('button', { name: 'Antworten', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Antwort an Lena Berg' }).fill('Die Farben gefallen mir auch.');
  await dialog.getByRole('button', { name: 'Antwort senden' }).click();
  await expect(dialog.getByText('Die Farben gefallen mir auch.', { exact: true })).toBeVisible();
  await original.getByRole('button', { name: 'Gefällt mir', exact: true }).click();
  await expect(original.getByRole('button', { name: 'Gefällt mir', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(original.getByLabel('3 Gefällt mir')).toBeVisible();
  await page.screenshot({ path: 'test-results/pholy-comments-desktop.png' });
  const own = dialog.locator('[data-comment-id="00000000-0000-4000-8000-000000000403"]');
  await own.getByRole('button', { name: 'Bearbeiten' }).click();
  await own.getByRole('textbox', { name: 'Kommentar bearbeiten' }).fill('Danke für diesen schönen Moment!');
  await own.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(own.getByText('Bearbeitet', { exact: true })).toBeVisible();
  await original.getByRole('button', { name: 'Löschen', exact: true }).click();
  expect(mutations.filter((item) => item.method === 'DELETE')).toHaveLength(0);
  await original.getByRole('button', { name: 'Kommentar löschen' }).click();
  await expect(dialog.getByText('Dieser Kommentar wurde gelöscht.')).toBeVisible();
  await expect(dialog.getByText('Die Farben gefallen mir auch.', { exact: true })).toBeVisible();
  const retainedReply = dialog
    .getByRole('article', { name: 'Kommentar von Luke' })
    .filter({ hasText: 'Die Farben gefallen mir auch.' });
  await expect(retainedReply.getByRole('button', { name: 'Antworten' })).toHaveCount(0);
  expect(mutations.map((item) => item.method)).toEqual(['POST', 'POST', 'PUT', 'PATCH', 'DELETE']);
  expect(mutations[0].body).toEqual({ kind: 'community', profileSlug: slug, body: 'Danke fürs Teilen!' });
  expect(mutations[1].body).toEqual({
    kind: 'community',
    profileSlug: slug,
    body: 'Die Farben gefallen mir auch.',
    parentId: commentId,
  });
});

test('mobile discussion fits and keeps the failed draft with keyboard newlines', async ({ page, logger }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gallery(page);
  let attempts = 0;
  await page.route(pattern, async (route) => {
    if (route.request().method() === 'POST') {
      attempts++;
      await route.fulfill({ status: 503, json: { message: 'Bitte versuche es erneut.' } });
    } else
      await route.fulfill({
        json: result([
          comment({
            replies: [
              comment({
                id: replyId,
                parentId: commentId,
                author: { ...author, name: 'Tom Weber' },
                body: 'Ein toller Blick über das Tal.',
                likeCount: 1,
              }),
            ],
          }),
        ]),
      });
  });
  await open(page);
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('textbox', { name: 'Schreibe einen Kommentar …' });
  await input.fill('Mein Kommentar');
  await input.press('Shift+Enter');
  await input.press('End');
  await input.press('x');
  expect(await input.inputValue()).toContain('\n');
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText('Bitte versuche es erneut.');
  await expect(input).toHaveValue('Mein Kommentar\nx');
  expect(attempts).toBe(1);
  expect(logger.error).toHaveBeenCalledWith(/503/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/pholy-comments-mobile.png' });
});

test('anonymous gallery visitors get a sign-in hint without requesting private comments', async ({ page, context }) => {
  await context.clearCookies();
  await gallery(page);
  let requests = 0;
  await page.route(pattern, (route) => {
    requests++;
    return route.fulfill({ status: 401, json: {} });
  });
  await open(page);
  await expect(page.getByText('Melde dich an, um Kommentare zu lesen und mitzuschreiben.')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Anmelden', exact: true })).toHaveAttribute(
    'href',
    Route.login({ continue: new URL(Route.communityProfile(slug), page.url()).href }),
  );
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(requests).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Foto und Kommentare', exact: true })).toBeFocused();
});

test('changing photos does not retain another photo comment or draft', async ({ page }) => {
  await gallery(page, [assetId, secondAssetId]);
  const ids: string[] = [];
  await page.route(pattern, async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    ids.push(id);
    await route.fulfill({ json: result(id === assetId ? [comment()] : []) });
  });
  await open(page);
  await page.getByRole('textbox', { name: 'Schreibe einen Kommentar …' }).fill('Nicht für das zweite Foto');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Foto und Kommentare', exact: true }).nth(1).click();
  await expect(page.getByRole('textbox', { name: 'Schreibe einen Kommentar …' })).toHaveValue('');
  await expect(page.getByText('Das Licht zwischen den Bergen ist wunderschön.')).toHaveCount(0);
  expect(ids).toContain(secondAssetId);
});

test('private photo viewer uses the private thread and typing arrows does not navigate', async ({
  page,
  data,
  app,
}) => {
  const asset = factory.asset({ id: assetId, ownerId: data.user.id });
  data.addAssets(asset);
  const contexts: string[] = [];
  await page.route(pattern, async (route) => {
    contexts.push(new URL(route.request().url()).searchParams.get('kind')!);
    await route.fulfill({ json: result([]) });
  });
  await page.goto(Route.viewAsset({ id: assetId }));
  await app.viewer.waitForAsset(asset);
  await page.getByRole('button', { name: 'Kommentare', exact: true }).click();
  await expect(
    page.getByText('Nur du siehst diese Unterhaltung. Sie bleibt beim Teilen des Fotos privat.'),
  ).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Schreibe einen Kommentar …' });
  await input.fill('Entwurf');
  await input.press('ArrowLeft');
  await input.press('ArrowRight');
  await expect(input).toHaveValue('Entwurf');
  await expect(page).toHaveURL(Route.viewAsset({ id: assetId }));
  expect(contexts).toEqual(['private']);
});

test('pagination retains existing roots and disabled discussions have no composer', async ({ page }) => {
  await gallery(page);
  const offsets: string[] = [];
  await page.route(pattern, async (route) => {
    const offset = new URL(route.request().url()).searchParams.get('offset')!;
    offsets.push(offset);
    await route.fulfill({
      json:
        offset === '0'
          ? result([comment()], { nextOffset: 20, total: 21, canComment: false })
          : result([comment({ id: replyId, body: 'Ein weiterer Kommentar.' })], { total: 21, canComment: false }),
    });
  });
  await open(page);
  await expect(page.getByText('Kommentare sind für dieses Foto deaktiviert.')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Weitere Kommentare anzeigen' }).click();
  await expect(page.getByText('Ein weiterer Kommentar.')).toBeVisible();
  await expect(page.getByText('Das Licht zwischen den Bergen ist wunderschön.')).toBeVisible();
  expect(offsets).toEqual(['0', '20']);
});
