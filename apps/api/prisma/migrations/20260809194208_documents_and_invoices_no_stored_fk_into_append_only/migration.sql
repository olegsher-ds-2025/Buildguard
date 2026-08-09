/*
  Warnings:

  - You are about to drop the column `current_version_id` on the `documents` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_current_version_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_supersedes_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoice_id_fkey";

-- DropIndex
DROP INDEX "documents_current_version_id_key";

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "current_version_id";
