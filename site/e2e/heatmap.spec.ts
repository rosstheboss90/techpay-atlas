import { expect, test } from '@playwright/test'

test('city × role heatmap: sort, expand, cell click opens metro panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  const heatmap = page.locator('.heatmap')
  await heatmap.scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: 'Every metro × every role' })).toBeVisible()

  // Table rendered with the default top-50 rows.
  const rows = page.locator('.hm-table tbody tr')
  const topCount = await rows.count()
  expect(topCount).toBeGreaterThan(1)

  // Flip the active (descending) sort column to ascending -> the top metro changes.
  const firstRowHeader = page.locator('.hm-table tbody th[scope="row"]').first()
  const before = await firstRowHeader.textContent()
  await page.locator('.hm-colh[aria-sort="descending"] .hm-sort').click()
  await expect(firstRowHeader).not.toHaveText(before!)

  // "Show all" expands the row set beyond the top-50 default.
  await page.getByRole('button', { name: /Show all/ }).click()
  expect(await rows.count()).toBeGreaterThan(topCount)

  // Clicking a cell selects that metro and opens the drill-down panel.
  await page.locator('.hm-cellbtn').first().click()
  await expect(page.locator('.metro-panel')).toBeVisible()
  expect(page.url()).toContain('metro=')
})
