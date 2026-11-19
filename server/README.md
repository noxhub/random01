# Pop-Up Places API (v0)

The first piece of the shared backend: creations pinned to a location, nearby search,
likes that earn the creator credits, flags that pull content for review, and credit metering.

    node server.mjs          # needs Node 22+, no dependencies; listens on :8080
    node --test test.mjs     # run the tests

| Route | What it does |
| --- | --- |
| `GET /v1/me` | Your credit balance |
| `POST /v1/creations` | Publish a creation (prompt is checked first, then 1 credit is charged) |
| `GET /v1/creations?lat&lng&radiusKm` | Creations near a point, nearest first |
| `GET /v1/creations/:id` | One creation |
| `GET /v1/creations/:id/target` | Its tracking target file |
| `POST /v1/creations/:id/like` | Like it; the creator earns a credit |
| `POST /v1/creations/:id/flag` | Flag it; 3 distinct flags hide it for review |

Callers identify themselves with an `x-device-id` header. That is a placeholder until real
accounts exist, and it is not secure. Not built yet: sign-in, business accounts and ads,
payments and pre-orders, AI review of flagged content, AI-generated characters.
The app in `index.html` does not call this API yet.
