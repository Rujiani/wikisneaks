-- CreateEnum
CREATE TYPE "ws_role" AS ENUM ('USER', 'ADMIN', 'MODERATOR');

-- CreateTable
CREATE TABLE "ws_user" (
    "id" SERIAL NOT NULL,
    "login" VARCHAR(64) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "extra_info" VARCHAR(1000),
    "role" "ws_role" NOT NULL DEFAULT 'USER',
    "last_ip" INET,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ws_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ws_user_login_key" ON "ws_user"("login");
