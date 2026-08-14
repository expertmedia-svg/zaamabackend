-- Le délai est appliqué côté serveur à tous les nouveaux messages de la conversation.
ALTER TABLE "conversations"
ADD COLUMN "disappearingSeconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_disappearingSeconds_check"
CHECK ("disappearingSeconds" IN (0, 86400, 604800, 7776000));

ALTER TABLE "messages"
ADD COLUMN "hiddenForUserIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
