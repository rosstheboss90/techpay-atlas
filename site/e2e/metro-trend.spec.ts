import { expect, test } from '@playwright/test'

// Austin (12420) is a confirmed delineation-break metro: "Austin-Round Rock, TX" became
// "Austin-Round Rock-San Marcos, TX" in 2024 (the OMB 2023-delineation adoption). Its Software
// Developers (15-1252) series also starts in 2021, not 2019 -- that SOC code did not exist as its
// own line before then -- so the panel must render two segments: [2021, 2022, 2023] then
// [2024, 2025]. Deep-linking straight to the panel is deterministic and this is not a map test,
// so we skip the click-a-bubble path happy-path.spec.ts uses.
test.describe('metro trend', () => {
  test('a metro with a delineation break renders separate segments', async ({ page }) => {
    await page.goto('/?metro=12420&role=15-1252')
    await expect(page.getByRole('heading', { name: /Austin-Round Rock/ })).toBeVisible()

    const series = page.locator('[data-metro-series]')
    await expect(series.first()).toBeVisible()
    expect(await series.count()).toBe(2)
  })

  test('the national comparison line is present and the legend names it', async ({ page }) => {
    await page.goto('/?metro=12420&role=15-1252')
    await expect(page.locator('[data-national-series]')).toBeVisible()
    await expect(page.locator('.mt-legend').getByText('National')).toBeVisible()
  })

  test('the boundary-change note names both the old and new metro titles', async ({ page }) => {
    await page.goto('/?metro=12420&role=15-1252')
    await expect(page.getByText('Austin-Round Rock, TX → Austin-Round Rock-San Marcos, TX')).toBeVisible()
  })

  // The last line of defence for the RPP guard: RPP is a spatial index renormalised to US=100
  // every year, so if it ever leaked into this temporal (CPI-U) series the chart would be an
  // artifact, not a trend. Captured at the browser level -- not just scanning MetroTrend's source
  // -- because this is what would actually happen to the reader if the guard ever failed.
  test('toggling cost of living leaves the plotted trend byte-identical', async ({ page }) => {
    await page.goto('/?metro=12420&role=15-1252')
    const before = await page.locator('[data-metro-series]').first().getAttribute('points')
    expect(before).toBeTruthy()

    await page.getByRole('button', { name: /cost of living/i }).click()
    expect(page.url()).toContain('adj=1')

    const after = await page.locator('[data-metro-series]').first().getAttribute('points')
    expect(after).toBe(before)
  })
})
