import { test, expect } from '@playwright/test';

test.describe('Account', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your email').fill('ananas@gmail.com');
    await page.getByPlaceholder('Enter your password').fill('ananas1234');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/account');
  });

  test('account page shows profile info', async ({ page }) => {
    await expect(page.getByText('Account Settings')).toBeVisible();
    await expect(page.getByText('Update your personal details.')).toBeVisible();
    await expect(page.getByText('Update your personal details')).toBeVisible();
  });
});
