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
  console.log(
    'Populated migration verified: all four lifecycles, IDs, dates, assignments, batches, locks, publication metadata, and history preserved.'
  )
} finally {
  await client.end()
  await pg.stop()
}
