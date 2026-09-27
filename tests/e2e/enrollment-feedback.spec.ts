import { expect, test, type Page } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

type FeedbackSnapshot = {
  status: string
  button: string
  buttonDisabled: boolean
  continueHref: string | null
  fieldsetDisabled: boolean
}

async function watchEnrollmentNavigation(page: Page) {
  let completedActionResponses = 0
  let heldDocumentRequests = 0
  const actionReleases: Array<() => void> = []
  const documentReleases: Array<() => void> = []
  const feedbackSnapshots: FeedbackSnapshot[] = []

  await page.exposeFunction('recordEnrollmentFeedback', (snapshot: FeedbackSnapshot) => {
    feedbackSnapshots.push(snapshot)
  })
  const observeFeedback = () => {
    let reported = false
    const start = () => {
      if (!document.documentElement) {
        document.addEventListener('DOMContentLoaded', start, { once: true })
        return
      }
      const report = () => {
        if (reported) return
        const status = [...document.querySelectorAll<HTMLElement>('[role="status"]')].find(
          (element) => element.textContent?.includes('Teachers saved.')
        )
        if (!status) return
        const form = status.closest('form')
        const button = [...(form?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
          (element) => element.textContent?.includes('Opening workshop')
        )
        const continueLink = [...(form?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].find(
          (element) => element.textContent?.trim() === 'Continue'
        )
        const fieldset = form?.querySelector<HTMLFieldSetElement>('fieldset')
        if (!button || !continueLink || !fieldset) return
        reported = true
        const browserWindow = window as typeof window & {
          recordEnrollmentFeedback: (snapshot: FeedbackSnapshot) => Promise<void>
        }
        void browserWindow.recordEnrollmentFeedback({
          status: status.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          button: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          buttonDisabled: button.disabled,
          continueHref: continueLink.getAttribute('href'),
          fieldsetDisabled: fieldset.disabled,
        })
      }
      new MutationObserver(report).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      })
      report()
    }
    start()
  }
  await page.addInitScript(observeFeedback)
  await page.evaluate(observeFeedback)

  await page.route('**/admin/workshop-definitions/**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST' && request.headers()['next-action']) {
      const response = await route.fetch()
      completedActionResponses += 1
      if (completedActionResponses === 1) {
        await new Promise<void>((resolve) => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            resolve()
          }
          const timeout = setTimeout(finish, 10_000)
          actionReleases.push(finish)
        })
      }
      await route.fulfill({ response })
      return
    }

    const url = new URL(request.url())
    if (
      request.method() === 'GET' &&
      request.resourceType() === 'document' &&
      url.searchParams.has('saved')
    ) {
      heldDocumentRequests += 1
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve()
        }
        const timeout = setTimeout(finish, 10_000)
        documentReleases.push(finish)
      })
      await route.continue()
      return
    }

    await route.continue()
  })

  return {
    completedActions: () => completedActionResponses,
    heldDocuments: () => heldDocumentRequests,
    feedback: () => feedbackSnapshots,
    releaseAction: () => actionReleases.shift()?.(),
    releaseDocument: () => documentReleases.shift()?.(),
  }
}

