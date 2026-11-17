import { Route } from '#lib/route.ts';
import { expect, test } from '#test/medium/fixtures.ts';

const token = 'a'.repeat(43);
const preview = {
  email: 'invitee@example.test',
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  quotaSizeInBytes: 100 * 1024 ** 3,
  termsVersion: '2026-11-17',
};
test.use({ language: 'de' });
test.afterEach(async ({ page }) => {
  await page.unroute('**/api/pholy/invitations**');
  await page.unroute('**/api/pholy/auth/status');
});
for (const width of [1440, 390, 320]) {
  test('invitation form and app setup at ' + width + 'px', async ({ page, context }, testInfo) => {
    await context.clearCookies();
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/pholy/invitations**', (route) => route.fulfill({ json: preview }));
    await page.goto(Route.register() + '#invitation=' + token);
    await expect(page.locator('#invite-email')).toHaveValue(preview.email);
    await expect(page.locator('#invite-email')).toHaveAttribute('readonly', '');
    await expect(page.getByRole('link', { name: 'App Store' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/us/app/immich/id1613945652',
    );
    await expect(page.getByRole('link', { name: 'Google Play' })).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=app.alextran.immich',
    );
    await expect(page.locator('.app-notice code')).toHaveText('https://pholy.de');
    await expect(page.locator('form button[type=submit]')).toBeDisabled();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('invitation.png'), fullPage: true });
  });
}
test('direct registration remains closed without an invitation', async ({ page, context, api }) => {
  await context.clearCookies();
  await page.goto(Route.register());
  await expect(page.getByRole('heading', { name: 'Registrierung nur mit Einladung' })).toBeVisible();
  await expect(page.locator('#invite-name')).toHaveCount(0);
  expect(api.signUpAdmin).not.toHaveBeenCalled();
});
test('an expired or revoked invitation cannot display a registration form', async ({ page, context, logger }) => {
  await context.clearCookies();
  await page.route('**/api/pholy/invitations**', (route) =>
    route.fulfill({
      status: 400,
      json: { message: 'Diese Einladung ist ungültig, abgelaufen oder bereits verwendet.' },
    }),
  );
  await page.goto(Route.register() + '#invitation=' + token);
  await expect(page.getByText('Diese Einladung ist ungültig, abgelaufen oder bereits verwendet.')).toBeVisible();
  await expect(page.locator('#invite-name')).toHaveCount(0);
  expect(logger.error).toHaveBeenCalledWith(/400/);
});
test('requires matching passwords and terms, submits once, then keeps app guidance', async ({ page, context }) => {
  await context.clearCookies();
  const submissions: unknown[] = [];
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => (finish = resolve));
  await page.route('**/api/pholy/invitations**', async (route) => {
    if (route.request().url().endsWith('/preview')) {
      await route.fulfill({ json: preview });
      return;
    }
    submissions.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: { registered: true } });
  });
  await page.goto(Route.register() + '#invitation=' + token);
  await page.locator('#invite-name').fill('Synthetic Person');
  await page.locator('#invite-password').fill('synthetic-long-password');
  await page.locator('#invite-confirm').fill('another-long-password');
  await page.locator('#invite-terms').check();
  const submit = page.locator('form button[type=submit]');
  await expect(submit).toBeDisabled();
  await page.locator('#invite-confirm').fill('synthetic-long-password');
  await submit.click();
  await expect(submit).toBeDisabled();
  expect(submissions).toEqual([
    {
      token,
      name: 'Synthetic Person',
      password: 'synthetic-long-password',
      termsAccepted: true,
      termsVersion: '2026-11-17',
    },
  ]);
  finish();
  await expect(page.locator('.success')).toBeVisible();
  await expect(page).toHaveURL(Route.register());
  await expect(page.locator('#invite-password')).toHaveCount(0);
  await expect(page.locator('.app-notice code')).toHaveText('https://pholy.de');
});
test('administrator creates and revokes an invitation without sending mail', async ({ page, data }, testInfo) => {
  data.user.isAdmin = true;
  await page.route('**/api/pholy/auth/status', (route) =>
    route.fulfill({ json: { mailEnabled: false, passwordLoginEnabled: true } }),
  );
  let items: unknown[] = [];
  let created: unknown;
  let deleted = false;
  await page.route('**/api/pholy/invitations**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      created = req.postDataJSON();
      items = [
        {
          id: '00000000-0000-4000-8000-000000000001',
          ...preview,
          createdAt: '2026-11-17T12:00:00Z',
          usedAt: null,
          revokedAt: null,
        },
      ];
      await route.fulfill({
        json: { ...(items[0] as object), url: 'https://pholy.de/auth/register#invitation=' + token },
      });
    } else if (req.method() === 'DELETE') {
      deleted = true;
      items = [];
      await route.fulfill({ status: 204 });
    } else await route.fulfill({ json: items });
  });
  await page.goto(Route.invitations());
  await page.locator('input[type=email]').fill(preview.email);
  await page.getByRole('button', { name: 'Einladungslink erstellen', exact: true }).click();
  await expect(page.locator('input[readonly]')).toHaveValue('https://pholy.de/auth/register#invitation=' + token);
  expect(created).toEqual({ email: preview.email, quotaGiB: 100, sendEmail: false });
  await expect(page.getByText(preview.email, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('invitations-admin.png'), fullPage: true });
  await page.getByRole('button', { name: 'Widerrufen', exact: true }).click();
  await expect(page.getByText(preview.email, { exact: true })).toHaveCount(0);
  expect(deleted).toBe(true);
});
test('public information pages remain reachable without a session', async ({ page, context }, testInfo) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, title] of [
    ['/kontakt', 'Kontakt'],
    ['/impressum', 'Impressum'],
    ['/datenschutz', 'Datenschutzhinweise'],
    ['/agb', 'Nutzungsbedingungen'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page).toHaveURL(path);
    await expect(page.locator('footer a[href="/kontakt"]')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: testInfo.outputPath('terms-mobile.png'), fullPage: true });
});

