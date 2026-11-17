import { Route } from '#lib/route.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import type { LoginResponseDto } from '@immich/sdk';

test.use({ language: 'de' });

for (const width of [1440, 390, 320]) {
  test(`login layout and password visibility at ${width}px`, async ({ page, context, api }, testInfo) => {
    await context.clearCookies();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(Route.login());
    await expect(page.getByRole('heading', { name: 'Willkommen zurück.' })).toBeVisible();
    await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'email');
    const password = page.locator('#password');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await password.fill('synthetic-password');
    await page.getByRole('button', { name: 'Passwort anzeigen' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Passwort verbergen' }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await password.clear();
    await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Anmeldung mit Passkey' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quellcode', exact: false })).toHaveAttribute('href', Route.source());
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
    await page.getByRole('link', { name: 'Zur Startseite', exact: false }).click();
    await expect(page).toHaveURL(Route.home());
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Deine Bilder.');
    expect(api.login).not.toHaveBeenCalled();
  });
}

test('password submission stays pending until the response and follows the intended destination', async ({
  page,
  context,
  api,
  data,
  baseURL,
}) => {
  await context.clearCookies();
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const response: LoginResponseDto = {
    accessToken: 'synthetic-token',
    isAdmin: true,
    isOnboarded: true,
    name: data.user.name,
    profileImagePath: '',
    shouldChangePassword: false,
    userEmail: data.user.email,
    userId: data.user.id,
  };
  api.on({
    login: async () => {
      await pending;
      await context.addCookies([{ name: 'immich_is_authenticated', value: 'true', url: baseURL! }]);
      return { json: response };
    },
  });
  await page.goto(Route.login({ continue: Route.albums() }));
  await page.locator('#email').fill('pholy-test@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  const submit = page.getByRole('button', { name: 'Anmelden', exact: true });
  await submit.click();
  await expect(submit).toBeDisabled();
  expect(api.login).toHaveBeenCalledWith({
    body: { email: 'pholy-test@example.invalid', password: 'synthetic-password' },
  });
  finish();
  await expect(page).toHaveURL(Route.albums());
});

test('invalid credentials show a readable error and allow retry', async ({ page, context, api, logger }, testInfo) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  api.on({
    login: () => ({ status: 401, json: { message: 'PHOLY Test: Anmeldung fehlgeschlagen', statusCode: 401 } }),
  });
  await page.goto(Route.login());
  await page.locator('#email').fill('pholy-test@example.invalid');
  await page.locator('#password').fill('synthetic-invalid-password');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByText('PHOLY Test: Anmeldung fehlgeschlagen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(Route.login());
  expect(api.login).toHaveBeenCalledWith({
    body: { email: 'pholy-test@example.invalid', password: 'synthetic-invalid-password' },
  });
  expect(logger.error).toHaveBeenCalledWith(/401/);
  await page.screenshot({ path: testInfo.outputPath('login-error.png'), fullPage: true });
});

test('configured alternative sign-in methods remain available without password fields', async ({
  page,
  context,
  data,
}) => {
  await context.clearCookies();
  data.publicConfig.passwordLogin.enabled = false;
  data.publicConfig.oauth.enabled = true;
  data.publicConfig.oauth.buttonText = 'Mit Testkonto anmelden';
  await page.goto(Route.login());
  await expect(page.locator('#email')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anmeldung mit Passkey' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mit Testkonto anmelden' })).toBeEnabled();
});

test('passkey failures remain visible and the action can be retried', async ({ page, context, api, logger }) => {
  await context.clearCookies();
  api.on({
    startAuthentication: () => ({
      status: 401,
      json: { message: 'PHOLY Test: Passkey nicht verfügbar', statusCode: 401 },
    }),
  });
  await page.goto(Route.login());
  await page.getByRole('button', { name: 'Anmeldung mit Passkey' }).click();
  await expect(page.getByText('PHOLY Test: Passkey nicht verfügbar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anmeldung mit Passkey' })).toBeEnabled();
  expect(api.startAuthentication).toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalledWith(/401/);
});

test('disabled sign-in is displayed without inactive form controls', async ({ page, context, data }) => {
  await context.clearCookies();
  data.publicConfig.passwordLogin.enabled = false;
  data.publicConfig.passkey.enabled = false;
  data.publicConfig.oauth.enabled = false;
  await page.goto(Route.login());
  await expect(page.getByText('Die Anmeldung wurde deaktiviert')).toBeVisible();
  await expect(page.locator('#email')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Zur Startseite', exact: false })).toBeVisible();
});

test('public login retains its light palette under a saved dark app theme', async ({ page, context }, testInfo) => {
  await context.clearCookies();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(Route.login());
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(page.locator('.pholy-login-shell')).toHaveCSS('background-color', 'rgb(247, 247, 242)');
  await expect(page.locator('.pholy-login-input').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('#email')).toHaveCSS('color', 'rgb(31, 51, 43)');
  await page.screenshot({ path: testInfo.outputPath('login-dark-preference.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
});
