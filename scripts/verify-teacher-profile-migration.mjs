import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { startDatabase, runNode } from './local-postgres.mjs'

// This verifier always creates a disposable local cluster, never a configured database.
const { pg, url } = await startDatabase('test')
const client = pg.getPgClient('workshop_test', '127.0.0.1')
const profileMigration = '20260927110636_one_schedule_per_teacher'
const transferMigration = '20260927111434_remove_teacher_transfers'
try {
  await client.connect()
  const migrations = (await readdir('prisma/migrations')).filter((name) => /^\d/.test(name)).sort()
  for (const migration of migrations.filter((name) => name < profileMigration)) {
    await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  }
  await runNode('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts'], {
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      VERCEL_ENV: '',
      SEED_RICH_DEMO: '',
      SEED_PREVIEW_DEMO_ACCOUNTS: '',
    },
  })
  const teachers = (
    await client.query(`SELECT id, "schoolId" FROM "User" WHERE role='TEACHER' ORDER BY id`)
  ).rows
  await client.query(
    `INSERT INTO "User" (id, email, name, role, "schoolId", "updatedAt") VALUES ('missing-profile', 'missing@example.test', 'Missing Profile', 'TEACHER', $1, NOW())`,
    [teachers[0].schoolId]
  )
  const profiles = (await client.query('SELECT * FROM "ClassSection" ORDER BY id')).rows
  const sql = await readFile(`prisma/migrations/${profileMigration}/migration.sql`, 'utf8')
  await client.query(
    `INSERT INTO "ClassSection" (id, name, "teacherId", "schoolId", "updatedAt") VALUES ('duplicate-profile', 'Duplicate', $1, $2, NOW())`,
    [teachers[0].id, teachers[0].schoolId]
  )
  await assert.rejects(client.query(sql), /Multiple legacy classes/)
  await client.query('ROLLBACK')
  assert.deepEqual(
    (await client.query(`SELECT * FROM "ClassSection" WHERE id <> 'duplicate-profile' ORDER BY id`))
      .rows,
    profiles
  )
  await client.query(`DELETE FROM "ClassSection" WHERE id='duplicate-profile'`)

  // A populated legacy transfer can be removed without deleting its session history.
  await client.query(
    `INSERT INTO "ClassTeacherTransfer" (id, "classSectionId", "fromTeacherId", "toTeacherId", "effectiveOn", "actorId") VALUES ('legacy-transfer', $1, $2, $3, '2026-01-01', 'historical-admin')`,
    [profiles[0].id, teachers[0].id, teachers[1].id]
  )
  // Some adapter tables have compound keys rather than an id.
  const before = {}
  for (const table of [
    'User',
    'School',
    'ClassSection',
    'ClassMeeting',
    'ClassWorkshop',
    'Workshop',
    'Assignment',
    'Availability',
    'AvailabilitySlot',
    'WorkshopEvent',
  ]) {
    before[table] = (
      await client.query(`SELECT to_jsonb(t) row FROM "${table}" t ORDER BY id`)
    ).rows.map(({ row }) => row)
  }
  await client.query(sql)
  await client.query(await readFile(`prisma/migrations/${transferMigration}/migration.sql`, 'utf8'))
  for (const [table, rows] of Object.entries(before)) {
    const after = (
      await client.query(`SELECT to_jsonb(t) row FROM "${table}" t ORDER BY id`)
    ).rows.map(({ row }) => row)
    if (table === 'ClassSection') {
      assert.equal(after.length, rows.length + 1)
      for (const old of rows) {
        const fresh = after.find((row) => row.id === old.id)
        assert.ok(fresh)
        assert.deepEqual({ ...fresh, name: old.name }, old)
      }
    } else if (table === 'Workshop') {
      assert.equal(after.length, rows.length)
      for (const old of rows) {
        const fresh = after.find((row) => row.id === old.id)
        assert.ok(fresh.hostClassName && fresh.hostTeacherName && fresh.hostSchoolName)
        assert.deepEqual(
          {
            ...fresh,
            hostClassName: old.hostClassName,
            hostTeacherName: old.hostTeacherName,
            hostSchoolName: old.hostSchoolName,
          },
          old
        )
      }
    } else assert.deepEqual(after, rows, table + ' changed')
  }
  assert.equal(
    (await client.query(`SELECT to_regclass('public."ClassTeacherTransfer"') AS name`)).rows[0]
      .name,
    null
  )
  await assert.rejects(
    client.query(
      `INSERT INTO "ClassSection" (id, name, "teacherId", "schoolId", "updatedAt") VALUES ('duplicate-after', 'Duplicate', $1, $2, NOW())`,
      [teachers[0].id, teachers[0].schoolId]
    ),
    /unique constraint/
  )
  console.log(
    'Teacher migration verified: populated history preserved, missing profile backfilled, ambiguous duplicates rolled back, uniqueness enforced, and transfer table removed.'
  )
} finally {
  await client.end()
  await pg.stop()
}
