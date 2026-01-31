import { test, expect } from '@playwright/test';

test('shows error when passwords do not match', async ({ page }) => {
  await page.goto('/register');
  await page.getByPlaceholder(/create a strong password/i).fill('oldpass');
  await page.getByPlaceholder(/confirm your password/i).fill('different');

  await expect(
    page.getByText(/passwords do not match./i)
  ).toBeVisible();
});
