#!/usr/bin/env python3
"""
Le matricole a 10 cifre che PULSE pretende, ricostruite dai cedolini LUL.

PERCHE' SERVE
Il tracciato record CL System per l'importazione presenze vuole, alle posizioni
10-19, una matricola cosi' composta:

    0257  ·  Q  ·  00598
    ditta   qual.  codice personale

Il cedolino la spezza in due colonne diverse della riga anagrafica: `D.L.` (il
codice ditta), `Q.` (la qualifica INPS) e `MATR.` (il codice personale). Questo
script rimette insieme i tre pezzi.

Sulla qualifica: nei cedolini di luglio 2026 vale 1 (operaio, stage, apprendista
qualificato), 2 (impiegato, quadro, parasubordinato), 4 (apprendista impiegato),
5 (apprendista operaio). Non e' derivabile dal livello contrattuale, e cambia
quando finisce un apprendistato — per questo va tenuta come dato suo.

Vengono scartati i PDF che non hanno una riga anagrafica leggibile: sono i
cedolini intestati a terzi (es. SORIS S.p.A. per i pignoramenti) e le copie
prive del layer dati. Lo script li elenca in coda, cosi' si vede cosa e' rimasto
fuori invece di scoprirlo dopo.

USO (dalla cartella web/):
  python3 scripts/estrai-matricole-cedolini.py "/percorso/cedolini luglio"
  python3 scripts/estrai-matricole-cedolini.py "/percorso/cedolini luglio" -o scripts/ru-data/matricole-pulse.csv

Richiede `pdftotext` (poppler-utils). Sola lettura sui PDF.
"""

import argparse
import csv
import glob
import os
import re
import subprocess
import sys

# La riga anagrafica del LUL: D.L. FIL. C.C. REP. Q. Q.P. DESCR. MATR. NOME S. CF
RIGA = re.compile(
    r"\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+"   # D.L. FIL. C.C. REP. Q. Q.P.
    r"(\S.*?)\s+"                                             # descrizione qualifica
    r"(\d{5,7})\s+"                                           # MATR.
    r"(.+?)\s+([MF])\s+([A-Z0-9]{16})\s*$"                    # cognome nome, sesso, CF
)
INTESTAZIONE = re.compile(r"D\.L\.\s+FIL\.")

CAMPI = ["cognome_nome", "cf", "sesso", "ditta", "qualifica",
         "descr", "matr_cedolino", "matricola_pulse"]


def testo(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"],
                          capture_output=True, text=True).stdout


def anagrafica(pdf):
    """La riga anagrafica del cedolino, o None se il PDF non ce l'ha."""
    righe = testo(pdf).splitlines()
    i = next((n for n, r in enumerate(righe) if INTESTAZIONE.search(r)), None)
    if i is None:
        return None, "riga anagrafica non trovata"
    # Sotto l'intestazione ci sono righe vuote di impaginazione: la prima piena e' quella dei dati.
    dati = next((r for r in righe[i + 1:i + 5] if r.strip()), "")
    m = RIGA.match(dati)
    if not m:
        return None, "riga non interpretabile: " + dati.strip()[:90]
    return m.groups(), None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cartella", help="cartella con i PDF dei cedolini LUL")
    ap.add_argument("-o", "--output", default="scripts/ru-data/matricole-pulse.csv",
                    help="CSV da scrivere (default: scripts/ru-data/matricole-pulse.csv)")
    args = ap.parse_args()

    pdf = sorted(glob.glob(os.path.join(args.cartella, "*.pdf")))
    if not pdf:
        sys.exit(f"✗ Nessun PDF in {args.cartella}")

    # Chiave sul codice fiscale: se lo stesso cedolino arriva in piu' copie, una basta.
    per_cf, scarti = {}, []
    for f in pdf:
        gruppi, errore = anagrafica(f)
        if errore:
            scarti.append((os.path.basename(f), errore))
            continue
        dl, _fil, _cc, _rep, q, _qp, descr, matr, nome, sesso, cf = gruppi
        personale = matr.lstrip("0").rjust(5, "0")
        per_cf[cf] = {
            "cognome_nome": nome.strip(),
            "cf": cf,
            "sesso": sesso,
            "ditta": f"{int(dl):04d}",
            "qualifica": q,
            "descr": descr.strip(),
            "matr_cedolino": matr,
            "matricola_pulse": f"{int(dl):04d}{int(q)}{personale}",
        }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=CAMPI, delimiter=";")
        w.writeheader()
        for r in sorted(per_cf.values(), key=lambda x: x["cognome_nome"]):
            w.writerow(r)

    lunghezze = sorted({len(r["matricola_pulse"]) for r in per_cf.values()})
    ditte = sorted({r["ditta"] for r in per_cf.values()})
    qualifiche = sorted({(r["qualifica"], r["descr"]) for r in per_cf.values()})

    print(f"PDF letti: {len(pdf)} · lavoratori estratti: {len(per_cf)} → {args.output}")
    print(f"Lunghezza matricola PULSE: {lunghezze} (deve essere solo [10])")
    print(f"Codici ditta trovati: {ditte} (se ne compare piu' di uno, guardare perche')")
    print("Qualifiche INPS: " + ", ".join(f"{q}={d}" for q, d in qualifiche))

    if scarti:
        print(f"\nScartati {len(scarti)} PDF:")
        for nome, motivo in scarti:
            print(f"  · {nome[:70]} → {motivo}")


if __name__ == "__main__":
    main()
