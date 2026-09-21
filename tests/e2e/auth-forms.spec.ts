import { test, expect } from '@playwright/test';

test.describe('Sign-up form', () => {
  test('renders every required field', async ({ page }) => {
    await page.goto('/en/sign-up');
    await expect(page.getByLabel(/organisation name/i)).toBeVisible();
    await expect(page.getByLabel(/your full name/i)).toBeVisible();
    await expect(page.getByLabel(/work email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create organisation/i })).toBeVisible();
  });

  test('rejects submission with empty required fields (native HTML validation)', async ({ page }) => {
    await page.goto('/en/sign-up');
    await page.getByRole('button', { name: /create organisation/i }).click();
    const orgNameInput = page.getByLabel(/organisation name/i);
    await expect(orgNameInput).toBeFocused();
  });

  test('links back to sign-in', async ({ page }) => {
    await page.goto('/en/sign-up');
    await page.getByRole('link', { name: /sign in instead/i }).click();
    await expect(page).toHaveURL(/\/en\/sign-in$/);
  });
});

test.describe('Sign-in form', () => {
  test('renders email and password fields', async ({ page }) => {
    await page.goto('/en/sign-in');
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });

  test('renders correctly right-to-left in Arabic', async ({ page }) => {
    await page.goto('/ar/sign-in');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button')).toBeVisible();
  });

  test('links to sign-up', async ({ page }) => {
    await page.goto('/en/sign-in');
    await page.getByRole('link', { name: /create one/i }).click();
    await expect(page).toHaveURL(/\/en\/sign-up$/);
  });
});
