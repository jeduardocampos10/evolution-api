-- The RuntimeConfig model was added after the migration history used by some
-- installations had already been stamped. Keep this repair idempotent so both
-- fresh databases and upgraded databases converge on the schema Prisma expects.
CREATE TABLE IF NOT EXISTS `RuntimeConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,

    UNIQUE INDEX `RuntimeConfig_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
