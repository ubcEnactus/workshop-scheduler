-- Manual selection after visible workload warnings is sufficient authorization.
-- Preserve the exception flags and all historical reasons, but stop requiring
-- a separate reason for new same-day or same-week manual assignments.
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_override_reason";
