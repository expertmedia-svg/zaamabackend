-- Code PIN optionnel pour se reconnecter (téléphone + PIN) sans repasser par
-- un OTP à chaque fois. Bcrypt (jamais le PIN en clair), avec un verrouillage
-- temporaire après plusieurs échecs pour limiter le brute-force sur un
-- espace à 4-6 chiffres.
ALTER TABLE "users"
ADD COLUMN "pinHash" VARCHAR(100),
ADD COLUMN "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinLockedUntil" TIMESTAMPTZ(3);
