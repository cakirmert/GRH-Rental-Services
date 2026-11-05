-- Additive feedback storage; existing application and authentication rows are untouched.
CREATE TABLE "ReleaseFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "releaseId" VARCHAR(64) NOT NULL,
    "interfaceMode" VARCHAR(7) NOT NULL,
    "sentiment" VARCHAR(7) NOT NULL,
    "message" VARCHAR(2000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReleaseFeedback_interfaceMode_check" CHECK ("interfaceMode" IN ('classic', 'preview')),
    CONSTRAINT "ReleaseFeedback_sentiment_check" CHECK ("sentiment" IN ('good', 'mixed', 'problem'))
);

CREATE UNIQUE INDEX "ReleaseFeedback_userId_releaseId_key" ON "ReleaseFeedback"("userId", "releaseId");
CREATE INDEX "ReleaseFeedback_releaseId_updatedAt_idx" ON "ReleaseFeedback"("releaseId", "updatedAt");

-- Preserve aggregate feedback when an account is deleted, without retaining its user link.
ALTER TABLE "ReleaseFeedback" ADD CONSTRAINT "ReleaseFeedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
