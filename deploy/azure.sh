#!/usr/bin/env bash
# Deploys the Pop-Up Places API (server/) to Azure App Service.
# Needs: az CLI, signed in (az login --tenant <tenant>).
#   AZ_SUBSCRIPTION=<subscription id> ./deploy/azure.sh
set -euo pipefail
: "${AZ_SUBSCRIPTION:?set AZ_SUBSCRIPTION to the subscription id}"
RG="${AZ_RG:-nxrdi-mural-ar-rg}"
APP="${AZ_APP:-popup-places-api}"          # must be globally unique; change if taken
PLAN="${AZ_PLAN:-popup-places-plan}"
SKU="${AZ_SKU:-B1}"                        # B1 keeps the app always on; F1 is free but sleeps

az account set --subscription "$AZ_SUBSCRIPTION"
LOCATION="${AZ_LOCATION:-$(az group show -n "$RG" --query location -o tsv)}"   # plan region; defaults to the group's

az appservice plan create -g "$RG" -n "$PLAN" --is-linux --sku "$SKU" -l "$LOCATION" -o none
az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "NODE:22-lts" -o none
# SQLite file lives on /home, which App Service keeps across restarts (single instance only).
az webapp config appsettings set -g "$RG" -n "$APP" --settings DB_PATH=/home/popup-places.db -o none
az webapp config set -g "$RG" -n "$APP" --startup-file "node server.mjs" --always-on "$([ "$SKU" = F1 ] && echo false || echo true)" -o none

TMP="$(mktemp -d)"; (cd "$(dirname "$0")/../server" && zip -q "$TMP/api.zip" server.mjs)
az webapp deploy -g "$RG" -n "$APP" --src-path "$TMP/api.zip" --type zip -o none

URL="https://$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)"
echo "Deployed: $URL"
curl -fsS "$URL/v1/creations?lat=47.6062&lng=-122.3421" && echo
