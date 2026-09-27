import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { addSessionCandidateFixture, createSessionFixture, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test('admin reviews a combined published edit; participants see instructions but not private notes', async ({
  page,
}) => {
  const f = await resetFixtures()
  const replacement = await prisma.user.create({
    data: { name: 'Tuesday PA', email: 'tuesday@fixture.local', role: 'PA' },
  })
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].flatMap((startMin) => [
      { userId: f.pa.id, dayOfWeek: 0, startMin },
      { userId: replacement.id, dayOfWeek: 1, startMin },
    ]),
  })
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      status: 'PUBLISHED',
      publishedAt: new Date(),
      minPAs: 1,
      maxPAs: 2,
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  await addSessionCandidateFixture(session.id, '2027-01-05')
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/workshops/${session.id}`)
  const edit = page.locator('#edit-session')
  await edit.locator('summary').click()
  await edit.getByLabel('Session date', { exact: true }).fill('2027-01-05')
  await edit.getByLabel('Fixture PA', { exact: true }).uncheck()
  await edit.getByLabel('Tuesday PA', { exact: true }).check()
  await expect(edit.getByLabel('Delivery mode', { exact: true })).toHaveCount(0)
  await edit.getByLabel('Location', { exact: true }).fill('https://example.test/meeting')
  await edit.getByLabel('Participant instructions').fill('Bring a laptop and arrive early.')
  await edit.getByLabel('Internal admin notes').fill('PRIVATE: admin-only coordination details.')
  await edit
    .getByLabel('Reason', { exact: true })
    .fill('PRIVATE: replacement discussed with the teacher.')
  await edit.getByRole('button', { name: 'Review full change' }).click()
  await expect(page.getByRole('heading', { name: 'Review workshop change' })).toBeVisible()
  expect(
    (await prisma.workshopSession.findUniqueOrThrow({ where: { id: session.id } })).scheduledStart
  ).toEqual(session.scheduledStart)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'work/combined-change-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Apply workshop change' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/workshops/${session.id}.*changed=1`))
  const saved = await prisma.workshopSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { assignments: true },
  })
  expect(saved.scheduledStart).toEqual(vancouverToUtc('2027-01-05', 600))
  expect(saved.assignments.map((assignment) => assignment.paId)).toEqual([replacement.id])
  await page.setViewportSize({ width: 1365, height: 900 })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, replacement.email, 'pa')
  await expect(page.getByText('Bring a laptop and arrive early.', { exact: true })).toBeVisible()
  await expect(page.getByText(/PRIVATE:/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, f.teacher.email, 'teacher')
  await expect(page.getByText('Bring a laptop and arrive early.', { exact: true })).toBeVisible()
  await expect(page.getByText(/PRIVATE:/)).toHaveCount(0)
})