test('administrator sees SMTP acceptance and can retry a failed invitation send', async ({ page, data }) => {
  data.user.isAdmin = true;
  await page.route('**/api/pholy/auth/status', (route) =>
    route.fulfill({ json: { mailEnabled: true, passwordLoginEnabled: true } }),
  );
  const invitation = {
    id: '00000000-0000-4000-8000-000000000009',
    ...preview,
    createdAt: new Date().toISOString(),
    usedAt: null,
    revokedAt: null,
    mailStatus: 'accepted',
    mailAcceptedAt: new Date().toISOString(),
  };
  let items: unknown[] = [];
  let created: unknown;
  let sends = 0;
  await page.route('**/api/pholy/invitations**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: items });
    if (route.request().url().endsWith('/send')) {
      sends++;
      invitation.mailStatus = 'failed';
      invitation.mailAcceptedAt = '';
      return route.fulfill({
        json: { ...invitation, url: 'https://pholy.de/auth/register#invitation=' + 'b'.repeat(43) },
      });
    }
    created = route.request().postDataJSON();
    items = [invitation];
    await route.fulfill({ json: { ...invitation, url: 'https://pholy.de/auth/register#invitation=' + token } });
  });
  await page.goto(Route.invitations());
  await page.locator('input[type=email]').fill(preview.email);
  await page.getByRole('checkbox', { name: 'Einladung per E-Mail senden' }).check();
  await page.getByRole('button', { name: 'Erstellen und senden', exact: true }).click();
  await expect(page.locator('.mail-status')).toContainText('Vom Mailserver angenommen');
  expect(created).toEqual({ email: preview.email, quotaGiB: 100, sendEmail: true });
  await page.getByRole('button', { name: 'Erneut senden', exact: true }).click();
  await expect(page.locator('.mail-status')).toHaveText('Versand fehlgeschlagen');
  await expect(page.locator('input[readonly]')).toHaveValue(
    'https://pholy.de/auth/register#invitation=' + 'b'.repeat(43),
  );
  await expect(page.getByRole('button', { name: 'E-Mail senden', exact: true })).toBeVisible();
  expect(sends).toBe(1);
});
