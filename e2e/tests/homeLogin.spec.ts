import { test, expect } from '@playwright/test';

test('login page loads correctly', async ({ page }) => {
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { name: /Welcome Back/i })
  ).toBeVisible();
  await expect(page.getByText('Welcome Back')).toBeVisible();
  await expect(page).toHaveURL(/login/);
}); 

test('redirects to login when not authenticated', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/login/);
});
