import { PrismaClient, Role } from '@prisma/client'
import { shiftMonth, vancouverMonthKey, vancouverToUtc } from '../src/lib/time'
import { getPreviewDemoConfig } from '../src/lib/preview-demo-auth'

const prisma = new PrismaClient()

const SCHOOLS = [{ name: 'Lord Byng Secondary' }, { name: 'Burnaby Central Secondary' }]

const ADMINS = [{ email: 'admin@workshopscheduler.local', name: 'Aria Admin' }]
const PAS = [
  { email: 'pa1@workshopscheduler.local', name: 'Priya Patel' },
  { email: 'pa2@workshopscheduler.local', name: 'Pat Chen' },
]
const TEACHERS = [
  { email: 'teacher1@workshopscheduler.local', name: 'Tomas Singh' },
  { email: 'teacher2@workshopscheduler.local', name: 'Tara Nguyen' },
]

const CLASSES = [
  {
    name: 'Block A Biology 11',
    subject: 'Biology',
    grade: '11',
    dayOfWeek: 1,
    startMinute: 600,
    endMinute: 660,
  },
  {
    name: 'Block C Math 10',
    subject: 'Math',
    grade: '10',
    dayOfWeek: 2,
    startMinute: 780,
    endMinute: 870,
  },
]

function slugId(prefix: string, name: string): string {
  return `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function ticks(dayOfWeek: number, startMin: number, endMin: number) {
  return Array.from({ length: (endMin - startMin) / 15 }, (_, index) => ({
    dayOfWeek,
    startMin: startMin + index * 15,
  }))
}

async function main() {
  const seedPreviewDemoAccounts = process.env.SEED_PREVIEW_DEMO_ACCOUNTS === 'true'
  const previewDemo = seedPreviewDemoAccounts ? getPreviewDemoConfig() : null
  if (seedPreviewDemoAccounts && !previewDemo) {
    throw new Error(
      'Refusing to seed preview demo accounts because the preview demo environment guard is incomplete or mismatched.'
    )
  }
  if (process.env.SEED_RICH_DEMO === 'true') {
    const target = new URL(process.env.DATABASE_URL ?? '')
    const isolatedLocal =
      target.hostname === '127.0.0.1' &&
      target.pathname === '/workshop_test' &&
      process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
    if (!previewDemo && !isolatedLocal)
      throw new Error(
        'Rich demo reset requires the guarded test preview or an isolated test database.'
      )
    const { seedRichDemo } = await import('./demo')
    await seedRichDemo(
      prisma,
      previewDemo ?? {
        adminEmail: ADMINS[0].email,
        teacherEmail: TEACHERS[0].email,
        paEmail: PAS[0].email,
      }
    )
    return
  }

  if (previewDemo) {
    const secondarySeedEmails = new Set([
      ...PAS.slice(1).map((account) => account.email),
      ...TEACHERS.slice(1).map((account) => account.email),
    ])
    for (const email of [previewDemo.adminEmail, previewDemo.teacherEmail, previewDemo.paEmail]) {
      if (secondarySeedEmails.has(email)) {
        throw new Error('A configured preview demo email collides with a secondary seed account.')
      }
    }
  }

  const admins = previewDemo ? [{ email: previewDemo.adminEmail, name: 'Demo admin' }] : ADMINS
  const pas = previewDemo ? [{ email: previewDemo.paEmail, name: 'Demo PA' }, ...PAS.slice(1)] : PAS
  const teachers = previewDemo
    ? [{ email: previewDemo.teacherEmail, name: 'Demo teacher' }, ...TEACHERS.slice(1)]
    : TEACHERS

  await prisma.schedulingSettings.upsert({
    where: { id: 1 },
    create: { id: 1, minimumGapDays: 7 },
    update: { minimumGapDays: 7 },
  })
  console.log('Seeding core demo data…')
  const workshopDefinitions = await Promise.all(
    [1, 2, 3, 4].map((number) =>
      prisma.workshopDefinition.upsert({
        where: { id: `seed-definition-${number}` },
        create: {
          id: `seed-definition-${number}`,
          number,
          title: `Workshop ${number}`,
          durationMinutes: 60,
        },
        update: {},
      })
    )
  )

  const schools = await Promise.all(
    SCHOOLS.map((school) =>
      prisma.school.upsert({
        where: { id: slugId('seed', school.name) },
        update: { ...school, deletedAt: null },
        create: { id: slugId('seed', school.name), ...school },
      })
    )
  )

  const seededAdmins = await Promise.all(
    admins.map((admin) =>
      prisma.user.upsert({
        where: { email: admin.email },
        update: { name: admin.name, role: Role.ADMIN, deletedAt: null },
        create: { ...admin, role: Role.ADMIN },
      })
    )
  )

  const seededPAs = await Promise.all(
    pas.map((pa) =>
      prisma.user.upsert({
        where: { email: pa.email },
        update: { name: pa.name, role: Role.PA, schoolId: null, deletedAt: null },
        create: { ...pa, role: Role.PA },
      })
    )
  )

  const seededTeachers = await Promise.all(
    teachers.map((teacher, index) =>
      prisma.user.upsert({
        where: { email: teacher.email },
        update: {
          name: teacher.name,
          role: Role.TEACHER,
          schoolId: schools[index % schools.length].id,
          deletedAt: null,
        },
        create: {
          ...teacher,
          role: Role.TEACHER,
          schoolId: schools[index % schools.length].id,
        },
      })
    )
  )

  for (let index = 0; index < seededTeachers.length; index++) {
    const teacher = seededTeachers[index]
    const definition = CLASSES[index % CLASSES.length]
    const classId = slugId('seed-class', `${teacher.email}-${definition.name}`)
    const meetingId = slugId('seed-meeting', classId)

    await prisma.classSection.upsert({
      where: { id: classId },
      update: {
        name: teacher.name ?? teacher.email,
        subject: definition.subject,
        grade: definition.grade,
        teacherId: teacher.id,
        schoolId: schools[index % schools.length].id,
      },
      create: {
        id: classId,
        name: teacher.name ?? teacher.email,
        subject: definition.subject,
        grade: definition.grade,
        teacherId: teacher.id,
        schoolId: schools[index % schools.length].id,
      },
    })

    await prisma.classMeeting.upsert({
      where: { id: meetingId },
      update: {
        classSectionId: classId,
        dayOfWeek: definition.dayOfWeek,
        startMinute: definition.startMinute,
        endMinute: definition.endMinute,
      },
      create: {
        id: meetingId,
        classSectionId: classId,
        dayOfWeek: definition.dayOfWeek,
        startMinute: definition.startMinute,
        endMinute: definition.endMinute,
      },
    })

    const month = shiftMonth(vancouverMonthKey(), 1)
    const date = new Date(`${month}-01T12:00:00Z`)
    while (date.getUTCDay() !== definition.dayOfWeek + 1) date.setUTCDate(date.getUTCDate() + 1)
    const dateKey = date.toISOString().slice(0, 10)
    const workshopSessionId = slugId('seed-workshop', classId)
    const published = previewDemo ? index === 0 : index !== 0
    const workshopData = {
      classWorkshopId: `seed-class-workshop-${classId}-1`,
      scheduledStart: vancouverToUtc(dateKey, definition.startMinute),
      scheduledEnd: vancouverToUtc(dateKey, definition.endMinute),
      minPAs: 1,
      maxPAs: 3,
      status: published ? ('PUBLISHED' as const) : ('DRAFT' as const),
      publishedAt: published ? new Date() : null,
    }
    for (const workshopDefinition of workshopDefinitions) {
      const cw = await prisma.classWorkshop.upsert({
        where: {
          classSectionId_workshopDefinitionId: {
            classSectionId: classId,
            workshopDefinitionId: workshopDefinition.id,
          },
        },
        create: {
          id: `seed-class-workshop-${classId}-${workshopDefinition.number}`,
          classSectionId: classId,
          workshopDefinitionId: workshopDefinition.id,
        },
        update: {},
      })
      if (workshopDefinition.number === 1) {
        workshopData.classWorkshopId = cw.id
        await prisma.availabilitySlot.upsert({
          where: { id: `seed-candidate-${cw.id}` },
          create: {
            id: `seed-candidate-${cw.id}`,
            classWorkshopId: cw.id,
            start: workshopData.scheduledStart,
            end: workshopData.scheduledEnd,
          },
          update: { start: workshopData.scheduledStart, end: workshopData.scheduledEnd },
        })
      }
      if (workshopDefinition.number === 2)
        for (const offset of [7, 14]) {
          const candidate = new Date(date)
          candidate.setUTCDate(candidate.getUTCDate() + offset)
          const candidateDate = candidate.toISOString().slice(0, 10)
          const data = {
            classWorkshopId: cw.id,
            start: vancouverToUtc(candidateDate, definition.startMinute),
            end: vancouverToUtc(candidateDate, definition.endMinute),
          }
          await prisma.availabilitySlot.upsert({
            where: { id: `seed-candidate-${cw.id}-${offset}` },
            create: { id: `seed-candidate-${cw.id}-${offset}`, ...data },
            update: data,
          })
        }
    }
    await prisma.workshopSession.upsert({
      where: { id: workshopSessionId },
      update: workshopData,
      create: { id: workshopSessionId, ...workshopData },
    })
    await prisma.assignment.deleteMany({ where: { workshopSessionId } })
    if (published)
      await prisma.assignment.create({
        data: { workshopSessionId, paId: seededPAs[0].id, status: 'PUBLISHED' },
      })
  }

  const availability = [[...ticks(1, 570, 690), ...ticks(2, 780, 900)], ticks(1, 570, 690)]

  for (let index = 0; index < seededPAs.length; index++) {
    const month = shiftMonth(vancouverMonthKey(), 1)
    await prisma.monthlyPAQuota.upsert({
      where: { paId_month: { paId: seededPAs[index].id, month } },
      create: { paId: seededPAs[index].id, month, quota: 4 },
      update: { quota: 4 },
    })
    await prisma.$transaction([
      prisma.availability.deleteMany({ where: { userId: seededPAs[index].id } }),
      prisma.availability.createMany({
        data: availability[index].map((slot) => ({ userId: seededPAs[index].id, ...slot })),
      }),
    ])
  }

  console.log('\nSeed complete. Use one of these invited accounts:\n')
  console.table([
    ...seededAdmins.map((user) => ({ role: 'ADMIN', email: user.email, name: user.name })),
    ...seededTeachers.map((user) => ({ role: 'TEACHER', email: user.email, name: user.name })),
    ...seededPAs.map((user) => ({ role: 'PA', email: user.email, name: user.name })),
  ])
  if (previewDemo) {
    console.log('\nGuarded preview demo accounts seeded.\n')
  } else {
    console.log('\nWithout AUTH_RESEND_KEY, magic links print in the dev server terminal.\n')
  }
  console.log(
    `Example draft and published workshops: /admin/workshops?month=${shiftMonth(vancouverMonthKey(), 1)}`
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
