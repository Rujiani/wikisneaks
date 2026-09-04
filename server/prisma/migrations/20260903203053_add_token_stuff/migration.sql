-- AlterTable
ALTER TABLE "ws_user" ALTER COLUMN "email_hash" SET DATA TYPE CHAR(64),
ALTER COLUMN "email_pepper_version" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ws_refresh_token" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "jti" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ws_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ws_refresh_token_jti_key" ON "ws_refresh_token"("jti");

-- CreateIndex
CREATE INDEX "ws_refresh_token_user_id_idx" ON "ws_refresh_token"("user_id");

-- AddForeignKey
ALTER TABLE "ws_refresh_token" ADD CONSTRAINT "ws_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ws_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
