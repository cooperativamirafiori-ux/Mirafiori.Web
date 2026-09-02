#!/usr/bin/env python3
"""
Porta in Supabase i residui di ferie, festività soppresse e flessibilità dalle
estrazioni mensili dello Studio paghe.

I FILE IN INGRESSO
Due .xls prodotti da GENIUS, formato Excel vecchio (BIFF8) — per questo lo script
è in Python con xlrd: ExcelJS, che l'app usa altrove, legge solo .xlsx.

  FERIE RESIDUE LUGLIO 2026.xls      28 colonne, due blocchi affiancati
  FLESSIBILITA' RESIDUA 07-2026.xls  20 colonne, un blocco

La struttura non è documentata da nessuna parte, quindi è stata ricavata
confrontando i numeri con il riquadro ratei dei cedolini, riga per riga:

  col.  1   codice ditta (257)
  col.  2   qualifica INPS + codice personale, insieme (es. 1000262)
  col.  3   cognome e nome, TRONCATI a 26 caratteri
  col. 12   livello (C2, D3, F2...)
  col. 13   percentuale part time (0 = tempo pieno)
  col. 15   data di riferimento del dato, come numero DDMMAAAA (31072026)
  col. 16-20  residuo a.p. · maturate · godute · residuo · importo
  col. 24-28  lo stesso, per le festività soppresse (solo nel file ferie)

TUTTO IN ORE. Le ferie maturano 165 h/anno, esattamente il divisore orario
mensile; le festività soppresse 30,4 h/anno, cioè 4 giorni. Leggerli come giorni
significa sbagliare di un fattore sette.

LE RIGHE CHE NON SONO PERSONE
In mezzo ai dati ci sono i totali di gruppo: TOTALE OPERAI, TOTALE SOCI LOCANDA,
CTR DL, T.F.R., COSTO... Nel file ferie sono 65 righe su 174. Si riconoscono
dalla matricola che comincia per 999, ed è su quello che si filtra: sul nome no,
perché "TOTALE ******* TOTALE FILIALE" oggi c'è e domani chissà.

L'AGGANCIO ALLA PERSONA
I file non portano il codice fiscale e i nomi sono troncati, quindi l'unico
appiglio è la matricola. Il percorso è: matricola del file → scheda SharePoint
(campo MatricolaPulse) → mail aziendale → riga `dipendente` su Supabase. Lo
script riempie anche `dipendente.matricola_pulse` mentre passa, così la prossima
volta il giro è più corto e la matricola è pronta per l'export verso PULSE.

Chi non si aggancia NON viene scritto e viene elencato in coda: una riga di
residui attribuita alla persona sbagliata è peggio di una riga mancante.

USO (dalla cartella web/):
  python3 scripts/importa-residui.py --mese 2026-07 \\
      --ferie "/percorso/FERIE RESIDUE LUGLIO 2026.xls" \\
      --flessibilita "/percorso/FLESSIBILITA' RESIDUA 07-2026.xls"

  # ...e quando l'elenco torna, per scrivere davvero:
  python3 scripts/importa-residui.py --mese 2026-07 --ferie ... --flessibilita ... --conferma

Senza --conferma non scrive niente: mostra solo cosa farebbe.
Uno dei due file può mancare: si importa quello che c'è.

PRIMA DEL PRIMO GIRO
  psql / SQL editor di Supabase: supabase/timbrature_residui.sql
  node scripts/aggiungi-colonna-ru.mjs MatricolaPulse testo
  node scripts/popola-matricola-pulse.mjs --conferma

Richiede: pip3 install xlrd
Legge da .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
SP_LIST_DIPENDENTI, SP_SITE_RU (o SHAREPOINT_SITE_ID), SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY.
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import date

try:
    import xlrd
except ImportError:
    sys.exit("✗ Manca xlrd. Installalo con:  pip3 install xlrd")

QUI = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(QUI)

# Posizioni (base 0) ricavate dal confronto coi cedolini. Vedi docstring.
COL_DITTA, COL_MATR, COL_NOME = 0, 1, 2
COL_LIVELLO, COL_PERC, COL_DATA_RIF = 11, 12, 14
BLOCCO_FERIE = 15          # residuo_ap, maturate, godute, residuo, importo
BLOCCO_FS = 23             # idem, solo nel file ferie
BLOCCO_FLESSIBILITA = 15   # nel file flessibilità


# ---------------------------------------------------------------- env e HTTP

def carica_env():
    p = os.path.join(WEB, ".env.local")
    if not os.path.exists(p):
        return
    with open(p, encoding="utf-8") as fh:
        for riga in fh:
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", riga)
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip("\"'")


def http(url, metodo="GET", corpo=None, headers=None):
    dati = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dati, method=metodo)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if dati is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as res:
        testo = res.read().decode()
    return json.loads(testo) if testo.strip() else None


def token_graph():
    corpo = urllib.parse.urlencode({
        "client_id": os.environ["GRAPH_CLIENT_ID"],
        "client_secret": os.environ["GRAPH_CLIENT_SECRET"],
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }).encode()
    url = f"https://login.microsoftonline.com/{os.environ['GRAPH_TENANT_ID']}/oauth2/v2.0/token"
    req = urllib.request.Request(url, data=corpo, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode())["access_token"]


def supabase(percorso, metodo="GET", corpo=None, extra=None):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + percorso
    h = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Accept": "application/json",
    }
    h.update(extra or {})
    return http(url, metodo, corpo, h)


# ---------------------------------------------------------------- lettura xls

def numero(v):
    """Una cella numerica, o None se vuota/non numerica. Lo zero è un dato valido."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def data_da_ddmmaaaa(v):
    """La data di riferimento arriva come numero: 31072026 → 2026-07-31."""
    n = numero(v)
    if not n:
        return None
    s = str(int(n)).zfill(8)
    try:
        return date(int(s[4:]), int(s[2:4]), int(s[:2])).isoformat()
    except ValueError:
        return None


