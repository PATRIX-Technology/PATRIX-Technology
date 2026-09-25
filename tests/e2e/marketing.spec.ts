import { test, expect } from '@playwright/test';

test.describe('Marketing home page', () => {
  test('renders in English with the correct language/direction', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Khayali', { exact: true })).toBeVisible();
  });

  test('renders in Arabic with the correct language/direction', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('خيالي', { exact: true })).toBeVisible();
  });

  test('has a working skip-to-content link for keyboard/screen-reader users', async ({ page }) => {
    await page.goto('/en');
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  test('declares the PWA manifest', async ({ page }) => {
    await page.goto('/en');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  });

  test('links to sign-in and sign-up', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('redirects the bare root to a locale-prefixed URL', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(en|ar)\/?$/);
  });
});
