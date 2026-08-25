-- AlterTable
ALTER TABLE "ws_user" ADD COLUMN "email" VARCHAR(254) NOT NULL;
ALTER TABLE "ws_user" RENAME COLUMN "passwordHash" TO "password_hash";

-- CreateIndex
CREATE UNIQUE INDEX "ws_user_email_key" ON "ws_user"("email");
