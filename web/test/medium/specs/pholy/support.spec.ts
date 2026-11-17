import { Route } from '#lib/route.ts';
import { expect, test } from '#test/medium/fixtures.ts';
import type { Page } from '@playwright/test';

const ticketId = '00000000-0000-4000-8000-000000000011';
const initialTicket = {
  id: ticketId,
  category: 'upload',
  subject: 'Synthetic upload question',
  status: 'open',
  createdAt: '2026-11-17T12:00:00Z',
  updatedAt: '2026-11-17T12:00:00Z',
  userName: 'Synthetic Member',
  userEmail: 'support-member@example.test',
  messages: [
    { id: 'first', isStaff: false, message: 'Synthetic details for support', createdAt: '2026-11-17T12:00:00Z' },
  ],
};

async function mockSupport(page: Page, empty = false) {
  let ticket = structuredClone(initialTicket);
  let exists = !empty;
  const writes: { path: string; body: unknown }[] = [];
  await page.route('**/api/pholy/support**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/pholy/support', '');
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (path === '') {
        exists = true;
        ticket = {
          ...ticket,
          category: body.category,
          subject: body.subject,
          messages: [{ ...ticket.messages[0], message: body.message }],
        };
      } else {
        const isStaff = path.startsWith('/admin/');
        ticket.messages.push({
          id: 'reply-' + ticket.messages.length,
          isStaff,
          message: body.message,
          createdAt: '2026-11-17T13:00:00Z',
        });
        ticket.status = isStaff ? 'waiting' : 'open';
      }
      await route.fulfill({ json: { id: ticketId } });
    } else if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      ticket.status = body.status;
      await route.fulfill({ json: { id: ticketId } });
    } else if (path === '' || path === '/admin/list') {
      const matches = !url.searchParams.get('status') || url.searchParams.get('status') === ticket.status;
      await route.fulfill({ json: { items: exists && matches ? [ticket] : [], hasMore: false } });
    } else await route.fulfill({ json: ticket });
  });
  return writes;
}

test.use({ language: 'de' });
test.afterEach(async ({ page }) => {
  await page.unroute('**/api/pholy/support**');
});

test('help search and request form fit at 320px', async ({ page }) => {
  await mockSupport(page, true);
  await page.setViewportSize({ width: 320, height: 950 });
  await page.goto(Route.help());
  await page.getByLabel('Hilfe durchsuchen').fill('Immich-App');
  await expect(page.locator('.topics details')).toHaveCount(1);
  await page.getByText('Die Immich-App mit PHOLY verbinden', { exact: true }).click();
  await expect(page.locator('.topics details p')).toContainText('https://pholy.de');
  await page.getByLabel('Hilfe durchsuchen').fill('nonexistent-synthetic-topic');
  await expect(page.getByText('Kein passender Hilfeartikel. Stelle uns unten eine Anfrage.')).toBeVisible();
  await page.getByRole('button', { name: 'Neue Anfrage', exact: true }).click();
  await expect(page.getByLabel('Deine Nachricht')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
});

test('a member creates a request and follows up in the same private thread', async ({ page }) => {
  const writes = await mockSupport(page, true);
  await page.goto(Route.help());
  await page.getByRole('button', { name: 'Neue Anfrage', exact: true }).click();
  await page.getByLabel('Thema', { exact: true }).selectOption('app');
  await page.getByLabel('Betreff', { exact: true }).fill('Synthetic mobile question');
  await page.getByLabel('Deine Nachricht').fill('Synthetic support details');
  await page.getByRole('button', { name: 'Anfrage absenden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic mobile question', exact: true })).toBeVisible();
  await expect(page.locator('.messages')).toContainText('Synthetic support details');
  expect(writes).toEqual([
    { path: '', body: { category: 'app', subject: 'Synthetic mobile question', message: 'Synthetic support details' } },
  ]);
  await page.getByLabel('Antwort schreiben').fill('More synthetic details');
  await page.getByRole('button', { name: 'Antwort senden', exact: true }).click();
  await expect(page.locator('.messages')).toContainText('More synthetic details');
  expect(writes[1]).toEqual({ path: '/' + ticketId + '/messages', body: { message: 'More synthetic details' } });
  await expect(page.getByRole('button', { name: 'Als erledigt markieren' })).toHaveCount(0);
});

test('an administrator replies, resolves and filters support requests', async ({ page, data }) => {
  data.user.isAdmin = true;
  const writes = await mockSupport(page);
  await page.goto(Route.adminSupport());
  await page.getByRole('button', { name: /Synthetic upload question/ }).click();
  await page.getByLabel('Antwort schreiben').fill('Synthetic staff answer');
  await page.getByRole('button', { name: 'Antwort senden', exact: true }).click();
  await expect(page.locator('.messages .staff')).toContainText('Synthetic staff answer');
  await expect(page.locator('.thread-heading')).toContainText('Antwort erhalten');
  await page.getByRole('button', { name: 'Als erledigt markieren', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wieder öffnen', exact: true })).toBeVisible();
  expect(writes).toEqual([
    { path: '/admin/' + ticketId + '/messages', body: { message: 'Synthetic staff answer' } },
    { path: '/admin/' + ticketId, body: { status: 'resolved' } },
  ]);
  await page.getByLabel('Status filtern').selectOption('open');
  await expect(page.locator('.ticket-list')).toContainText('Hier gibt es noch keine passenden Anfragen.');
  await page.getByLabel('Status filtern').selectOption('resolved');
  await expect(page.getByRole('button', { name: /Synthetic upload question/ })).toBeVisible();
});

test('a failed support submission preserves the draft for retry', async ({ page, logger }) => {
  await mockSupport(page, true);
  await page.route('**/api/pholy/support', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({ status: 429, json: { message: 'Bitte versuche es später erneut.' } });
    else await route.fallback();
  });
  await page.goto(Route.help());
  await page.getByRole('button', { name: 'Neue Anfrage', exact: true }).click();
  await page.getByLabel('Betreff', { exact: true }).fill('Keep this draft');
  await page.getByLabel('Deine Nachricht').fill('Synthetic retry details');
  await page.getByRole('button', { name: 'Anfrage absenden', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Bitte versuche es später erneut.');
  await expect(page.getByLabel('Betreff', { exact: true })).toHaveValue('Keep this draft');
  await expect(page.getByLabel('Deine Nachricht')).toHaveValue('Synthetic retry details');
  expect(logger.error).toHaveBeenCalledWith(/429/);
  await page.unroute('**/api/pholy/support');
});
