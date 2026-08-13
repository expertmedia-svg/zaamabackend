-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "GroupJoinMode" AS ENUM ('OPEN', 'APPROVAL', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('DRAFT', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OUT_OF_STOCK', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PREPARING', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('USER_WALLET', 'PROVIDER_CLEARING', 'PLATFORM_REVENUE');

-- CreateEnum
CREATE TYPE "WalletOperationType" AS ENUM ('TOP_UP', 'TRANSFER', 'MARKETPLACE_PAYMENT', 'REFUND', 'WITHDRAWAL', 'FEE');

-- CreateEnum
CREATE TYPE "WalletOperationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('SANDBOX', 'ORANGE_MONEY', 'MOOV_MONEY');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "joinMode" "GroupJoinMode" NOT NULL DEFAULT 'INVITE_ONLY',
ADD COLUMN     "membersCanPost" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slowModeSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visibility" "GroupVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "group_topics" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(240) NOT NULL DEFAULT '',
    "icon" VARCHAR(16) NOT NULL DEFAULT '💬',
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_profiles" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(600) NOT NULL DEFAULT '',
    "category" VARCHAR(80) NOT NULL,
    "city" VARCHAR(80) NOT NULL DEFAULT 'Ouagadougou',
    "logoUrl" VARCHAR(1024),
    "coverUrl" VARCHAR(1024),
    "status" "BusinessStatus" NOT NULL DEFAULT 'PENDING',
    "rating" INTEGER NOT NULL DEFAULT 50,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "description" VARCHAR(1200) NOT NULL DEFAULT '',
    "category" VARCHAR(80) NOT NULL,
    "priceXof" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" VARCHAR(1024),
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_orders" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "buyerId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalXof" INTEGER NOT NULL,
    "deliveryFeeXof" INTEGER NOT NULL DEFAULT 0,
    "totalXof" INTEGER NOT NULL,
    "deliveryAddress" VARCHAR(300) NOT NULL,
    "customerNote" VARCHAR(500) NOT NULL DEFAULT '',
    "paymentOperationId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_order_lines" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" VARCHAR(140) NOT NULL,
    "unitPriceXof" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalXof" INTEGER NOT NULL,

    CONSTRAINT "marketplace_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "ownerId" UUID,
    "type" "LedgerAccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_operations" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "initiatedById" UUID NOT NULL,
    "debitAccountId" UUID NOT NULL,
    "creditAccountId" UUID NOT NULL,
    "type" "WalletOperationType" NOT NULL,
    "status" "WalletOperationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'SANDBOX',
    "providerReference" VARCHAR(120),
    "amountXof" INTEGER NOT NULL,
    "label" VARCHAR(180) NOT NULL,
    "metadata" JSONB,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_topics_groupId_createdAt_idx" ON "group_topics"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "group_topics_groupId_name_key" ON "group_topics"("groupId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_ownerId_key" ON "business_profiles"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_slug_key" ON "business_profiles"("slug");

-- CreateIndex
CREATE INDEX "business_profiles_status_category_createdAt_idx" ON "business_profiles"("status", "category", "createdAt");

-- CreateIndex
CREATE INDEX "products_status_featured_createdAt_idx" ON "products"("status", "featured", "createdAt");

-- CreateIndex
CREATE INDEX "products_businessId_status_idx" ON "products"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_reference_key" ON "marketplace_orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_paymentOperationId_key" ON "marketplace_orders"("paymentOperationId");

-- CreateIndex
CREATE INDEX "marketplace_orders_buyerId_createdAt_idx" ON "marketplace_orders"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "marketplace_orders_businessId_status_createdAt_idx" ON "marketplace_orders"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "marketplace_order_lines_orderId_idx" ON "marketplace_order_lines"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_ownerId_key" ON "ledger_accounts"("ownerId");

-- CreateIndex
CREATE INDEX "ledger_accounts_type_active_idx" ON "ledger_accounts"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_operations_reference_key" ON "wallet_operations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_operations_idempotencyKey_key" ON "wallet_operations"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_operations_providerReference_key" ON "wallet_operations"("providerReference");

-- CreateIndex
CREATE INDEX "wallet_operations_initiatedById_createdAt_idx" ON "wallet_operations"("initiatedById", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "wallet_operations_status_createdAt_idx" ON "wallet_operations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_createdAt_idx" ON "ledger_entries"("accountId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_operationId_accountId_direction_key" ON "ledger_entries"("operationId", "accountId", "direction");

-- AddForeignKey
ALTER TABLE "group_topics" ADD CONSTRAINT "group_topics_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_paymentOperationId_fkey" FOREIGN KEY ("paymentOperationId") REFERENCES "wallet_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_order_lines" ADD CONSTRAINT "marketplace_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_order_lines" ADD CONSTRAINT "marketplace_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_operations" ADD CONSTRAINT "wallet_operations_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_operations" ADD CONSTRAINT "wallet_operations_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_operations" ADD CONSTRAINT "wallet_operations_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "wallet_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
