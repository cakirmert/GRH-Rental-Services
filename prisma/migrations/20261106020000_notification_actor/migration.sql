-- New copies of a person's messages/status actions must disappear with that account.
-- Older notifications have no reliable actor identifier and remain nullable.
ALTER TABLE "Notification" ADD COLUMN "actorId" TEXT;
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
