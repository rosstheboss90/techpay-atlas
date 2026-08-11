import { expect, test } from '@playwright/test'

test('rank-flip slopegraph: renders and a metro click opens the panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  const slope = page.locator('.slope')
  await slope.scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: /Does your salary go far there/i })).toBeVisible()

  // Nodes rendered (two per metro).
  await expect(page.locator('.slope-node').first()).toBeVisible()
  expect(await page.locator('.slope-row').count()).toBeGreaterThan(1)

  // Clicking a metro (a painted label bubbles to the row's handler) opens the drill-down panel.
  // The sr-only/keyboard path is covered by the component test — Playwright won't click a
  // visually-hidden (clipped) element.
  await page.locator('.slope-label').first().click()
  await expect(page.locator('.metro-panel')).toBeVisible()
  expect(page.url()).toContain('metro=')
})
