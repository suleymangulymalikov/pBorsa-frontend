import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your email').fill('ananas@gmail.com');
    await page.getByPlaceholder('Enter your password').fill('ananas1234');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('test page already authenticated', async ({ page }) => {
  });

  test('user can login and see dashboard', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /strategy dashboard/i })
    ).toBeVisible();
  });

  test('dashboard loads portfolio widgets', async ({ page }) => {
    await expect(page.getByText('Active Strategies')).toBeVisible();
    await expect(page.getByText('Total Value')).toBeVisible();
    await expect(page.getByText('Unrealized P/L')).toBeVisible();
    await expect(page.getByText('Open Positions')).toBeVisible();
  });
})
