# Pop-Up Places — working notes

- `index.html` + `mural.mind`: the web AR app, served by GitHub Pages from the `gh-pages` branch.
  After changing them on `main`, push `main:gh-pages` too.
- `server/`: API v0 (Node 22+, no dependencies). `node --test server/test.mjs` must pass.
- `deploy/azure.sh`: deploys `server/` to Azure App Service in resource group `nxrdi-mural-ar-rg`.
  It has not been run yet. The subscription id comes from the owner, not from this repo.

## Next step
1. Run `deploy/azure.sh`, fix anything Azure rejects, and confirm the printed URL answers.
2. Wire the app to the API: on creating a place, POST it (with the target file) to `/v1/creations`;
   add a "Nearby" list on the home screen from `GET /v1/creations?lat&lng`, opening a place by
   fetching `/v1/creations/:id/target`. Add like and flag buttons in the AR view.
3. Design doc for the full platform: https://claude.ai/artifact/PR49um9a5BF8A7XjEszZ91
