-- YengaPay agrège les opérateurs Mobile Money et confirme les PayIn par webhook.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'YENGAPAY';
