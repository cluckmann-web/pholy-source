import { Route } from '#lib/route.ts';
import { expect, test } from '#test/medium/fixtures.ts';

const token = 'a'.repeat(43);
test.use({ language: 'de' });
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});
test.afterEach(async ({ page }) => {
  await page.unroute('**/api/pholy/auth/**');
});

test('password recovery gives the same generic confirmation for any address', async ({ page }) => {
  const requested: unknown[] = [];
  await page.route('**/api/pholy/auth/**', async (route) => {
    if (route.request().url().endsWith('/status'))
      return route.fulfill({ json: { mailEnabled: true, passwordLoginEnabled: true } });
    requested.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, json: { accepted: true } });
  });
  await page.goto(Route.forgotPassword());
  await page.locator('#reset-email').fill('unknown@example.test');
  await page.getByRole('button', { name: 'Link anfordern', exact: true }).click();
  await expect(
    page.getByText('Wenn ein passendes Konto besteht, erhältst du eine E-Mail mit einem Link zum Zurücksetzen.'),
  ).toBeVisible();
  expect(requested).toEqual([{ email: 'unknown@example.test' }]);
});

test('unconfigured mail is shown honestly without a request form', async ({ page }) => {
  await page.route('**/api/pholy/auth/**', (route) =>
    route.fulfill({ json: { mailEnabled: false, passwordLoginEnabled: true } }),
  );
  await page.goto(Route.forgotPassword());
  await expect(page.getByText(/Passwort-Wiederherstellung ist derzeit nicht verfügbar/)).toBeVisible();
  await expect(page.locator('#reset-email')).toHaveCount(0);
});

test('reset consumes a fragment token once, clears it from the URL and validates matching passwords', async ({
  page,
}) => {
  const requested: unknown[] = [];
  await page.route('**/api/pholy/auth/**', async (route) => {
    requested.push(route.request().postDataJSON());
    await route.fulfill({ json: { reset: true } });
  });
  await page.goto(Route.resetPassword() + '#token=' + token);
  await expect(page).toHaveURL(Route.resetPassword());
  await page.locator('#new-password').fill('synthetic-long-password');
  await page.locator('#confirm-password').fill('different-password');
  await page.getByRole('button', { name: 'Passwort speichern', exact: true }).click();
  expect(requested).toEqual([]);
  await page.locator('#confirm-password').fill('synthetic-long-password');
  await page.getByRole('button', { name: 'Passwort speichern', exact: true }).click();
  await expect(
    page.getByText('Dein Passwort wurde geändert. Alle bestehenden Sitzungen wurden beendet.'),
  ).toBeVisible();
  await expect(page.locator('#new-password')).toHaveCount(0);
  expect(requested).toEqual([{ token, password: 'synthetic-long-password' }]);
});

test('an incomplete reset link offers a new request without a password form', async ({ page }) => {
  await page.goto(Route.resetPassword() + '#token=invalid');
  await expect(page.getByRole('link', { name: 'Neuen Link anfordern' })).toHaveAttribute(
    'href',
    Route.forgotPassword(),
  );
  await expect(page.locator('#new-password')).toHaveCount(0);
});
