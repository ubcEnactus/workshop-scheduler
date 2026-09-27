import { expect, test, type Page } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { vancouverToUtc } from '../../src/lib/time'
import { addCandidateFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

type FeedbackSnapshot = {
  status: string
  button: string
  buttonDisabled: boolean
  continueHref: string | null
  fieldsetDisabled: boolean
}

async function preparePlanning(page: Page) {
  const fixture = await resetFixtures()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      title: 'Planning feedback workshop',
      deliveryStartsOn: new Date('2027-01-01T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-31T00:00:00.000Z'),
      defaultMinPAs: 1,
      defaultMaxPAs: 2,
    },
  })
  await prisma.classMeeting.deleteMany({ where: { classSectionId: fixture.cls.id } })
  await addCandidateFixture(fixture.cls.id, '2027-01-04')
  await login(page, fixture.admin.email, 'admin')
  await page.goto('/admin/workshops/plan?workshopDefinitionId=fixture-definition-1&week=2027-01-04')
  await page.getByLabel('Fixture School · Fixture Biology date and time').selectOption({ index: 1 })
  await page.getByText('Session details (optional)', { exact: true }).click()
  await page.getByLabel('Location (optional)').fill('Retained planning room')
  await page
    .getByLabel('Participant instructions (optional)')
    .fill('Meet the facilitator at the office.')
  await page.getByLabel('Internal notes (optional)').fill('Retain this private planning note.')
  return fixture
}

