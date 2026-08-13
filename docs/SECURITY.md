# Sécurité

## Principes
- Secrets dans .env uniquement.
- JWT avec rotation refresh token.
- OTP local en dev via DEV_OTP.
- Limiter les API avec Throttler.
- Validation / DTO.
- Ne pas exposer le contenu E2EE dans l’admin.

## Audit requis avant production publique
- cryptographic audit
- pentest
- privacy/legal review
- load testing
- E2EE audit
