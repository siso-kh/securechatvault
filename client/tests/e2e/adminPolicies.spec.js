import { test, expect } from '@playwright/test'

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'aaazzzeee'
const RULE_PREFIX = 'E2E rule'

async function loginAsAdmin(page) {
  await page.goto('/admin/login')
  await page.getByLabel('Enter your passcode').fill(ADMIN_PASSCODE)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard$/)
}

test.describe('admin policies page', () => {
  let ruleName

  test.beforeEach(async ({ page }) => {
    ruleName = `${RULE_PREFIX} ${Date.now()}`
    await loginAsAdmin(page)
    await page.goto('/admin/policies')
    await expect(page.getByRole('heading', { name: 'Policies' })).toBeVisible()
  })

  // A failed assertion must not leave test rules in the dev database.
  test.afterEach(async ({ request }) => {
    const login = await request.post('/api/auth/admin-login', {
      data: { passcode: ADMIN_PASSCODE },
    })
    if (!login.ok()) return

    const { token } = await login.json()
    const headers = { Authorization: `Bearer ${token}` }
    const response = await request.get('/api/policies', { headers })
    const { policies = [] } = await response.json()

    for (const policy of policies.filter((p) => p.name.startsWith(RULE_PREFIX))) {
      await request.delete(`/api/policies/${policy._id}`, { headers })
    }
  })

  test('adds a rule, keeps it after reload, then removes it', async ({ page }) => {
    await page.getByRole('button', { name: 'Add rule' }).click()

    await page.getByLabel('Name').fill(ruleName)
    await page.getByLabel('Regex pattern').fill('E2E-[0-9]{4}')
    await page.getByLabel(/Category/).fill('e2e secret')
    await page.getByLabel('Severity').selectOption('medium')
    await page.getByLabel('Action').selectOption('mask')
    await page.getByRole('button', { name: 'Save rule' }).click()

    const row = page.locator('tr', { hasText: ruleName })
    await expect(row).toBeVisible()
    await expect(row).toContainText('E2E_SECRET')
    await expect(row).toContainText('Mask')
    await expect(row).toContainText('medium')

    // The rule came from the API, not just local state.
    await page.reload()
    await expect(page.locator('tr', { hasText: ruleName })).toBeVisible()

    // Delete (window.confirm) and verify the row is gone for good.
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('tr', { hasText: ruleName }).getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('tr', { hasText: ruleName })).toHaveCount(0)

    await page.reload()
    await expect(page.locator('tr', { hasText: ruleName })).toHaveCount(0)
  })

  test('refuses an invalid regex in the add-rule form', async ({ page }) => {
    await page.getByRole('button', { name: 'Add rule' }).click()

    await page.getByLabel('Name').fill(ruleName)
    await page.getByLabel('Regex pattern').fill('[unclosed')
    await page.getByLabel(/Category/).fill('e2e secret')
    await page.getByRole('button', { name: 'Save rule' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('tr', { hasText: ruleName })).toHaveCount(0)
  })
})
