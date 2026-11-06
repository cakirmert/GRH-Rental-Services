CREATE TABLE "RecurringBlock" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdById" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "frequency" VARCHAR(8) NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Berlin',
    "until" TIMESTAMP(3),
    "stoppedFrom" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecurringBlock_dates_check" CHECK ("endDate" > "startDate"),
    CONSTRAINT "RecurringBlock_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "RecurringBlock_frequency_check" CHECK ("frequency" IN ('NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY')),
    CONSTRAINT "RecurringBlock_timezone_check" CHECK ("timeZone" = 'Europe/Berlin')
);

CREATE TABLE "RecurringBlockException" (
    "blockId" TEXT NOT NULL,
    "occurrenceStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringBlockException_pkey" PRIMARY KEY ("blockId", "occurrenceStart")
);

CREATE INDEX "RecurringBlock_itemId_startDate_idx" ON "RecurringBlock"("itemId", "startDate");
ALTER TABLE "RecurringBlock" ADD CONSTRAINT "RecurringBlock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringBlock" ADD CONSTRAINT "RecurringBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringBlockException" ADD CONSTRAINT "RecurringBlockException_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "RecurringBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
