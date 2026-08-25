-- ============================================================================
-- Timbrature — PROGETTI (agosto 2026)
-- ----------------------------------------------------------------------------
-- Da eseguire una volta sola nel SQL editor di Supabase.
--
-- Il problema: chi timbra su PROGETTAZIONE finisce tutto su un unico centro di
-- costo (cc23 Progettazione - Amministrazione) e le ore dei singoli progetti
-- diventano indistinguibili. Il centro di costo resta uno — va bene cosi' —
-- ma serve sapere quante ore vanno su ogni progetto.
--
-- La scelta: NON si moltiplicano i servizi (PROGETTAZIONE - Impatto,
-- PROGETTAZIONE - Serigrafia, ...). Il progetto e' una SECONDA dimensione
-- della riga, indipendente dal servizio:
--   * il servizio dice "che lavoro e'" e porta il centro di costo;
--   * il progetto dice "per quale bando/commessa", e serve alla rendicontazione.
-- Cosi' "tutta la progettazione" resta una somma sola, e i progetti si
-- aggiungono e si chiudono senza toccare l'anagrafica dei servizi.
--
-- Il campo e' FACOLTATIVO: esiste progettazione non imputabile a un progetto
-- singolo, e una riga senza progetto e' un dato legittimo, non un buco.
-- ============================================================================

-- --- Anagrafica progetti -----------------------------------------------------
create table if not exists progetto (
  id      serial  primary key,
  nome    text    not null unique,
  attivo  boolean not null default true,
  ordine  int     not null default 100,
  note    text
);

-- --- La riga di ore porta anche il progetto (nullable) -----------------------
alter table timbratura
  add column if not exists progetto_id int references progetto(id);

create index if not exists idx_timbratura_progetto on timbratura (progetto_id);

-- --- Quali servizi chiedono il progetto -------------------------------------
-- Una spunta sul servizio, non un elenco scritto nel codice: domani un altro
-- servizio potra' chiedere il progetto con una sola UPDATE.
alter table servizio
  add column if not exists chiede_progetto boolean not null default false;

update servizio set chiede_progetto = true where upper(nome) = 'PROGETTAZIONE';

-- --- SEED: i progetti attivi -------------------------------------------------
insert into progetto (nome, ordine) values
  ('Impatto',                  10),
  ('Organizziamo la speranza', 20),
  ('Serigrafia',               30),
  ('Piazza Ragazzabile',       40),
  ('Risalto Fermi',            50),
  ('Risalto Mirafiori',        60),
  ('Nuove Forme',              70)
on conflict (nome) do nothing;

-- --- Verifica ----------------------------------------------------------------
select nome, attivo, ordine from progetto order by ordine;
select nome, chiede_progetto from servizio where chiede_progetto;
