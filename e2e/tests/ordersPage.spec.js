import { test, expect } from '@playwright/test';

test.describe('OrdersPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your email').fill('ananas@gmail.com');
    await page.getByPlaceholder('Enter your password').fill('ananas1234');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/orders');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText(/orders/i);
  });

  test('shows loading initially', async ({ page }) => {
    await expect(page.locator('text=Loading')).toBeVisible();
  });

  test('loads price chart when scrolled into view', async ({ page }) => {
    await page.selectOption('select', { index: 1 });

    const chartTitle = page.getByText(/price chart/i);
    await chartTitle.scrollIntoViewIfNeeded();

    await expect(chartTitle).toBeVisible();
    await page.mouse.wheel(-300, 0);
  });
});
