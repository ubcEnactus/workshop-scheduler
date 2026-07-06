'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runSchedule, PAAvailability } from '@/lib/scheduling/algorithm'
const FAKE_AVAILABILITIES: PAAvailability[] = [
  // Alice (pa-1): Mon 08-11, Wed 13-16
  { paId: 'pa-1', dayOfWeek: 0, startMinute: 480, endMinute: 660 },
  { paId: 'pa-1', dayOfWeek: 2, startMinute: 780, endMinute: 960 },
  // Bob (pa-2): Mon 08-11, Fri 10-13
  { paId: 'pa-2', dayOfWeek: 0, startMinute: 480, endMinute: 660 },
  { paId: 'pa-2', dayOfWeek: 4, startMinute: 600, endMinute: 780 },
  // Carol (pa-3): Wed 13-16, Fri 10-13
  { paId: 'pa-3', dayOfWeek: 2, startMinute: 780, endMinute: 960 },
  { paId: 'pa-3', dayOfWeek: 4, startMinute: 600, endMinute: 780 },
  // Dave (pa-4): Tue 09-10
  { paId: 'pa-4', dayOfWeek: 1, startMinute: 540, endMinute: 600 },
]

export async function getProposals() {
  await requireRole('ADMIN')

  const workshops = await prisma.workshop.findMany({
    include: { classSection: true },
  })
  const assignments = await prisma.assignment.findMany()
  const pas = await prisma.user.findMany({ where: { role: 'PA' } })

  return { workshops, assignments, pas }
}

export async function runScheduleAction() {
  await requireRole('ADMIN')

  // Load state from DB
  const cycle = await prisma.cycle.findFirst({ where: { status: 'OPEN' } })
  if (!cycle) throw new Error('No open cycle found.')

  const classMeetings = await prisma.classMeeting.findMany()
  const workshops = await prisma.workshop.findMany({ where: { cycleId: cycle.id } })
  const assignments = await prisma.assignment.findMany({
    where: { workshop: { cycleId: cycle.id } },
  })

  // We map the mock string PA IDs from seed ('pa-1') to actual DB IDs based on email
  // The seed users are pa1@workshopscheduler.local and pa2@workshopscheduler.local.
  // We can just use the fake availabilities with the real DB user IDs.
  // Actually, wait, fake availabilities use 'pa-1', 'pa-2'. In the database, the users have UUIDs.
  // To make the algorithm work with the fake availabilities, we need to map the fake 'pa-x' IDs
  // to the real PA UUIDs in the database.
  const pas = await prisma.user.findMany({ where: { role: 'PA' }, orderBy: { email: 'asc' } })

  // Mapping logic: pa1 -> pas[0], pa2 -> pas[1], etc.
  const paIdMap: Record<string, string> = {
    'pa-1': pas[0]?.id || 'fake-1',
    'pa-2': pas[1]?.id || 'fake-2',
    'pa-3': pas[2]?.id || 'fake-3',
    'pa-4': pas[3]?.id || 'fake-4',
  }

  const mappedAvailabilities = FAKE_AVAILABILITIES.map((av) => ({
    ...av,
    paId: paIdMap[av.paId] || av.paId,
  }))

  const result = runSchedule(
    cycle,
    classMeetings,
    workshops,
    assignments,
    mappedAvailabilities,
    () => crypto.randomUUID()
  )

  // Save the result back to DB in a transaction
  await prisma.$transaction(async (tx) => {
    // 1. Delete all PROPOSED assignments for this cycle
    await tx.assignment.deleteMany({
      where: {
        status: 'PROPOSED',
        workshop: { cycleId: cycle.id },
      },
    })

    // 2. Insert new PROPOSED assignments
    if (result.assignments.length > 0) {
      await tx.assignment.createMany({
        data: result.assignments.map((a) => ({
          id: a.id,
          workshopId: a.workshopId,
          paId: a.paId,
          status: a.status,
        })),
      })
    }

    // 3. Update Workshops
    for (const ws of result.workshops) {
      await tx.workshop.update({
        where: { id: ws.id },
        data: {
          status: ws.status,
          scheduledStart: ws.scheduledStart,
          scheduledEnd: ws.scheduledEnd,
        },
      })
    }
  })

  revalidatePath('/admin/schedule')
  return { success: true }
}

export async function confirmAllAction() {
  await requireRole('ADMIN')

  await prisma.$transaction(async (tx) => {
    // Update assignments
    await tx.assignment.updateMany({
      where: { status: 'PROPOSED' },
      data: { status: 'CONFIRMED' },
    })

    // Update workshops
    await tx.workshop.updateMany({
      where: { status: 'SCHEDULED' },
      data: { status: 'CONFIRMED' },
    })
  })

  revalidatePath('/admin/schedule')
  return { success: true }
}
