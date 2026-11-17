-- The RuntimeConfig model was added after the migration history used by some
-- installations had already been stamped. Keep this repair idempotent so both
-- fresh databases and upgraded databases converge on the schema Prisma expects.
CREATE TABLE IF NOT EXISTS "RuntimeConfig" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "RuntimeConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RuntimeConfig_key_key" ON "RuntimeConfig"("key");
