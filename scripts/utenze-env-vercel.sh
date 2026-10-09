#!/usr/bin/env bash
# Variabili dell'area Utenze su Vercel (production, preview, development),
# lette da .env.local. Le nuove liste sono due: Mappatura Utenze e Costi
# Ricorrenti Strutture (docs/utenze.md).
#
# Uso (da web/):  bash scripts/utenze-env-vercel.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# Se la CLI non è nel PATH (succede dopo un aggiornamento automatico che la
# sposta), si usa quella del pacchetto npm: stesso login, stesso progetto.
if command -v vercel >/dev/null 2>&1; then VERCEL=(vercel); else VERCEL=(npx --yes vercel@latest); fi
for NOME in SP_LIST_MAPPATURA_UTENZE SP_LIST_COSTI_RICORRENTI; do
  VALORE=$(grep -E "^${NOME}=" .env.local | head -1 | cut -d= -f2- | tr -d '"'"'")
  [[ -z "$VALORE" ]] && { echo "✗ $NOME manca in .env.local"; exit 1; }
  for AMB in production preview development; do
    "${VERCEL[@]}" env rm "$NOME" "$AMB" --yes >/dev/null 2>&1 || true
    printf '%s' "$VALORE" | "${VERCEL[@]}" env add "$NOME" "$AMB" >/dev/null
    echo "✓ $NOME → $AMB"
  done
done
