import { expect, test } from '@playwright/test';

test('records SPA transitions and exports replay-oriented metadata', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Init GTM-like recorder' }).click();
  await page.getByRole('button', { name: 'Go to forms' }).click();
  await page.getByLabel('Work email').fill('test@example.com');
  await page.getByRole('button', { name: 'Submit form' }).click();

  const exported = await page.evaluate(() => window.FlowRecorder.exportSession());
  expect(exported).not.toBeNull();
  expect(exported?.events.some((event) => event.event_type === 'route.change')).toBeTruthy();
  expect(
    exported?.events.some(
      (event) => event.event_type === 'click' && (event.selectors?.length ?? 0) > 0,
    ),
  ).toBeTruthy();
  expect(
    exported?.events.some(
      (event) => event.event_type === 'submit' && Boolean(event.visible_context?.items.length),
    ),
  ).toBeTruthy();
});
