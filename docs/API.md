# API

## Base
- /api/v1 (préparé)
- Docs Swagger dans le backend dev si activé

## Endpoints de base
- POST /auth/request-otp
- POST /auth/verify-otp
- POST /auth/refresh
- POST /auth/logout
- GET /auth/sessions
- DELETE /auth/sessions/:id
- GET /users/me
- PATCH /users/me
- DELETE /users/me
- GET /users/me/blocked
- POST /users/:id/block
- DELETE /users/:id/block
- POST /users/reports
- GET /conversations
- POST /conversations/direct
- GET /conversations/:id/messages
- GET /messages
- POST /messages
- PATCH /messages/:id
- DELETE /messages/:id
- POST /groups
- GET /stories/feed
- POST /stories
- POST /uploads
- GET /calls
- POST /calls
- PATCH /calls/:id
- POST /messages/:id/reactions
- POST /messages/:id/receipt
- GET /health/live
- GET /health/ready
