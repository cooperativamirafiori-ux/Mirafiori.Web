-- ============================================================================
-- Timbrature — RESIDUI di ferie, festività soppresse e flessibilità
-- ----------------------------------------------------------------------------
-- Da eseguire una volta sola nel SQL editor di Supabase.
--
-- COSA CI FINISCE DENTRO
-- Ogni mese lo Studio paghe manda due estrazioni da GENIUS ("FERIE RESIDUE
-- <mese>.xls" e "FLESSIBILITA' RESIDUA <mm-aaaa>.xls"). Contengono, per ogni
-- lavoratore, le quattro grandezze che stanno anche nel riquadro ratei del
-- cedolino:
--
--               RESIDUO A.P.   MATURAZIONE A.C.   GODUTE A.C.   RESIDUO
--   FERIE          43,79            96,25            8,00        132,04
--   F.S.            0,00            17,73            0,00         17,73
--   FLES.           0,00            70,50           34,72         35,78
--
-- Il file ferie ne porta due blocchi affiancati (ferie e festività soppresse),
-- il file flessibilità uno solo. Sono le stesse cifre del cedolino, verificate
-- una per una.
--
-- TUTTO IN ORE, mai in giorni: le ferie maturano 165 h/anno, che è esattamente
-- il divisore orario mensile, e le festività soppresse 30,4 h/anno (4 giorni).
-- Chi legge questi numeri come giorni sbaglia di un fattore sette.
--
-- PERCHE' UNA TABELLA STORICA E NON TRE CAMPI IN ANAGRAFICA
-- Il residuo è una fotografia a una data: "ferie residue 132,04 h al 31/07/2026".
-- Tenuto come campo singolo sulla scheda si sovrascrive ogni mese e non si può
-- più dire quante ferie aveva quella persona a marzo — che è invece la domanda
-- che arriva quando si contesta un conteggio. Qui ogni mese aggiunge righe e
-- non cancella niente.
--
-- PERCHE' `tipo` E NON TRE GRUPPI DI COLONNE
-- Le tre voci hanno la stessa forma e la stessa unità di misura. Con una colonna
-- `tipo` aggiungere domani i R.O.L. o i permessi retribuiti è un INSERT; con
-- tre gruppi di colonne è una migrazione, un'altra query e un altro punto in cui
-- dimenticarsene.
--
-- ASSENZA NON VUOL DIRE ZERO
-- I file non coprono tutti: stagisti e parasubordinati non maturano ferie e
-- giustamente non ci sono. Quindi una riga mancante significa "non pervenuto",
-- non "residuo zero", e per questo NON si scrive nulla al posto suo: chi legge
-- deve poter distinguere i due casi.
-- ============================================================================

-- --- La matricola come la conosce GENIUS ------------------------------------
-- Serve per agganciare le estrazioni dello Studio, che non portano il codice
-- fiscale ma solo cognome e nome troncati a 26 caratteri: sui nomi non ci si
-- può agganciare, sulla matricola sì.
-- Dieci cifre: 0257 (ditta) + qualifica INPS + codice personale a 5 cifre.
alter table dipendente
  add column if not exists matricola_pulse text;

create unique index if not exists idx_dipendente_matricola_pulse
  on dipendente (matricola_pulse)
  where matricola_pulse is not null;

-- --- I residui, un mese per volta -------------------------------------------
create table if not exists residuo_mensile (
  id             serial      primary key,
  dipendente_id  int         not null references dipendente(id) on delete cascade,

  -- Primo giorno del mese di competenza (2026-07-01 per l'estrazione di luglio).
  mese           date        not null,
  -- La data che il file dichiara come riferimento (31/07/2026): la teniamo
  -- perché è quella che va scritta nero su bianco quando si comunica un residuo
  -- al lavoratore, e non sempre coincide con la fine del mese.
  al_giorno      date,

  tipo           text        not null
                  check (tipo in ('ferie', 'festivita_soppresse', 'flessibilita')),

  -- Le quattro grandezze, in ore. `residuo` è ridondante (a.p. + maturate -
  -- godute) ma lo si prende dal file e non lo si ricalcola: se un giorno non
  -- tornasse, è un segnale che vogliamo vedere, non un errore da nascondere
  -- dietro una somma nostra.
  residuo_ap     numeric,
  maturate       numeric,
  godute         numeric,
  residuo        numeric     not null,

  -- Il valore in euro dell'accantonamento, come lo calcola GENIUS. Serve al
  -- controllo di gestione, non al lavoratore.
  importo        numeric,

  -- Da quale file arriva questa riga: quando un numero verrà contestato, la
  -- prima domanda sarà "da dove viene".
  fonte          text,
  caricato_il    timestamptz not null default now(),

  -- Un solo valore per persona, mese e voce: ricaricare lo stesso file due volte
  -- aggiorna, non duplica.
  unique (dipendente_id, mese, tipo)
);

create index if not exists idx_residuo_mese on residuo_mensile (mese);
create index if not exists idx_residuo_dipendente on residuo_mensile (dipendente_id, tipo, mese desc);

-- --- L'ultimo residuo noto per ciascuno -------------------------------------
-- La domanda "quante ferie ha adesso" è la più frequente e non deve costringere
-- ogni pagina a rifare il giro del `max(mese)`.
create or replace view residuo_corrente as
select r.dipendente_id, r.tipo, r.mese, r.al_giorno, r.residuo, r.importo
from residuo_mensile r
join (
  select dipendente_id, tipo, max(mese) as mese
  from residuo_mensile
  group by dipendente_id, tipo
) ultimo
  on ultimo.dipendente_id = r.dipendente_id
 and ultimo.tipo = r.tipo
 and ultimo.mese = r.mese;
