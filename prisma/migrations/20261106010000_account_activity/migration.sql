BEGIN;
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
-- Preserve the known activity history, rather than making every old account
-- appear newly active on deployment day.
UPDATE "User" SET "lastActiveAt" = "lastLoginAt";
ALTER TABLE "User" ALTER COLUMN "lastActiveAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "lastActiveAt" SET NOT NULL;
CREATE INDEX "User_lastActiveAt_lastLoginAt_idx" ON "User"("lastActiveAt", "lastLoginAt");
COMMIT;
