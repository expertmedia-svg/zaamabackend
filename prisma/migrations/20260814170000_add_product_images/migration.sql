-- Plusieurs photos par produit, en plus de l'ancien champ imageUrl (gardé
-- pour compatibilité avec les produits existants). Stocke des clés
-- d'objet de stockage interne (résolues en liens signés à la volée par
-- l'API), jamais des URL publiques directement.
ALTER TABLE "products"
ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