async function watchPlanningNavigation(page: Page) {
  let completedActionResponses = 0
  let duplicateActionStatus: number | null = null
  let heldDocumentRequests = 0
  const feedbackSnapshots: FeedbackSnapshot[] = []
  const actionReleases: (() => void)[] = []
  const documentReleases: (() => void)[] = []

  await page.exposeFunction('recordPlanningFeedback', (snapshot: FeedbackSnapshot) => {
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
          (element) => element.textContent?.includes('Dates saved.')
        )
        if (!status) return
        const form = status.closest('form')
        const button = [...(form?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
          (element) => element.textContent?.includes('Opening saved sessions')
        )
        const continueLink = [...(form?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].find(
          (element) => element.textContent?.trim() === 'Continue'
        )
        const fieldset = form?.querySelector<HTMLFieldSetElement>('fieldset')
        if (!button || !continueLink || !fieldset) return
        reported = true
        const browserWindow = window as typeof window & {
          recordPlanningFeedback: (snapshot: FeedbackSnapshot) => Promise<void>
        }
        void browserWindow.recordPlanningFeedback({
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
    const url = new URL(request.url())
    if (
      request.method() === 'POST' &&
      request.headers()['next-action'] &&
      url.pathname === '/admin/workshop-definitions/fixture-definition-1' &&
      request.postData()?.includes('name="_1_destination"')
    ) {
      const response = await route.fetch()
      const duplicate = await route.fetch()
      duplicateActionStatus = duplicate.status()
      completedActionResponses += 1
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
      await route.fulfill({ response })
      return
    }

    if (
      request.method() === 'GET' &&
      request.resourceType() === 'document' &&
      url.pathname === '/admin/workshop-definitions/fixture-definition-1' &&
      url.searchParams.has('batch')
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
    duplicateStatus: () => duplicateActionStatus,
    heldDocuments: () => heldDocumentRequests,
    feedback: () => feedbackSnapshots,
    releaseAction: () => actionReleases.shift()?.(),
    releaseDocument: () => documentReleases.shift()?.(),
  }
}

test('acknowledges a saved planning batch before opening its fresh workshop document', async ({
  page,
}) => {
  const fixture = await preparePlanning(page)

  await expect(page.getByText('Automatic staffing has a shortfall', { exact: false })).toBeVisible()
  await page.getByText('Staffing check details', { exact: true }).click()
  await expect(page.getByText(/bounded repair search/i)).toHaveCount(0)
  const staffingSummary = page.locator('summary').filter({
    hasText: 'Minimum staffing is not met · Fixture School · Fixture Biology',
  })
  const staffingDetails = staffingSummary.locator('..')
  const firstReason = staffingDetails.locator('li').first()
  await expect(staffingDetails).not.toHaveAttribute('open', '')
  await expect(firstReason).toBeHidden()
  await staffingSummary.focus()
  await staffingSummary.press('Enter')
  await expect(staffingDetails).toHaveAttribute('open', '')
  await expect(firstReason).toBeVisible()
  await expect(staffingDetails).toContainText('Jan 4, 2027')

  const requestKey = await page
    .getByRole('region', { name: 'Choose teacher dates' })
    .locator('input[name="requestKey"]')
    .inputValue()
  const probe = await watchPlanningNavigation(page)
  await page
    .getByRole('button', { name: 'Save dates & continue', exact: true })
    .click({ noWaitAfter: true })

  await expect.poll(probe.completedActions).toBe(1)
  await expect(page.getByRole('button', { name: 'Saving dates…' }).first()).toBeDisabled()
  const batch = await prisma.workshopBatch.findUniqueOrThrow({ where: { requestKey } })
  await expect
    .poll(() =>
      prisma.workshopSession.count({
        where: { classWorkshop: { workshopDefinitionId: 'fixture-definition-1' } },
      })
    )
    .toBe(1)
  expect(probe.duplicateStatus()).not.toBeNull()
  expect(probe.duplicateStatus()).toBeLessThan(400)

  probe.releaseAction()
  await expect.poll(probe.heldDocuments).toBe(1)
  await expect.poll(() => probe.feedback().length).toBe(1)
  const destination = `/admin/workshop-definitions/fixture-definition-1?step=staff&created=1&batch=${batch.id}&week=2027-01-04`
  expect(probe.feedback()[0]).toEqual({
    status: 'Dates saved. Opening the workshop… Continue',
    button: 'Opening saved sessions…',
    buttonDisabled: true,
    continueHref: destination,
    fieldsetDisabled: true,
  })

  probe.releaseDocument()
  await expect(page).toHaveURL(destination)
  await expect(
    page.getByRole('status').filter({ hasText: '1 teacher session saved to the private draft' })
  ).toBeVisible()
  expect(await prisma.workshopBatch.count({ where: { requestKey } })).toBe(1)
  expect(
    await prisma.workshopSession.count({
      where: { classWorkshop: { workshopDefinitionId: 'fixture-definition-1' } },
    })
  ).toBe(1)

  const session = await prisma.workshopSession.findFirstOrThrow({
    where: { classWorkshop: { workshopDefinitionId: 'fixture-definition-1' } },
  })
  expect(session).toMatchObject({
    location: 'Retained planning room',
    participantInstructions: 'Meet the facilitator at the office.',
    notes: 'Retain this private planning note.',
  })
  await expect
    .poll(() =>
      page.evaluate(
        (storageKey) => sessionStorage.getItem(storageKey),
        `workshop-planning:${fixture.admin.id}:fixture-definition-1`
      )
    )
    .toBeNull()
})

test('retains a rejected planning choice and details for a corrected retry', async ({ page }) => {
  const fixture = await preparePlanning(page)
  const requestKey = await page
    .getByRole('region', { name: 'Choose teacher dates' })
    .locator('input[name="requestKey"]')
    .inputValue()
  const blockingEnrollment = await prisma.classWorkshop.findUniqueOrThrow({
    where: {
      classSectionId_workshopDefinitionId: {
        classSectionId: fixture.cls.id,
        workshopDefinitionId: 'fixture-definition-1',
      },
    },
  })
  const blocker = await prisma.workshopSession.create({
    data: {
      classWorkshopId: blockingEnrollment.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 2,
    },
  })

  await page.getByRole('button', { name: 'Save dates & continue', exact: true }).click()
  await expect(
    page.getByRole('alert').filter({
      hasText: 'This teacher workshop already has a scheduled or completed session.',
    })
  ).toContainText('Your selections are still shown.')
  await expect(page.getByText('1 teacher date selected across this workshop')).toBeVisible()
  await expect(page.getByLabel('Fixture School · Fixture Biology date and time')).not.toHaveValue(
    ''
  )
  await expect(page.getByLabel('Location (optional)')).toHaveValue('Retained planning room')
  await expect(page.getByLabel('Participant instructions (optional)')).toHaveValue(
    'Meet the facilitator at the office.'
  )
  await expect(page.getByLabel('Internal notes (optional)')).toHaveValue(
    'Retain this private planning note.'
  )
  await expect(
    page.getByRole('region', { name: 'Choose teacher dates' }).locator('input[name="requestKey"]')
  ).toHaveValue(requestKey)
  await expect(
    page.getByRole('button', { name: 'Save dates & continue', exact: true })
  ).toBeEnabled()
  expect(await prisma.workshopBatch.count({ where: { requestKey } })).toBe(0)

  await prisma.workshopSession.delete({ where: { id: blocker.id } })
  await page.getByRole('button', { name: 'Save dates & continue', exact: true }).click()
  await expect(page).toHaveURL(
    /\/admin\/workshop-definitions\/fixture-definition-1\?step=staff&created=1&batch=/
  )
  await expect(
    page.getByRole('status').filter({ hasText: '1 teacher session saved to the private draft' })
  ).toBeVisible()
  expect(await prisma.workshopBatch.count({ where: { requestKey } })).toBe(1)
  expect(
    await prisma.workshopSession.count({
      where: { classWorkshop: { workshopDefinitionId: 'fixture-definition-1' } },
    })
  ).toBe(1)
})