test('preserves workshop fields after inline validation and opens a valid creation', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  await login(page, fixture.admin.email, 'admin')
  await page.goto('/admin/workshop-definitions')
  await page.getByRole('link', { name: 'Create a workshop', exact: true }).click()

  const create = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create a workshop' }) })
  await create.getByLabel('Workshop title').fill('Retained creation workshop')
  await create.getByLabel('Delivery starts').fill('2027-03-20')
  await create.getByLabel('Delivery ends').fill('2027-03-01')
  await create.getByLabel('Description').fill('Keep these details after validation.')
  await create.getByRole('button', { name: 'Create a workshop' }).click()

  await expect(
    create.getByRole('alert').filter({
      hasText: 'New workshops need both delivery dates, with the end on or after the start.',
    })
  ).toContainText('New workshops need both delivery dates, with the end on or after the start.')
  await expect(create.getByRole('button', { name: 'Create a workshop' })).toBeEnabled()
  await expect(create.getByLabel('Workshop title')).toHaveValue('Retained creation workshop')
  await expect(create.getByLabel('Delivery starts')).toHaveValue('2027-03-20')
  await expect(create.getByLabel('Delivery ends')).toHaveValue('2027-03-01')
  await expect(create.getByLabel('Description')).toHaveValue('Keep these details after validation.')
  await expect(page).toHaveURL(/\/admin\/workshop-definitions\?create=1#create-workshop$/)
  expect(
    await prisma.workshopDefinition.count({ where: { title: 'Retained creation workshop' } })
  ).toBe(0)

  await create.getByLabel('Delivery ends').fill('2027-03-31')
  await create.getByRole('button', { name: 'Create a workshop' }).click()
  await expect(page).toHaveURL(/\/admin\/workshop-definitions\/[^?]+\?created=1/)
  await expect(page.getByRole('heading', { name: 'Retained creation workshop' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Workshop created.' })).toContainText(
    'Workshop created. Add the teachers that should receive it.'
  )
  const enrollment = page.locator('#add-classes')
  await expect(enrollment.locator('summary')).toHaveAccessibleName('Add teachers')
  await expect(enrollment).toHaveAttribute('open', '')
  await expect(enrollment.getByRole('button', { name: 'Add selected teachers' })).toBeEnabled()
  expect(
    await prisma.workshopDefinition.count({ where: { title: 'Retained creation workshop' } })
  ).toBe(1)

  expect(
    await prisma.workshopDefinition.findFirstOrThrow({
      where: { title: 'Retained creation workshop' },
    })
  ).toMatchObject({
    description: 'Keep these details after validation.',
    deliveryStartsOn: new Date('2027-03-20T00:00:00.000Z'),
    deliveryEndsOn: new Date('2027-03-31T00:00:00.000Z'),
  })
})

test('separates saved enrollment feedback from the updated workshop document', async ({ page }) => {
  const fixture = await resetFixtures()
  await login(page, fixture.admin.email, 'admin')

  await page.goto('/admin/workshop-definitions')
  await page.getByRole('link', { name: 'Create a workshop', exact: true }).click()
  const create = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create a workshop' }) })
  await create.getByLabel('Workshop title').fill('Enrollment feedback workshop')
  await create.getByLabel('Delivery starts').fill('2027-01-04')
  await create.getByLabel('Delivery ends').fill('2027-01-29')
  await create.getByRole('button', { name: 'Create a workshop' }).click()
  await expect(page).toHaveURL(/\/admin\/workshop-definitions\/[^?]+\?created=1/)

  const run = await prisma.workshopDefinition.findFirstOrThrow({
    where: { title: 'Enrollment feedback workshop' },
  })
  const probe = await watchEnrollmentNavigation(page)
  const enrollment = page.locator('#add-classes')
  const checkbox = enrollment.getByRole('checkbox', { name: new RegExp(fixture.cls.name) })
  const submit = enrollment.getByRole('button', { name: 'Add selected teachers' })
  const requestKeyInput = enrollment.locator('input[name="requestKey"]')
  const enrollmentCount = () =>
    prisma.classWorkshop.count({
      where: { workshopDefinitionId: run.id, classSectionId: fixture.cls.id },
    })

  async function submitSelectedClass({
    actionNumber,
    expectedCreated,
  }: {
    actionNumber: number
    expectedCreated: number
  }) {
    await checkbox.check()
    const requestKey = await requestKeyInput.inputValue()
    await submit.click({ noWaitAfter: true })

    await expect.poll(probe.completedActions).toBe(actionNumber)
    await expect.poll(enrollmentCount).toBe(1)
    if (actionNumber === 1) {
      await expect(enrollment.getByRole('button', { name: 'Saving…' })).toBeDisabled()
      await expect(checkbox).toBeDisabled()
      probe.releaseAction()
    }
    await expect.poll(probe.heldDocuments).toBe(actionNumber)
    await expect.poll(() => probe.feedback().length).toBe(actionNumber)
    expect(probe.feedback().at(-1)).toEqual({
      status: 'Teachers saved. Opening the updated page… Continue',
      button: 'Opening workshop…',
      buttonDisabled: true,
      continueHref: `/admin/workshop-definitions/${run.id}?saved=${expectedCreated}`,
      fieldsetDisabled: true,
    })

    probe.releaseDocument()
    await expect(page).toHaveURL(`/admin/workshop-definitions/${run.id}?saved=${expectedCreated}`)
    await expect(page.getByRole('status').filter({ hasText: 'Teachers added.' })).toContainText(
      `${expectedCreated} new teacher${expectedCreated === 1 ? '' : 's'} included`
    )
    const classPicker = page.locator('#add-classes')
    await expect(classPicker).not.toHaveAttribute('open', '')
    await classPicker.locator('summary').click()
    await expect(submit).toBeEnabled()
    await expect(enrollment.getByRole('button', { name: 'Opening workshop…' })).toHaveCount(0)
    await expect(checkbox).not.toBeChecked()
    await expect(enrollment.getByText('0 selected', { exact: true })).toBeVisible()
    expect(await requestKeyInput.inputValue()).not.toBe(requestKey)
  }

  await submitSelectedClass({ actionNumber: 1, expectedCreated: 1 })
  await submitSelectedClass({ actionNumber: 2, expectedCreated: 0 })
  await submitSelectedClass({ actionNumber: 3, expectedCreated: 0 })
  await expect.poll(enrollmentCount).toBe(1)

  const requestKeyBeforeEmptyError = await requestKeyInput.inputValue()
  await submit.click()
  await expect.poll(probe.completedActions).toBe(4)
  await expect(
    enrollment.getByRole('alert').filter({ hasText: 'Select at least one teacher.' })
  ).toContainText('Select at least one teacher.')
  await expect(submit).toBeEnabled()
  await expect(enrollment.getByRole('button', { name: 'Saving…' })).toHaveCount(0)
  await expect.poll(enrollmentCount).toBe(1)
  await expect(requestKeyInput).toHaveValue(requestKeyBeforeEmptyError)

  await checkbox.check()
  await prisma.user.update({
    where: { id: fixture.teacher.id },
    data: { deletedAt: new Date() },
  })
  await submit.click()
  await expect.poll(probe.completedActions).toBe(5)
  await expect(
    enrollment.getByRole('alert').filter({
      hasText: 'One or more selected teachers are inactive or unavailable at their school.',
    })
  ).toContainText('One or more selected teachers are inactive or unavailable at their school.')
  await expect(submit).toBeEnabled()
  await expect(checkbox).toBeChecked()
  await expect(enrollment.getByText('1 selected', { exact: true })).toBeVisible()
  await expect.poll(enrollmentCount).toBe(1)
})

test('completes the reviewed bulk-enrollment form with a fresh document', async ({ page }) => {
  const fixture = await resetFixtures()
  const run = await prisma.workshopDefinition.create({
    data: {
      title: 'Bulk enrollment feedback workshop',
      deliveryStartsOn: new Date('2027-02-01T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-02-26T00:00:00.000Z'),
    },
  })
  await login(page, fixture.admin.email, 'admin')
  await page.goto(
    `/admin/workshop-definitions/enroll?runIds=${run.id}&classSectionIds=${fixture.cls.id}`
  )
  const probe = await watchEnrollmentNavigation(page)

  await page
    .getByRole('button', { name: 'Add 1 teacher to selected workshops', exact: true })
    .click({ noWaitAfter: true })
  await expect.poll(probe.completedActions).toBe(1)
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(
    await prisma.classWorkshop.count({
      where: { workshopDefinitionId: run.id, classSectionId: fixture.cls.id },
    })
  ).toBe(1)
  probe.releaseAction()
  await expect.poll(probe.heldDocuments).toBe(1)
  await expect.poll(() => probe.feedback().length).toBe(1)
  expect(probe.feedback()[0]).toEqual({
    status: 'Teachers saved. Opening the updated page… Continue',
    button: 'Opening workshop…',
    buttonDisabled: true,
    continueHref: '/admin/workshop-definitions/enroll?saved=1',
    fieldsetDisabled: true,
  })
  probe.releaseDocument()
  await expect(page).toHaveURL('/admin/workshop-definitions/enroll?saved=1')
  await expect(page.getByRole('status')).toContainText('1 new teacher addition saved')
  await expect(
    page.getByRole('heading', { name: '1. Select workshops and teachers' })
  ).toBeVisible()
})
