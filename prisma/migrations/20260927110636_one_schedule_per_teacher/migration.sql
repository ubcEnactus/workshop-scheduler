BEGIN;

-- Never guess which legacy group or handover should own a teacher's schedule.
-- Abort atomically on ambiguous data; the release preflight checks this too.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "ClassSection" GROUP BY "teacherId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Multiple legacy classes belong to one teacher. Review and consolidate their schedules before this migration; no data has been changed.';
  END IF;
END $$;

-- Preserve historical host labels before the profile adopts the teacher's name.
-- Updating display snapshots must not rewrite enrollment lifecycle timestamps.
ALTER TABLE "Workshop" DISABLE TRIGGER session_class_workshop_status;
UPDATE "Workshop" w SET
  "hostClassName" = COALESCE(w."hostClassName", c.name),
  "hostTeacherName" = COALESCE(w."hostTeacherName", u.name, u.email),
  "hostSchoolName" = COALESCE(w."hostSchoolName", s.name)
FROM "ClassWorkshop" cw
JOIN "ClassSection" c ON c.id = cw."classSectionId"
JOIN "User" u ON u.id = c."teacherId"
JOIN "School" s ON s.id = c."schoolId"
WHERE w."classWorkshopId" = cw.id;
ALTER TABLE "Workshop" ENABLE TRIGGER session_class_workshop_status;

UPDATE "ClassSection" c SET name = COALESCE(u.name, u.email)
FROM "User" u WHERE u.id = c."teacherId";

-- Existing teacher contacts become schedulable without another setup step.
INSERT INTO "ClassSection" (id, name, "teacherId", "schoolId", "updatedAt")
SELECT 'teacher-profile-' || u.id, COALESCE(u.name, u.email), u.id, u."schoolId", CURRENT_TIMESTAMP
FROM "User" u JOIN "School" s ON s.id = u."schoolId"
WHERE u.role = 'TEACHER' AND u."deletedAt" IS NULL AND s."deletedAt" IS NULL
AND NOT EXISTS (SELECT 1 FROM "ClassSection" c WHERE c."teacherId" = u.id);

CREATE UNIQUE INDEX "ClassSection_teacherId_key" ON "ClassSection"("teacherId");
COMMIT;
