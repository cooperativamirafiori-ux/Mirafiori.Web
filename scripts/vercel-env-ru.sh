#!/usr/bin/env bash
# ============================================================================
# Cutover delle variabili d'ambiente dell'area Risorse Umane su Vercel.
#
# Legge i valori dal blocco [B] di .env.local — unica fonte di verità — e li
# imposta su production, preview e development. Le variabili che esistono già
# vengono prima rimosse: `vercel env add` su una chiave esistente crea un
# secondo valore anziché sostituirlo, e il comportamento diventa imprevedibile.
#
# Uso (da web/):
#   ./scripts/vercel-env-ru.sh            # mostra cosa farebbe, non modifica
#   ./scripts/vercel-env-ru.sh --apply    # esegue
#
# Prerequisiti: `vercel login` già fatto, progetto collegato (`vercel link`).
#
# ⚠️ TOKEN_ENC_KEY deve essere IDENTICA in locale e su Vercel: la tabella
# ms_token è la stessa, e chiavi diverse rendono i token di un ambiente
# illeggibili all'altro (errore gestito, ma costringe a rifare l'accesso).
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env.local"
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

VARIABILI=(SP_SITE_RU SP_RU_DRIVE_ID SP_RU_FOLDER SP_LIST_DIPENDENTI SP_LIST_TIROCINI SP_GRUPPO_RU_ID TOKEN_ENC_KEY)
AMBIENTI=(production preview development)

# --- lettura dal blocco [B] (o dal file, per TOKEN_ENC_KEY) -----------------
# Il blocco [B] è delimitato da "# [B] NUOVO" e dalla riga "# ====".
leggi_valore() {
  local chiave="$1"
  # prima cerca nel blocco [B], anche se la riga è commentata
  local valore
  valore=$(awk -v k="$chiave" '
    /^# \[B\] NUOVO/ { dentro=1; next }
    /^# ={5,}/       { dentro=0 }
    dentro && $0 ~ "^[[:space:]]*#?[[:space:]]*" k "=" {
      sub("^[[:space:]]*#?[[:space:]]*" k "=", "");
      gsub(/^["'"'"']|["'"'"']$/, "");
      print; exit
    }
  ' "$ENV_FILE")
  if [[ -z "$valore" ]]; then
    # ripiego: riga attiva in qualunque punto del file
    valore=$(grep -E "^${chiave}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/^"|"$//g')
  fi
  printf '%s' "$valore"
}

mascherato() {
  local v="$1"
  if [[ ${#v} -le 12 ]]; then printf '%s' "$v"; else printf '%s…%s (%d car.)' "${v:0:8}" "${v: -4}" "${#v}"; fi
}

echo
if $APPLY; then
  echo "CUTOVER ENV VERCEL — ESECUZIONE"
else
  echo "CUTOVER ENV VERCEL — SIMULAZIONE (aggiungi --apply per eseguire)"
fi
echo "======================================================================"

# --- controllo preliminare -------------------------------------------------
mancanti=()
for v in "${VARIABILI[@]}"; do
  val="$(leggi_valore "$v")"
  if [[ -z "$val" ]]; then
    mancanti+=("$v")
    printf '  ✗ %-22s NON TROVATA in %s\n' "$v" "$ENV_FILE"
  else
    printf '  ✓ %-22s %s\n' "$v" "$(mascherato "$val")"
  fi
done

if [[ ${#mancanti[@]} -gt 0 ]]; then
  echo
  echo "Manca il valore di: ${mancanti[*]}"
  echo "Impostale in .env.local prima di procedere. Nulla è stato modificato."
  exit 1
fi

if ! $APPLY; then
  echo
  echo "Verranno impostate ${#VARIABILI[@]} variabili × ${#AMBIENTI[@]} ambienti = $(( ${#VARIABILI[@]} * ${#AMBIENTI[@]} )) valori."
  echo "Le chiavi già presenti su Vercel verranno prima rimosse."
  echo
  echo "Per eseguire:  ./scripts/vercel-env-ru.sh --apply"
  echo
  exit 0
fi

# --- esecuzione ------------------------------------------------------------
echo
for v in "${VARIABILI[@]}"; do
  val="$(leggi_valore "$v")"
  for amb in "${AMBIENTI[@]}"; do
    # La rimozione può fallire se la variabile non esiste: è un caso normale.
    if vercel env rm "$v" "$amb" --yes >/dev/null 2>&1; then
      stato="sostituita"
    else
      stato="aggiunta"
    fi
    if printf '%s' "$val" | vercel env add "$v" "$amb" >/dev/null 2>&1; then
      printf '  ✓ %-22s %-12s %s\n' "$v" "$amb" "$stato"
    else
      printf '  ✗ %-22s %-12s ERRORE\n' "$v" "$amb"
    fi
  done
done

echo
echo "Controllo finale:"
vercel env ls 2>/dev/null | grep -E "SP_SITE_RU|SP_RU_|SP_LIST_|SP_GRUPPO_RU_ID|TOKEN_ENC_KEY" || true

cat <<'FINE'

Dopo il cutover
  1. redeploy: le env si leggono al build →  vercel --prod
  2. verifica in produzione: apri l'area Risorse Umane e controlla i 263 record
  3. avvisa le 13 persone del gruppo M365: devono USCIRE e RIENTRARE nell'app,
     altrimenti l'area RU risponde "esci e rientra" (manca il refresh token)
  4. solo dopo il collaudo: rinomina le liste sorgente ZZ_*_dismessa

FINE
