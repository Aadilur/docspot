# DocSpot Backend (skeleton)

Node.js + Express starter with a clean-architecture-friendly folder layout.

## Run

- Dev: `npm run dev`
- Health: `GET /health`

## Layers

- `src/domain` — core business rules (no frameworks)
- `src/application` — use-cases + ports
- `src/infrastructure` — DB/storage/adapters
- `src/interfaces/http` — controllers/routes
