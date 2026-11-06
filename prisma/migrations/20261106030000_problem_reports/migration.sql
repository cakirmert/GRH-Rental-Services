CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "category" VARCHAR(8) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "publicConsentAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'QUEUED',
    "issueNumber" INTEGER,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProblemReport_category_check" CHECK ("category" IN ('problem', 'feedback')),
    CONSTRAINT "ProblemReport_status_check" CHECK ("status" IN ('QUEUED', 'SENDING', 'PUBLISHED', 'NEEDS_REVIEW'))
);
CREATE UNIQUE INDEX "ProblemReport_userId_requestId_key" ON "ProblemReport"("userId", "requestId");
CREATE INDEX "ProblemReport_status_nextAttemptAt_idx" ON "ProblemReport"("status", "nextAttemptAt");
CREATE INDEX "ProblemReport_expiresAt_idx" ON "ProblemReport"("expiresAt");
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
