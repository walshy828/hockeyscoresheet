import { expect, test, type Page } from '@playwright/test';

const home = 'Wildcats';
const away = 'Bears';

async function createGame(page: Page) {
  await page.goto('/game/new');
  await page.getByLabel('Name').first().fill(home);
  await page.getByLabel('Name').nth(1).fill(away);
  // paste home roster
  await page.getByText('Roster (0)').first().click();
  await page.getByRole('button', { name: 'Paste roster' }).first().click();
  await page.getByPlaceholder(/Jane Smith/).fill('12 Jane Smith C\n9 Bob Lee D\n30 Sam Stone G\n7 Max Pay LW');
  await page.getByRole('button', { name: /Add 4 players/ }).click();
  await page.getByRole('button', { name: /Create game/ }).click();
  await expect(page.locator('.ghead')).toContainText(home);
}

async function tapRink(page: Page, fx: number, fy: number) {
  const box = (await page.locator('svg[aria-label^="Hockey rink"]').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function scoreGoal(page: Page, num: string, fx = 0.5, fy = 0.15) {
  await expect(async () => {
    if (!(await page.locator('.sheet').count())) await tapRink(page, fx, fy);
    await expect(page.locator('.sheet')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10_000 });
  await page.locator('.sheet .seg').nth(1).getByRole('button', { name: home }).click();
  await page.locator('.sheet .seg').first().getByRole('button', { name: 'Goal' }).click();
  await page.getByRole('button', { name: new RegExp(`^${num} `) }).first().click();
  await page.getByRole('button', { name: /🚨 Goal/ }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
}

const score = (page: Page, side: 'home' | 'away') => page.locator(`.team-cell.${side} .sc`);

test('offline scoring never loses data, syncs on reconnect, viewer sees it live', async ({ page, context, browser, request }) => {
  await createGame(page);
  // service worker must be ready before we go offline
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.locator('.ghead')).toContainText(home);

  // start clock, score online
  await page.getByRole('button', { name: /Start/ }).click();
  await scoreGoal(page, '12');
  await expect(score(page, 'home')).toHaveText('1');
  await expect(page.locator('.syncchip')).toContainText('Synced', { timeout: 20_000 });

  // find view token via the share sheet link
  await page.getByRole('button', { name: 'Share and export' }).click();
  const link = (await page.locator('code').first().textContent())!.trim();
  await page.keyboard.press('Escape');
  const token = link.split('/v/')[1];
  const api = (await request.get(`/api/view/${token}`)).json();
  expect((await api).events.filter((e: any) => e.type === 'goal')).toHaveLength(1);

  // open a viewer in a separate context
  const vctx = await browser.newContext();
  const viewer = await vctx.newPage();
  await viewer.goto(`/v/${token}`);
  await expect(viewer.locator('.team-cell.home .sc')).toHaveText('1');
  await expect(viewer.locator('.syncchip')).toContainText('LIVE');

  // ---- go offline: score two more goals + a shot, then reload the page ----
  await context.setOffline(true);
  await scoreGoal(page, '9', 0.4, 0.3);
  await scoreGoal(page, '7', 0.6, 0.2);
  await expect(score(page, 'home')).toHaveText('3');
  await expect(page.locator('.syncchip')).toContainText(/Offline/);
  await page.reload(); // app shell + data must come from the device
  await expect(page.locator('.ghead')).toContainText(home);
  await expect(score(page, 'home')).toHaveText('3');
  // viewer hasn't seen them yet
  await expect(viewer.locator('.team-cell.home .sc')).toHaveText('1');

  // ---- back online ----
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.syncchip')).toContainText('Synced', { timeout: 30_000 });
  const after = await (await request.get(`/api/view/${token}`)).json();
  expect(after.events.filter((e: any) => e.type === 'goal')).toHaveLength(3);
  await expect(viewer.locator('.team-cell.home .sc')).toHaveText('3', { timeout: 15_000 });

  // viewer tabs work
  await viewer.getByRole('button', { name: 'Shots' }).click();
  await expect(viewer.locator('svg[aria-label^="Hockey rink"]')).toBeVisible();
  await viewer.getByRole('button', { name: 'Faceoffs' }).click();
  await viewer.getByRole('button', { name: 'Ice time' }).click();
  await vctx.close();
});
