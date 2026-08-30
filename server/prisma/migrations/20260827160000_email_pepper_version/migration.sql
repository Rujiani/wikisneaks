-- Existing rows were hashed with the original single pepper (now version 1).
ALTER TABLE "ws_user" ADD COLUMN "email_pepper_version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "ws_user_email_pepper_version_idx" ON "ws_user"("email_pepper_version");
