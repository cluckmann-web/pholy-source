import { Route } from '#lib/route.ts';
import { expect, test } from '#test/medium/fixtures.ts';

test.use({ language: 'de' });

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 320, height: 800 },
]) {
  test(`public homepage works at ${viewport.width}px`, async ({ page, context }, testInfo) => {
    await context.clearCookies();
    await page.setViewportSize(viewport);
    await page.goto(Route.home());
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deine Bilder.Deine Perspektive.');
    await expect(page).toHaveURL(Route.home());
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Fotos und Videos/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    if (viewport.width < 700) {
      const menu = page.getByRole('button', { name: 'Menü', exact: false });
      await menu.click();
      await expect(page.getByRole('navigation', { name: 'Startseite', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('navigation', { name: 'Startseite', exact: true })).toBeHidden();
      await menu.click();
    }
    await page
      .getByRole('navigation', { name: 'Startseite', exact: true })
      .getByRole('link', { name: 'Einblicke' })
      .click();
    await expect(page).toHaveURL('/#einblicke');
    if (viewport.width < 700) {
      await expect(page.getByRole('navigation', { name: 'Startseite', exact: true })).toBeHidden();
    }
    await expect(page.getByRole('heading', { name: 'Deine Sammlung. Klar im Blick.' })).toBeInViewport();
    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Quellcode', exact: false })).toHaveAttribute('href', Route.source());
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: testInfo.outputPath('landing.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('link', { name: 'PHOLY öffnen', exact: false }).first().click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('textbox', { name: /E-Mail/ })).toBeVisible();
  });
}

test('signed-in visitors can open their collection from the homepage', async ({ page }) => {
  await page.goto(Route.home());
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deine Perspektive.');
  await page.getByRole('link', { name: 'PHOLY öffnen', exact: false }).first().click();
  await expect(page).toHaveURL(Route.photos());
  await expect(page.getByRole('main')).toBeVisible();
});

test('first setup remains available before initialization', async ({ page, context, data }) => {
  data.serverConfig.isInitialized = false;
  await context.clearCookies();
  await page.goto(Route.home());
  await expect(page.locator(`a[href="${Route.register()}"]`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deine Bilder. Deine Perspektive.' })).toHaveCount(0);
});
