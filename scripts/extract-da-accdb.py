#!/usr/bin/env python3
"""Estrae PROFILO SOGGETTO / COLLABORATORI / TIROCINI dal .accdb in JSON puliti
con i nomi di campo interni SharePoint. Valuta Access (money) = intero/10000."""
import json, re, sys
from access_parser import AccessParser

ACCDB = sys.argv[1] if len(sys.argv) > 1 else \
    'GRUPPO MIRAFIORI SCS_ VER3_AGGIORNAMENTO_26-06-2026.accdb'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'

db = AccessParser(ACCDB)

def clean(v):
    if v is None: return None
    if isinstance(v, str):
        s = v.strip()
        return s if s else None
    return v

def date_only(v):
    v = clean(v)
    if v is None: return None
    s = str(v)
    m = re.match(r'(\d{4}-\d{2}-\d{2})', s)
    return m.group(1) if m else None

def money(v):
    """Access money = intero scalato x10000. Ritorna euro float o None."""
    v = clean(v)
    if v is None: return None
    try:
        n = int(str(v))
    except (ValueError, TypeError):
        try:
            return round(float(v), 2)
        except Exception:
            return None
    # scarta valori palesemente corrotti dal parser
    if abs(n) > 1_000_000_000:  # > 100.000 euro dopo /10000 => sospetto
        return None
    return round(n / 10000, 2)

def num(v):
    v = clean(v)
    if v is None: return None
    try: return int(v)
    except (ValueError, TypeError):
        try: return float(v)
        except Exception: return None

def table_rows(name):
    t = db.parse_table(name)
    cols = list(t.keys())
    n = len(t[cols[0]]) if cols else 0
    return t, n

def get(t, col, i):
    return t[col][i] if col in t else None

# ---------------- PROFILO SOGGETTO -> Dipendenti ----------------
t, n = table_rows('PROFILO SOGGETTO')
dip = []
for i in range(n):
    cognome = clean(get(t,'COGNOME',i)) or ''
    nome = clean(get(t,'NOME',i)) or ''
    dip.append({
        'Title': (f'{cognome} {nome}').strip() or f'Dipendente {get(t,"ID",i)}',
        'IdAccess': num(get(t,'ID',i)),
        'Cognome': cognome or None,
        'Nome': nome or None,
        'Matricola': clean(get(t,'MATRICOLA',i)),
        'CodiceFiscale': (clean(get(t,'CODICE FISCAALE',i)) or '').replace('\t','').replace(' ','') or None,
        'DataNascita': date_only(get(t,'DATADINASCITA',i)),
        'LuogoNascita': clean(get(t,'LUOGO DI NASCITA',i)),
        'Nazionalita': clean(get(t,'NAZIONALITA',i)),
        'AreaGeografica': clean(get(t,'AREA GEOGRAFICA DI PROVENIENZA',i)),
        'Genere': clean(get(t,'GENERE',i)),
        'StatoCivile': clean(get(t,'STATO CIVILE',i)),
        'Residenza': clean(get(t,'RESIDENZA',i)),
        'Domicilio': clean(get(t,'DOMICILIO',i)),
        'TitoloStudio': clean(get(t,'TITOLO DI STUDIO',i)),
        'Qualifica': clean(get(t,'QUALIFICA',i)),
        'CellAziendale': clean(get(t,'CELL AZIENDALE',i)),
        'CellPrivato': clean(get(t,'CELL PRIVATO',i)),
        'MailAziendale': clean(get(t,'MAIL AZIENDALE',i)),
        'MailPersonale': clean(get(t,'MAIL PERSONALE',i)),
        'DataAssunzione': date_only(get(t,'DATA ASSUNZIONE',i)),
        'OreLavoroPreviste': num(get(t,'ORE LAVORO PREVISTE',i)),
        'TipoContratto': clean(get(t,'TIPO DI CONTRATTO',i)),
        'TipoRapporto': clean(get(t,'TIPO DI RAPPORTO LAVORATIVO',i)),
        'AreaAssunzione': clean(get(t,'AREA DI ASSUNZIONE',i)),
        'LivelloContrattuale': clean(get(t,'LIVELLO CONTRATTUALE',i)),
        'Mansione': clean(get(t,'MANSIONE',i)),
        'ServizioAppartenenza': clean(get(t,'SERVIZIO DI APPARTENENZA',i)),
        'DataAmmissioneSocio': date_only(get(t,'DATA AMMISSIONE SOCIO',i)),
        'QuotaSociale': money(get(t,'QUOTA SOCIALE SOTTOSCRITTA',i)),
        'DataDimissioneLavoratore': date_only(get(t,'DATA DIMISSIONE LAVORATORE',i)),
        'DataDimissioneSocio': date_only(get(t,'DATA DIMISSIONE SOCIO',i)),
        'InvalidoSvantaggiato': clean(get(t,'INVALIDO CIVILE/SVANTAGGIATO',i)),
        'TipologiaSvantaggio': clean(get(t,'TIPOLOGIA INVALIDITA/SVANTAGGIO',i)),
        'FondoCoopersalute': clean(get(t,'FONDO COOPERSALUTE',i)),
        'StatoServizio': clean(get(t,'STATO DI SERVIZIO',i)),
        'Note': clean(get(t,'NOTE',i)),
    })

