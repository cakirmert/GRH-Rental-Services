-- Additive only: all existing passkey JSON and application rows remain intact.
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "staffNotes" TEXT;

-- CreateTable
CREATE TABLE "AuthState" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legacyCredentialId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasskeyCredentialAlias" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,

    CONSTRAINT "PasskeyCredentialAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthState_expiresAt_idx" ON "AuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "PasskeyCredential_userId_revokedAt_idx" ON "PasskeyCredential"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyCredential_userId_legacyCredentialId_key" ON "PasskeyCredential"("userId", "legacyCredentialId");

-- CreateIndex
CREATE INDEX "PasskeyCredentialAlias_credentialId_idx" ON "PasskeyCredentialAlias"("credentialId");

-- AddForeignKey
ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasskeyCredentialAlias" ADD CONSTRAINT "PasskeyCredentialAlias_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "PasskeyCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
