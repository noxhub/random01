#!/usr/bin/env bash
# Deploys the web app (index.html + mural.mind) to Azure Static Web Apps (free tier).
# Needs: az CLI signed in, Node (for npx).
#   AZ_SUBSCRIPTION=<subscription id> ./deploy/azure-web.sh
set -euo pipefail
: "${AZ_SUBSCRIPTION:?set AZ_SUBSCRIPTION to the subscription id}"
RG="${AZ_RG:-nxrdi-mural-ar-rg}"
SITE="${AZ_SITE:-popup-places-web}"
LOCATION="${AZ_WEB_LOCATION:-westus2}"     # Static Web Apps exists in only a few regions

az account set --subscription "$AZ_SUBSCRIPTION"
az staticwebapp show -g "$RG" -n "$SITE" -o none 2>/dev/null ||
  az staticwebapp create -g "$RG" -n "$SITE" -l "$LOCATION" --sku Free -o none

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; TMP="$(mktemp -d)"
cp "$ROOT/index.html" "$ROOT/mural.mind" "$TMP/"
echo '{"mimeTypes":{".mind":"application/octet-stream"}}' > "$TMP/staticwebapp.config.json"

# The token goes through the environment so it never appears in the process list or logs.
SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list -g "$RG" -n "$SITE" --query properties.apiKey -o tsv)" \
  npx -y @azure/static-web-apps-cli deploy "$TMP" --env production

URL="https://$(az staticwebapp show -g "$RG" -n "$SITE" --query defaultHostname -o tsv)"
echo "Deployed: $URL"
curl -fsS -o /dev/null -w "page %{http_code}\n" "$URL/"
