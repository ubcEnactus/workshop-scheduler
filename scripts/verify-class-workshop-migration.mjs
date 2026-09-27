import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { startDatabase } from './local-postgres.mjs'

// Always allocate a fresh cluster. Never read or mutate a configured DATABASE_URL.
const { pg } = await startDatabase('test')
const client = pg.getPgClient('workshop_test', '127.0.0.1')
const target = '20260917101613_class_workshop_sessions'
try {
  await client.connect()
  const migrations = (await readdir('prisma/migrations')).filter((n) => /^\d/.test(n)).sort()
  for (const migration of migrations.filter((n) => n < target))
    await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  await client.query(`
    INSERT INTO "School" ("id","name","district","updatedAt") VALUES ('school','Preserved school','Vancouver',now());
    INSERT INTO "User" ("id","email","role","schoolId","updatedAt") VALUES ('teacher','teacher@test.local','TEACHER','school',now()),('pa','pa@test.local','PA',NULL,now());
    INSERT INTO "ClassSection" ("id","name","teacherId","schoolId","updatedAt") VALUES ('class','Preserved class','teacher','school',now());
    INSERT INTO "WorkshopBatch" ("id","requestKey","actorId","month","payloadHash") VALUES ('batch','key','admin','2027-01','hash');
    INSERT INTO "Workshop" ("id","classSectionId","batchId","scheduledStart","scheduledEnd","status","version","locked","hostingConfirmed","publishedAt","updatedAt")
      SELECT 'old-' || status, 'class','batch','2027-01-04 18:00'::timestamp,'2027-01-04 19:00'::timestamp,status::"WorkshopStatus",3,true,true,
        CASE WHEN status = 'DRAFT' THEN NULL ELSE '2026-12-01'::timestamp END,now()
      FROM unnest(ARRAY['DRAFT','PUBLISHED','COMPLETED','CANCELLED']) status;
    INSERT INTO "Assignment" ("id","workshopId","paId","status","source") SELECT 'a-' || "id","id",'pa','PUBLISHED','MANUAL' FROM "Workshop";
    INSERT INTO "WorkshopEvent" ("id","workshopId","actorId","actorName","kind","reason","before","after","wasPublished","affectedPAIds")
      VALUES ('event','old-PUBLISHED','admin','Admin','PUBLISH','Preserve history','{}','{}',true,ARRAY['pa']);
    INSERT INTO "WorkshopChange" ("id","workshopId","actorId","payload","before","proposed") VALUES ('change','old-PUBLISHED','admin','{}','{}','{}');
  `)
  const schools = (await client.query('SELECT * FROM "School" ORDER BY "id"')).rows
  const originals = (await client.query('SELECT * FROM "Workshop" ORDER BY "id"')).rows
  const assignments = (await client.query('SELECT * FROM "Assignment" ORDER BY "id"')).rows
  const events = (await client.query('SELECT * FROM "WorkshopEvent"')).rows
  const changes = (await client.query('SELECT * FROM "WorkshopChange"')).rows
  await client.query(await readFile(`prisma/migrations/${target}/migration.sql`, 'utf8'))
  const migrated = (await client.query('SELECT * FROM "Workshop" ORDER BY "id"')).rows
  assert.equal(migrated.length, originals.length)
  for (let index = 0; index < originals.length; index++) {
    const { classSectionId, ...original } = originals[index]
    const { classWorkshopId, mode, location, notes, ...session } = migrated[index]
    assert.deepEqual(session, original)
    assert.equal(mode, 'IN_PERSON')
    assert.equal(location, null)
    assert.equal(notes, null)
    const cw = (
      await client.query('SELECT * FROM "ClassWorkshop" WHERE "id"=$1', [classWorkshopId])
    ).rows[0]
    assert.equal(cw.classSectionId, classSectionId)
    assert.equal(
      cw.status,
      ['DRAFT', 'PUBLISHED'].includes(original.status) ? 'SCHEDULED' : original.status
    )
    const definition = (
      await client.query('SELECT * FROM "WorkshopDefinition" WHERE "id"=$1', [
        cw.workshopDefinitionId,
      ])
    ).rows[0]
    assert.equal(definition.number, null)
    assert.match(definition.description, /did not identify/)
    const slot = (
      await client.query('SELECT * FROM "AvailabilitySlot" WHERE "classWorkshopId"=$1', [cw.id])
    ).rows[0]
    assert.deepEqual(slot.start, original.scheduledStart)
    assert.deepEqual(slot.end, original.scheduledEnd)
  }
  assert.deepEqual(
    (await client.query('SELECT * FROM "Assignment" ORDER BY "id"')).rows,
    assignments
  )
  assert.deepEqual((await client.query('SELECT * FROM "WorkshopEvent"')).rows, events)
  assert.deepEqual((await client.query('SELECT * FROM "WorkshopChange"')).rows, changes)
  const candidates = (await client.query('SELECT * FROM "AvailabilitySlot" ORDER BY "id"')).rows
  const definitions = (await client.query('SELECT * FROM "WorkshopDefinition" ORDER BY "id"')).rows
  const calendarMigration = '20260920080340_class_calendar_delivery_windows'
  await client.query(await readFile(`prisma/migrations/${calendarMigration}/migration.sql`, 'utf8'))
  assert.deepEqual((await client.query('SELECT * FROM "Workshop" ORDER BY "id"')).rows, migrated)
  assert.deepEqual(
    (await client.query('SELECT * FROM "Assignment" ORDER BY "id"')).rows,
    assignments
  )
  assert.deepEqual((await client.query('SELECT * FROM "WorkshopEvent"')).rows, events)
  assert.deepEqual((await client.query('SELECT * FROM "WorkshopChange"')).rows, changes)
  const newCandidates = (await client.query('SELECT * FROM "AvailabilitySlot" ORDER BY "id"')).rows
  assert.deepEqual(
    newCandidates.map(({ classSectionId, ...slot }) => {
      assert.equal(classSectionId, null)
      return slot
    }),
    candidates
  )
  const newDefinitions = (await client.query('SELECT * FROM "WorkshopDefinition" ORDER BY "id"'))
    .rows
  assert.deepEqual(
    newDefinitions.map(({ deliveryStartsOn, deliveryEndsOn, ...definition }) => {
      assert.equal(deliveryStartsOn, null)
      assert.equal(deliveryEndsOn, null)
      return definition
    }),
    definitions
  )
  console.log(
    'Class calendar migration verified: legacy candidates retain their original scope and every session, assignment and history row is unchanged.'
  )
  await client.query(`
    INSERT INTO "Availability" ("id","userId","dayOfWeek","startMin","updatedAt") VALUES ('legacy-slot','pa',0,600,now()),('legacy-last-slot','pa',4,1410,now());
    INSERT INTO "ClassMeeting" ("id","classSectionId","dayOfWeek","startMinute","endMinute") VALUES ('legacy-reference','class',0,540,720);
  `)
  const beforeRun = (await client.query('SELECT * FROM "Workshop" ORDER BY "id"')).rows
  for (const migration of migrations.filter((name) => name > calendarMigration))
    await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  assert.deepEqual(
    (await client.query('SELECT * FROM "School" ORDER BY "id"')).rows,
    schools.map((school) =>
      Object.fromEntries(Object.entries(school).filter(([key]) => key !== 'district'))
    )
  )
  const afterRun = (await client.query('SELECT * FROM "Workshop" ORDER BY "id"')).rows
  for (let index = 0; index < beforeRun.length; index++) {
    for (const [key, value] of Object.entries(beforeRun[index]))
      assert.deepEqual(afterRun[index][key], value)
    assert.equal(afterRun[index].hostClassName, 'Preserved class')
    assert.equal(afterRun[index].hostSchoolName, 'Preserved school')
    assert.equal(afterRun[index].hostTeacherName, 'teacher@test.local')
    assert.equal(afterRun[index].dateExceptionReason, null)
  }
  const quarterHours = (
    await client.query(
      'SELECT "id","dayOfWeek","startMin" FROM "Availability" ORDER BY "dayOfWeek","startMin"'
    )
  ).rows
  assert.deepEqual(
    quarterHours.map((slot) => [slot.dayOfWeek, slot.startMin]),
    [
      [0, 600],
      [0, 615],
      [4, 1410],
      [4, 1425],
    ]
  )
  assert.equal(quarterHours[0].id, 'legacy-slot')
  assert.equal(quarterHours[2].id, 'legacy-last-slot')
  assert.equal(
    (
      await client.query(
        'SELECT "activeForScheduling" FROM "ClassMeeting" WHERE "id"=\'legacy-reference\''
      )
    ).rows[0].activeForScheduling,
    false
  )
  assert.equal(
    (
      await client.query(
        'SELECT count(*)::int AS n FROM "WorkshopDefinition" WHERE "identityStatus"=\'NEEDS_IDENTIFICATION\''
      )
    ).rows[0].n,
    definitions.length
  )
  for (const [table, original] of [
    ['Assignment', assignments],
    ['WorkshopEvent', events],
    ['WorkshopChange', changes],
  ]) {
    const rows = (await client.query(`SELECT * FROM "${table}" ORDER BY "id"`)).rows
    assert.equal(rows.length, original.length)
    for (const old of original)
      for (const [key, value] of Object.entries(old))
        assert.deepEqual(rows.find((row) => row.id === old.id)[key], value)
  }
  await assert.rejects(
    client.query('UPDATE "Assignment" SET "overrideSameDay"=true WHERE "id"=\'a-old-PUBLISHED\''),
    /Assignment_override_reason/
  )
  console.log(
    'Run-planning migration verified: 15-minute coverage, original IDs/history, inactive legacy recurrence, host snapshots and override checks preserved.'
  )
  console.log(
    'Populated migration verified: all four lifecycles, IDs, dates, assignments, batches, locks, publication metadata, and history preserved.'
  )
} finally {
  await client.end()
  await pg.stop()
}
