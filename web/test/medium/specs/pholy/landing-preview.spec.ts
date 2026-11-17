import { Route } from '#lib/route.ts';
import { factory } from '#test/common/factories.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import { readFile } from 'node:fs/promises';

test.use({ language: 'de' });
test('capture PHOLY with licensed demonstration photographs', async ({ page, context, data, app }, testInfo) => {
  Object.assign(data.user, { name: 'PHOLY', email: 'demo@example.invalid' });
  data.setPreferences(factory.preferences({ sharedLinks: { enabled: true, sidebarWeb: true } }));
  const names = [
    'lake',
    'architecture',
    'portrait',
    'mountain',
    'forest',
    'lake',
    'mountain',
    'architecture',
    'forest',
    'portrait',
    'lake',
    'mountain',
  ];
  const assets = names.map((name, index) =>
    factory.asset({
      originalFileName: name + '.webp',
      fileCreatedAt: '2026-07-18T12:' + String(30 - index).padStart(2, '0') + ':00.000Z',
      width: name === 'portrait' ? 1200 : 1800,
      height: 1200,
    }),
  );
  data.addAssets(assets);
  const pattern = /\/api\/assets\/[^/]+\/thumbnail/;
  await context.route(pattern, async (route) => {
    const index = assets.findIndex(({ id }) => route.request().url().includes(id));
    if (index === -1) {
      await route.fallback();
      return;
    }
    const body = await readFile('static/pholy/landing/' + names[index] + '.webp');
    await route.fulfill({ body, contentType: 'image/webp' });
  });
  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 960 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(Route.photos());
      await expect(app.timeline.thumbnail(assets[0])).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      });
      await page.screenshot({ path: testInfo.outputPath(viewport.name + '.png'), animations: 'disabled' });
    }
  } finally {
    await context.unroute(pattern);
  }
});
