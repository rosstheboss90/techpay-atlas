import { expect, test } from '@playwright/test'

test('title lens: expand seniority, click a registry SOC segment, role + map update', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  const bubbles = page.locator('.map-bubble')
  await expect(bubbles.first()).toBeVisible()
  const bubbleCountBefore = await bubbles.count()
  expect(bubbleCountBefore).toBeGreaterThan(300)

  // Scroll to the Title lens and wait for its data to load (lazy-fetched on intersect).
  const titleLens = page.locator('.title-lens')
  await titleLens.scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'PM & Product' })).toHaveAttribute('aria-pressed', 'true')

  // Technical Program Manager (PM-family, first bucket) has both tiers and a SOC conflation mix.
  const tpmRow = page.locator('.tl-row', { hasText: 'Technical Program Manager' })
  await expect(tpmRow).toBeVisible()

  // Expand the Seniority disclosure -> at least one tier row appears.
  await tpmRow.getByRole('button', { name: /seniority/i }).click()
  await expect(tpmRow.locator('.tl-tier-row').first()).toBeVisible()
  expect(await tpmRow.locator('.tl-tier-row').count()).toBeGreaterThan(0)

  // At least one conflation segment renders.
  const segments = tpmRow.locator('.tl-mix i')
  expect(await segments.count()).toBeGreaterThan(0)

  // Click the "Computer & Information Systems Managers" (11-3021) segment — in the role
  // registry, distinct from the default role (15-1252 SWE).
  const registrySegment = tpmRow.getByRole('button', { name: /Computer & Information Systems Managers/ })
  await expect(registrySegment).toBeVisible()
  await registrySegment.click()

  // Role select's value changed, and the URL gained the role param. Exact match: the heatmap
  // section's accessible name ("Every metro × every role") also substring-matches getByLabel('Role').
  await expect(page.getByLabel('Role', { exact: true })).toHaveValue('11-3021')
  await expect(page).toHaveURL(/[?&]role=11-3021/)

  // The map still renders its bubbles at (roughly) the same count — recoloring, not
  // re-filtering; only the metric changes with the role, not the set of metros plotted.
  await expect(bubbles.first()).toBeVisible()
  expect(await bubbles.count()).toBe(bubbleCountBefore)
})
