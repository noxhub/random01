# Pop-Up Places — working notes

- `index.html` + `mural.mind`: the web AR app, served by GitHub Pages from the `gh-pages` branch.
  After changing them on `main`, push `main:gh-pages` too.
- `server/`: API v0 (Node 22+, no dependencies). `node --test server/test.mjs` must pass.
- `deploy/azure.sh`: deploys `server/` to Azure App Service in resource group `nxrdi-mural-ar-rg`.
  The subscription id comes from the owner, not from this repo. Re-run it to ship API changes.
- The API is live at https://popup-places-api.azurewebsites.net (plan `popup-places-plan`, free F1 tier,
  West US 2 because East US had no F1 quota: `AZ_SKU=F1 AZ_LOCATION=westus2`). F1 sleeps when idle, so the
  first request can take a while; move to B1 (paid) for always-on.
- `index.html` calls the API: "Share with people nearby" on your own place, a Nearby list on the home
  screen, and like / report when viewing someone else's place. On localhost it talks to
  `http://localhost:8080` instead. Sharing is an explicit button, not automatic on capture, because it
  publishes the surface and its location.

## Next step
1. Try sharing and opening a nearby place on two real phones (only tested in a desktop browser with a fake camera).
2. Shared places have no thumbnail and cannot be edited or removed by their creator yet.
3. Design doc for the full platform: https://claude.ai/artifact/PR49um9a5BF8A7XjEszZ91
