-- Existing plaintext emails cannot be recovered as hashes without the pepper.
-- Drop rows so the renamed column never holds plaintext values.
DELETE FROM "ws_user";

ALTER TABLE "ws_user" RENAME COLUMN "email" TO "email_hash";

ALTER TABLE "ws_user" ALTER COLUMN "email_hash" SET DATA TYPE VARCHAR(64);

ALTER INDEX "ws_user_email_key" RENAME TO "ws_user_email_hash_key";
