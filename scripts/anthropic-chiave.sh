#!/usr/bin/env bash
# Chiave API Anthropic (lettura automatica documenti d'identità nelle Prestazioni).
# Chiede la chiave senza mostrarla, la scrive in .env.local e la carica su Vercel
# (production, preview, development). Rilanciabile: sostituisce quella vecchia.
#
# Uso (da web/):  bash scripts/anthropic-chiave.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v vercel >/dev/null 2>&1; then VERCEL=(vercel); else VERCEL=(npx --yes vercel@latest); fi

printf 'Incolla la chiave API Anthropic (sk-ant-...) e premi Invio: '
read -rs CHIAVE
echo
CHIAVE=$(printf '%s' "$CHIAVE" | tr -d '[:space:]')
[[ "$CHIAVE" == sk-ant-* ]] || { echo "✗ Non sembra una chiave Anthropic (deve iniziare con sk-ant-)"; exit 1; }

touch .env.local
grep -v -E '^ANTHROPIC_API_KEY=' .env.local > .env.local.tmp || true
printf 'ANTHROPIC_API_KEY=%s\n' "$CHIAVE" >> .env.local.tmp
cat .env.local.tmp > .env.local
rm -f .env.local.tmp
echo "✓ ANTHROPIC_API_KEY → .env.local"

for AMB in production preview development; do
  "${VERCEL[@]}" env rm ANTHROPIC_API_KEY "$AMB" --yes >/dev/null 2>&1 || true
  printf '%s' "$CHIAVE" | "${VERCEL[@]}" env add ANTHROPIC_API_KEY "$AMB" --sensitive >/dev/null 2>&1 \
    || printf '%s' "$CHIAVE" | "${VERCEL[@]}" env add ANTHROPIC_API_KEY "$AMB" >/dev/null
  echo "✓ ANTHROPIC_API_KEY → Vercel $AMB"
done

echo
echo "Fatto. Prova la chiave con:  node scripts/prova-anthropic.mjs"
