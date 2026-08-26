/**
 * Workshop Scheduler — seed
 *
 * Creates a minimal dataset so the team can sign in as each role on a fresh DB:
 *   - 1 admin
 *   - 2 schools (Lower Mainland)
 *   - 2 teachers (one per school)
 *   - 2 PAs
 *
 * Magic-link login works against any of these emails. In dev (no AUTH_RESEND_KEY)
 * the link is printed to the server console.
 *
 * Run: npm run db:seed
 */

import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

const SCHOOLS = [
  { name: 'Lord Byng Secondary', district: 'Vancouver' },
  { name: 'Burnaby Central Secondary', district: 'Burnaby' },
]

const ADMINS = [{ email: 'admin@workshopscheduler.local', name: 'Aria Admin' }]
const PAS = [
  { email: 'pa1@workshopscheduler.local', name: 'Priya Patel' },
  { email: 'pa2@workshopscheduler.local', name: 'Pat Chen' },
]
// Teachers: one per school, paired by index.
const TEACHERS = [
  { email: 'teacher1@workshopscheduler.local', name: 'Tomas Singh' },
  { email: 'teacher2@workshopscheduler.local', name: 'Tara Nguyen' },
]

function slugId(prefix: string, name: string): string {
  return `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

async function main() {
  console.log('Seeding…')

  const schools = await Promise.all(
    SCHOOLS.map((s) =>
      prisma.school.upsert({
        where: { id: slugId('seed', s.name) },
        update: { name: s.name, district: s.district },
        create: {
          id: slugId('seed', s.name),
          name: s.name,
          district: s.district,
        },
      }),
    ),
  )

  const adminUsers = await Promise.all(
    ADMINS.map((a) =>
      prisma.user.upsert({
        where: { email: a.email },
        update: { role: Role.ADMIN, name: a.name },
        create: { email: a.email, name: a.name, role: Role.ADMIN },
      }),
    ),
  )

  const paUsers = await Promise.all(
    PAS.map((p) =>
      prisma.user.upsert({
        where: { email: p.email },
        update: { role: Role.PA, name: p.name },
        create: { email: p.email, name: p.name, role: Role.PA },
      }),
    ),
  )

  const teacherUsers = await Promise.all(
    TEACHERS.map((t, i) =>
      prisma.user.upsert({
        where: { email: t.email },
        update: {
          role: Role.TEACHER,
          name: t.name,
          schoolId: schools[i % schools.length].id,
        },
        create: {
          email: t.email,
          name: t.name,
          role: Role.TEACHER,
          schoolId: schools[i % schools.length].id,
        },
      }),
    ),
  )

  // --- Scheduling domain ---
  // One cycle, one class per teacher (with a weekly meeting time), and an
  // unscheduled workshop per class — the realistic starting state the matching
  // algorithm fills in, together with the PA availability seeded below.

  const cycle = await prisma.cycle.upsert({
    where: { id: 'seed-cycle-spring-2026' },
    update: {},
    create: {
      id: 'seed-cycle-spring-2026',
      name: 'Spring 2026',
      // Stored UTC; the cycle bounds the recurring weekly meeting slots.
      startDate: new Date('2026-01-05T00:00:00Z'),
      endDate: new Date('2026-04-03T00:00:00Z'),
      status: 'OPEN',
    },
  })

  // dayOfWeek 0=Mon…4=Fri; start/endMinute are LOCAL wall-clock minutes.
  const CLASSES = [
    { name: 'Block A Biology 11', subject: 'Biology', grade: '11', dayOfWeek: 1, startMinute: 600, endMinute: 660 }, // Tue 10:00–11:00
    { name: 'Block C Math 10', subject: 'Math', grade: '10', dayOfWeek: 2, startMinute: 780, endMinute: 870 }, // Wed 13:00–14:30
  ]

  for (let i = 0; i < teacherUsers.length; i++) {
    const teacher = teacherUsers[i]
    const def = CLASSES[i % CLASSES.length]
    const classId = slugId('seed-class', `${teacher.name ?? teacher.id}-${def.name}`)

    await prisma.classSection.upsert({
      where: { id: classId },
      update: {},
      create: {
        id: classId,
        name: def.name,
        subject: def.subject,
        grade: def.grade,
        teacherId: teacher.id,
        schoolId: schools[i % schools.length].id,
        meetings: {
          create: {
            id: slugId('seed-meeting', classId),
            dayOfWeek: def.dayOfWeek,
            startMinute: def.startMinute,
            endMinute: def.endMinute,
          },
        },
      },
    })

    await prisma.workshop.upsert({
      where: { id: slugId('seed-workshop', classId) },
      update: {},
      create: {
        id: slugId('seed-workshop', classId),
        cycleId: cycle.id,
        classSectionId: classId,
        status: 'UNSCHEDULED', // scheduledStart/End + assignments filled by the algorithm
      },
    })
  }

  // PA availability — one row per ticked 30-minute slot (see the Availability
  // model). Priya covers both class times; Pat only the Tuesday one, so a
  // scheduler run produces a two-PA workshop and a one-PA workshop.
  const SLOT_MINUTES = 30
  const ticks = (dayOfWeek: number, startMin: number, endMin: number) =>
    Array.from({ length: (endMin - startMin) / SLOT_MINUTES }, (_, i) => ({
      dayOfWeek,
      startMin: startMin + i * SLOT_MINUTES,
    }))

  const PA_AVAILABILITY = [
    [...ticks(1, 570, 690), ...ticks(2, 780, 900)], // Priya: Tue 9:30–11:30, Wed 13:00–15:00
    ticks(1, 570, 690), // Pat: Tue 9:30–11:30
  ]

  await Promise.all(
    paUsers.map((pa, i) =>
      prisma.availability.createMany({
        data: (PA_AVAILABILITY[i] ?? []).map((slot) => ({ userId: pa.id, ...slot })),
        skipDuplicates: true,
      }),
    ),
  )

  console.log('\nSeed complete. Sign in with any of these:\n')
  const rows = [
    ...adminUsers.map((u) => ({ role: 'ADMIN', email: u.email, name: u.name })),
    ...teacherUsers.map((u) => ({ role: 'TEACHER', email: u.email, name: u.name })),
    ...paUsers.map((u) => ({ role: 'PA', email: u.email, name: u.name })),
  ]
  console.table(rows)
  console.log('\nNo AUTH_RESEND_KEY set? The magic-link URL will print to this terminal')
  console.log('when you submit the login form. Click it to sign in.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
