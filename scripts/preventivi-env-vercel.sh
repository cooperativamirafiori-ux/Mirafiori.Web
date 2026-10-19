#!/usr/bin/env bash
# Variabili della sezione Preventivi su Vercel (production, preview, development),
# lette da .env.local dopo `node scripts/provision-preventivi.mjs`.
# Piano: docs/preventivi.md
#
# Uso (da web/):  bash scripts/preventivi-env-vercel.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v vercel >/dev/null 2>&1; then VERCEL=(vercel); else VERCEL=(npx --yes vercel@latest); fi
for NOME in SP_LIST_PREVENTIVI SP_LIST_TARIFFARIO_PREVENTIVI SP_LIST_CONTATTI_PREVENTIVI SP_PREVENTIVI_DRIVE_ID; do
  VALORE=$(grep -E "^${NOME}=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'")
  [[ -z "$VALORE" ]] && { echo "✗ $NOME manca in .env.local: prima lancia node scripts/provision-preventivi.mjs"; exit 1; }
  for AMB in production preview development; do
    "${VERCEL[@]}" env rm "$NOME" "$AMB" --yes >/dev/null 2>&1 || true
    printf '%s' "$VALORE" | "${VERCEL[@]}" env add "$NOME" "$AMB" >/dev/null
    echo "✓ $NOME → $AMB"
  done
done
