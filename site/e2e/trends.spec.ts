import { expect, test } from '@playwright/test'

test('trends: figures render, rank order, selection, keyboard, caveats', async ({ page }) => {
  await page.goto('/trends')
  await expect(page.getByRole('heading', { name: 'Pay trends' })).toBeVisible()

  // Both figures render with real data: 21 roles in each.
  const labels = page.locator('[data-role-label]')
  const series = page.locator('[data-series]')
  expect(await labels.count()).toBe(21)
  expect(await series.count()).toBe(21)

  // The ranking is ordered and real: best-first, worst-last.
  const rows = page.locator('[data-role-row]')
  await expect(rows.first().locator('[data-role-label]')).toHaveText('Web & Digital Interface Designers')
  await expect(rows.last().locator('[data-role-label]')).toHaveText('Software QA Analysts & Testers')

  // Selection re-anchors both figures and survives a reload.
  await page.getByRole('button', { name: /Information Security Analysts/ }).click()
  const security = page.locator('[data-series="15-1212"]')
  await expect(security).toHaveAttribute('data-highlighted', 'true')
  expect(page.url()).toContain('role=15-1212')

  await page.reload()
  await expect(page.locator('[data-series="15-1212"]')).toHaveAttribute('data-highlighted', 'true')

  // Exactly one series is highlighted at a time.
  expect(await page.locator('[data-highlighted="true"]').count()).toBe(1)

  // Keyboard selection: focus a row and press Enter.
  const uxRow = page.getByRole('button', { name: /Web & Digital Interface Designers/ })
  await uxRow.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-series="15-1255"]')).toHaveAttribute('data-highlighted', 'true')
  expect(await page.locator('[data-highlighted="true"]').count()).toBe(1)

  // The caveats are visible, not merely present in the DOM.
  await expect(page.getByText(/ran especially high for pay/)).toBeVisible()
  await expect(page.getByText(/Occupation mix moves medians independent of pay/)).toBeVisible()

  // The ragged start is real: 15-1252 starts 2021, 11-3021 runs the full 2019-2025 span.
  const raggedPoints = await page.locator('[data-series="15-1252"]').getAttribute('points')
  const fullPoints = await page.locator('[data-series="11-3021"]').getAttribute('points')
  const countPoints = (p: string | null) => (p ?? '').trim().split(/\s+/).filter(Boolean).length
  expect(countPoints(raggedPoints)).toBeLessThan(countPoints(fullPoints))
})

test('trends: year-by-year table shows real ground-truth figures for the default role', async ({ page }) => {
  await page.goto('/trends')
  await expect(page.getByRole('heading', { name: 'Pay trends' })).toBeVisible()

  // Default-selected role is 15-1252 (Software Developers). Against the real emitted data
  // (base year 2025), its 2025 row should read $135,980 in both the nominal and the base-year
  // ($) column, and 2019 predates the role's own BLS code — so it must read the reason string,
  // not a blank or a dash.
  const table = page.locator('table.tr-table')
  await expect(table).toBeVisible()

  const row2025 = table.locator('tbody tr').filter({ hasText: '2025' })
  await expect(row2025.getByRole('cell', { name: '$135,980' })).toHaveCount(2)

  const row2019 = table.locator('tbody tr').filter({ hasText: '2019' })
  await expect(row2019.getByText('no separate BLS code')).toBeVisible()
})