# ---------------- COLLABORATORI ----------------
t, n = table_rows('COLLABORATORI')
col = []
for i in range(n):
    cognome = clean(get(t,'COGNOME',i)) or ''
    nome = clean(get(t,'NOME',i)) or ''
    col.append({
        'Title': (f'{cognome} {nome}').strip() or f'Collaboratore {get(t,"ID",i)}',
        'IdAccess': num(get(t,'ID',i)),
        'Cognome': cognome or None,
        'Nome': nome or None,
        'Genere': clean(get(t,'GENERE',i)),
        'CategoriaProfessionale': clean(get(t,'CATEGORIA PROFESSIONALE',i)),
        'TipoPrestazione': clean(get(t,'TIPO DI PRESTAZIONE',i)),
        'ServizioCoop': clean(get(t,'SERVIZIO COOP INTERESSATO',i)),
        'RecapitoTelefonico': clean(get(t,'RECAPITO TELEFONICO',i)),
        'SocioCooperativa': clean(get(t,'SOCIO COOPERATIVA',i)),
        'CapitaleSociale': money(get(t,'CAPITALE SOCIALE SOTTOSCRITTO',i)),
    })

# ---------------- TIROCINI ----------------
t, n = table_rows('TIROCINI')
tir = []
for i in range(n):
    cognome = clean(get(t,'COGNOME',i)) or ''
    nome = clean(get(t,'NOME',i)) or ''
    tir.append({
        'Title': (f'{cognome} {nome}').strip() or f'Tirocinante {get(t,"ID",i)}',
        'IdAccess': num(get(t,'ID',i)),
        'Cognome': cognome or None,
        'Nome': nome or None,
        'Genere': clean(get(t,'GENERE',i)),
        'DataNascita': date_only(get(t,'DATADINASCITA',i)),
        'LuogoNascita': clean(get(t,'LUOGO DI NASCITA',i)),
        'Nazionalita': clean(get(t,'NAZIONALITA',i)),
        'Residenza': clean(get(t,'RESIDENZA',i)),
        'Domicilio': clean(get(t,'DOMICILIO',i)),
        'StatoCivile': clean(get(t,'STATO CIVILE',i)),
        'RecapitoTelefonico': clean(get(t,'RECAPITO TELEFONICO',i)),
        'LivelloIstruzione': clean(get(t,'LIVELLO DI ISTRUZIONE',i)),
        'CategoriaTirocinante': clean(get(t,'CATEGORIA TIROCINANTE',i)),
        'TipologiaTirocinio': clean(get(t,'TIPOLOGIA DI TIROCINIO',i)),
        'AttivitaAteco': clean(get(t,'ATTIVITA DI TIROCINIO (cod ATECO)',i)),
        'SoggettoOspitante': clean(get(t,'SOGGETTO OSPITANTE',i)),
        'DataInizio': date_only(get(t,'DATA INIZIO TIROCINIO',i)),
        'DataFine': date_only(get(t,'DATA FINE TIROCINIO',i)),
        'DurataMesi': num(get(t,'DURATA TIROCINIO (Mesi)',i)),
        'ImpegnoOrarioSettimanale': clean(get(t,'IMPEGNO ORARIO SETTIMANALE',i)),
        'IndennitaMensileLorda': money(get(t,'INDENNITA MANSILE LORDA',i)),
        'StatoTirocinio': clean(get(t,'STATO TIROCINIO',i)),
        'CategoriaCollaborazione': clean(get(t,'CATEGORIA COLLABORAZIONE',i)),
        'Note': clean(get(t,'NOTE',i)),
    })

for fname, data in [('dipendenti.json',dip),('collaboratori.json',col),('tirocini.json',tir)]:
    with open(f'{OUT}/{fname}','w',encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'{fname}: {len(data)} record')