def leggi_xls(percorso, blocchi):
    """
    Le righe-persona del file, una per matricola.

    `blocchi` è una lista di (tipo, colonna_iniziale). Torna anche l'elenco delle
    righe scartate, che serve a far vedere che i totali sono stati riconosciuti
    come tali e non buttati per sbaglio.
    """
    wb = xlrd.open_workbook(percorso)
    sh = wb.sheet_by_index(0)
    persone, scartate = [], []

    for r in range(1, sh.nrows):
        v = [sh.cell_value(r, c) for c in range(sh.ncols)]
        grezza = numero(v[COL_MATR])
        nome = str(v[COL_NOME]).strip()
        matr = str(int(grezza)) if grezza else ""

        # Le prime cifre distinguono una persona da un totale di gruppo.
        if len(matr) != 7 or matr.startswith("999"):
            if nome:
                scartate.append(nome)
            continue

        ditta = int(numero(v[COL_DITTA]) or 0)
        qualifica, personale = matr[0], matr[1:]
        pulse = f"{ditta:04d}{qualifica}{personale.lstrip('0').rjust(5, '0')}"

        voci = []
        for tipo, inizio in blocchi:
            residuo = numero(v[inizio + 3])
            # Senza residuo la riga non dice nulla su quella voce: meglio non
            # scrivere che scrivere uno zero inventato.
            if residuo is None:
                continue
            voci.append({
                "tipo": tipo,
                "residuo_ap": numero(v[inizio]),
                "maturate": numero(v[inizio + 1]),
                "godute": numero(v[inizio + 2]),
                "residuo": residuo,
                "importo": numero(v[inizio + 4]),
            })

        persone.append({
            "matricola_pulse": pulse,
            "nome": nome,
            "livello": str(v[COL_LIVELLO]).strip(),
            "al_giorno": data_da_ddmmaaaa(v[COL_DATA_RIF]),
            "voci": voci,
        })

    return persone, scartate


# ---------------------------------------------------------------- anagrafiche

def mappa_sharepoint():
    """matricola PULSE → mail aziendale, dalle schede Dipendenti."""
    sito = os.environ.get("SP_SITE_RU") or os.environ.get("SHAREPOINT_SITE_ID")
    lista = os.environ.get("SP_LIST_DIPENDENTI")
    if not (sito and lista):
        sys.exit("✗ Mancano SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI in .env.local")

    tok = token_graph()
    campi = "Cognome,Nome,MatricolaPulse,MailAziendale"
    url = (f"https://graph.microsoft.com/v1.0/sites/{sito}/lists/{lista}/items"
           f"?$select=id&$expand=fields($select={campi})&$top=200")
    fuori = {}
    senza_matricola = []
    while url:
        res = http(url, headers={
            "Authorization": "Bearer " + tok,
            "Prefer": "HonorNonIndexedQueriesWarningMayFailRandomly",
        })
        for it in res.get("value", []):
            f = it.get("fields", {})
            mp = str(f.get("MatricolaPulse") or "").strip()
            mail = str(f.get("MailAziendale") or "").strip().lower()
            nome = f"{f.get('Cognome') or ''} {f.get('Nome') or ''}".strip()
            if not mp:
                continue
            if not mail:
                senza_matricola.append(nome)
                continue
            fuori[mp] = mail
        url = res.get("@odata.nextLink")
    return fuori, senza_matricola


def mappa_supabase():
    """mail → id della riga `dipendente`."""
    righe = supabase("dipendente?select=id,email,matricola_pulse") or []
    return ({str(r["email"]).lower(): r["id"] for r in righe},
            {r["id"]: r.get("matricola_pulse") for r in righe})


