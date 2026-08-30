-- Email is optional at registration; fingerprints are bound later.
ALTER TABLE "ws_user" ALTER COLUMN "email_hash" DROP NOT NULL;
ALTER TABLE "ws_user" ALTER COLUMN "email_pepper_version" DROP NOT NULL;
