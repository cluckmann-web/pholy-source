import { Route } from '#lib/route.ts';
import { expect, test } from '#test/medium/fixtures.ts';

const email = 'synthetic-account@example.test';
const state = () => ({
  email,
  isAdmin: false,
  hasPassword: true,
  closeRequestedAt: null as string | null,
  closeAfter: null as string | null,
  exportExpiresAt: null as string | null,
});
test.use({ language: 'de' });
test.afterEach(async ({ page }) => {
  await page.unroute('**/api/pholy/account**');
});

test('exports account JSON and bounded original ZIP parts after password confirmation', async ({ page, data }) => {
  data.user.isAdmin = false;
  const account = state();
  const submissions: unknown[] = [];
  await page.route('**/api/pholy/account**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.endsWith('/export')) {
      submissions.push(request.postDataJSON());
      account.exportExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
      await route.fulfill({
        json: { exportExpiresAt: account.exportExpiresAt, exportBefore: new Date().toISOString() },
      });
    } else if (url.pathname.endsWith('/part')) {
      await route.fulfill({
        json: {
          count: 2,
          size: 1000,
          nextCursor: url.searchParams.has('cursor') ? null : '00000000-0000-4000-8000-000000000010',
          files: [],
        },
      });
    } else {
      await route.fulfill({ json: account });
    }
  });
  await page.goto(Route.account());
  const exportPanel = page.getByRole('region', { name: 'Alle eigenen Daten exportieren' });
  await exportPanel.getByLabel('Aktuelles Passwort').fill('synthetic-password');
  await exportPanel.getByRole('button', { name: 'Export vorbereiten' }).click();
  await expect(exportPanel.getByRole('link', { name: 'Konto und Metadaten herunterladen (JSON)' })).toHaveAttribute(
    'href',
    '/api/pholy/account/export/metadata',
  );
  await expect(exportPanel.getByRole('link', { name: /Originale herunterladen · Teil 1/ })).toHaveAttribute(
    'href',
    '/api/pholy/account/export/archive',
  );
  await expect(exportPanel.getByLabel('Aktuelles Passwort')).toHaveValue('');
  await exportPanel.getByRole('button', { name: 'Nächsten ZIP-Teil vorbereiten' }).click();
  await expect(exportPanel.getByRole('link', { name: /Originale herunterladen · Teil 2/ })).toHaveAttribute(
    'href',
    '/api/pholy/account/export/archive?cursor=00000000-0000-4000-8000-000000000010',
  );
  await expect(exportPanel.getByRole('button', { name: 'Nächsten ZIP-Teil vorbereiten' })).toHaveCount(0);
  expect(submissions).toEqual([{ password: 'synthetic-password' }]);
});

test('requires closure confirmation and allows cancellation during grace', async ({ page, data }) => {
  data.user.isAdmin = false;
  const account = state();
  let requestBody: unknown;
  let cancelled = 0;
  await page.route('**/api/pholy/account**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      requestBody = request.postDataJSON();
      account.closeRequestedAt = new Date().toISOString();
      account.closeAfter = new Date(Date.now() + 7 * 86_400_000).toISOString();
    }
    if (request.method() === 'DELETE') {
      cancelled++;
      account.closeRequestedAt = null;
      account.closeAfter = null;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ json: account });
  });
  await page.goto(Route.account());
  const closePanel = page.getByRole('region', { name: 'Konto schließen' });
  const button = closePanel.getByRole('button', { name: 'Schließung in sieben Tagen vormerken' });
  await expect(button).toBeDisabled();
  await closePanel.getByLabel('E-Mail-Adresse zur Bestätigung eingeben').fill(email);
  await closePanel.getByLabel('Aktuelles Passwort').fill('synthetic-password');
  await closePanel.getByRole('checkbox').check();
  await button.click();
  await expect(closePanel.getByRole('button', { name: 'Konto behalten · Schließung widerrufen' })).toBeVisible();
  expect(requestBody).toEqual({ email, password: 'synthetic-password', confirm: true });
  await closePanel.getByRole('button', { name: 'Konto behalten · Schließung widerrufen' }).click();
  await expect(button).toBeDisabled();
  expect(cancelled).toBe(1);
});

test('protects administrator accounts and gives passwordless accounts truthful guidance', async ({ page, data }) => {
  data.user.isAdmin = true;
  await page.route('**/api/pholy/account**', (route) =>
    route.fulfill({ json: { ...state(), isAdmin: true, hasPassword: false } }),
  );
  await page.goto(Route.account());
  await expect(
    page.getByText('Administratorkonten können hier nicht geschlossen werden.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Schließung in sieben Tagen vormerken' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export vorbereiten' })).toBeDisabled();
  await expect(page.getByText('Falls dein Konto nur einen externen Login', { exact: false })).toBeVisible();
});

for (const width of [1440, 320]) {
  test('account export and closure fit at ' + width + 'px', async ({ page, data }) => {
    data.user.isAdmin = false;
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/pholy/account**', (route) => route.fulfill({ json: state() }));
    await page.goto(Route.account());
    await expect(page.getByRole('heading', { name: 'Alle eigenen Daten exportieren' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
  });
}