# ---------------------------------------------------------------- il lavoro

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mese", required=True, help="mese di competenza, formato AAAA-MM")
    ap.add_argument("--ferie", help="percorso del file FERIE RESIDUE")
    ap.add_argument("--flessibilita", help="percorso del file FLESSIBILITA' RESIDUA")
    ap.add_argument("--conferma", action="store_true", help="scrive davvero su Supabase")
    args = ap.parse_args()

    if not re.match(r"^\d{4}-\d{2}$", args.mese):
        sys.exit("✗ --mese va scritto AAAA-MM, per esempio 2026-07")
    if not (args.ferie or args.flessibilita):
        sys.exit("✗ Serve almeno uno fra --ferie e --flessibilita")
    mese = args.mese + "-01"

    carica_env()
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not os.environ.get(k):
            sys.exit(f"✗ Manca {k} in .env.local")

    # --- leggo i file
    letti = []
    if args.ferie:
        p, scartate = leggi_xls(args.ferie, [("ferie", BLOCCO_FERIE),
                                             ("festivita_soppresse", BLOCCO_FS)])
        letti.append((os.path.basename(args.ferie), p, scartate))
    if args.flessibilita:
        p, scartate = leggi_xls(args.flessibilita, [("flessibilita", BLOCCO_FLESSIBILITA)])
        letti.append((os.path.basename(args.flessibilita), p, scartate))

    for nomefile, persone, scartate in letti:
        voci = sum(len(x["voci"]) for x in persone)
        print(f"{nomefile}: {len(persone)} persone, {voci} valori · "
              f"{len(scartate)} righe di totale scartate")
    print()

    # --- aggancio alle persone
    sp, sp_senza_mail = mappa_sharepoint()
    per_mail, matricole_supabase = mappa_supabase()
    print(f"SharePoint: {len(sp)} schede con MatricolaPulse e mail aziendale")
    print(f"Supabase:   {len(per_mail)} righe in `dipendente`\n")

    if not sp:
        sys.exit("✗ Nessuna scheda ha MatricolaPulse compilata.\n"
                 "  Prima: node scripts/aggiungi-colonna-ru.mjs MatricolaPulse testo\n"
                 "  Poi:   node scripts/popola-matricola-pulse.mjs --conferma")

    da_scrivere = []
    senza_scheda, senza_timbrature = [], []
    for nomefile, persone, _ in letti:
        for p in persone:
            mail = sp.get(p["matricola_pulse"])
            if not mail:
                senza_scheda.append((p["nome"], p["matricola_pulse"]))
                continue
            dip = per_mail.get(mail)
            if not dip:
                senza_timbrature.append((p["nome"], mail))
                continue
            for v in p["voci"]:
                da_scrivere.append({
                    "dipendente_id": dip, "mese": mese, "al_giorno": p["al_giorno"],
                    "fonte": nomefile, **v,
                })

    print(f"Valori da scrivere: {len(da_scrivere)}")
    for tipo in ("ferie", "festivita_soppresse", "flessibilita"):
        n = [x for x in da_scrivere if x["tipo"] == tipo]
        if n:
            print(f"  · {tipo:22} {len(n):4}  (residuo medio {sum(x['residuo'] for x in n)/len(n):7.2f} h)")

    def elenca(titolo, gruppo, riga):
        if not gruppo:
            return
        print(f"\n{titolo} ({len(gruppo)}):")
        for x in sorted(set(gruppo)):
            print("   " + riga(x))

    elenca("Nel file ma senza scheda con quella MatricolaPulse → NON importati",
           senza_scheda, lambda x: f"{x[0]:30} matr. {x[1]}")
    elenca("Hanno la scheda ma non sono fra i dipendenti delle timbrature → NON importati",
           senza_timbrature, lambda x: f"{x[0]:30} {x[1]}")
    elenca("Schede con MatricolaPulse ma senza mail aziendale",
           sp_senza_mail, lambda x: x)

    # La matricola sulla riga Supabase: comoda per l'export verso PULSE, e la
    # riempiamo qui perché siamo già passati da SharePoint.
    matricole_da_allineare = []
    for mp, mail in sp.items():
        dip = per_mail.get(mail)
        if dip and matricole_supabase.get(dip) != mp:
            matricole_da_allineare.append((dip, mp))
    if matricole_da_allineare:
        print(f"\nMatricole da riportare su `dipendente.matricola_pulse`: {len(matricole_da_allineare)}")

    if not args.conferma:
        print("\nProva a vuoto: non ho scritto niente. Per scrivere, riaggiungi --conferma")
        return

    if matricole_da_allineare:
        for dip, mp in matricole_da_allineare:
            supabase(f"dipendente?id=eq.{dip}", "PATCH", {"matricola_pulse": mp},
                     {"Prefer": "return=minimal"})
        print(f"\n✓ Allineate {len(matricole_da_allineare)} matricole su `dipendente`.")

    if not da_scrivere:
        print("Niente residui da scrivere.")
        return

    # on_conflict sulla chiave unica: ricaricare lo stesso mese aggiorna i valori
    # invece di duplicarli.
    for i in range(0, len(da_scrivere), 200):
        supabase("residuo_mensile?on_conflict=dipendente_id,mese,tipo", "POST",
                 da_scrivere[i:i + 200],
                 {"Prefer": "resolution=merge-duplicates,return=minimal"})
    print(f"✓ Scritti {len(da_scrivere)} valori per il mese {args.mese}.")


if __name__ == "__main__":
    main()
