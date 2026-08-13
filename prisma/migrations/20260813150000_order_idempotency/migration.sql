ALTER TABLE "marketplace_orders" ADD COLUMN "idempotencyKey" VARCHAR(240);
UPDATE "marketplace_orders" SET "idempotencyKey" = 'legacy:' || "id"::text WHERE "idempotencyKey" IS NULL;
ALTER TABLE "marketplace_orders" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "marketplace_orders_idempotencyKey_key" ON "marketplace_orders"("idempotencyKey");
