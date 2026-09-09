import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
export async function requestLink(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Send magic link' }).click()
  await expect(page).toHaveURL(/\/login\/check-email/)
  let link = ''
  await expect
    .poll(async () => {
      const log = await readFile(process.env.E2E_SERVER_LOG!, 'utf8')
      const lines = log.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === `to: ${email}`)
          link = lines[i + 1]?.trim().replace(/^url: /, '') ?? ''
      }
      return link
    })
    .toMatch(/^http:\/\/localhost:.*\/api\/auth\/callback\/resend/)
  return link
}

export async function login(page: Page, email: string, role: 'admin' | 'pa' | 'teacher') {
  const link = await requestLink(page, email)
  await page.goto(link)
  await expect(page).toHaveURL(new RegExp(`/${role}$`))
  await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible()
  return link
}
