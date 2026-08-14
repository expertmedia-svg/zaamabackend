-- Photo de couverture du profil personnel, en plus de l'avatar existant.
-- Stocke une clé d'objet de stockage interne (résolue en lien signé à la
-- volée par l'API), jamais une URL publique.
ALTER TABLE "user_profiles"
ADD COLUMN "coverUrl" VARCHAR(1024);
