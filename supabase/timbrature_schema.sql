-- ============================================================================
-- Sezione TIMBRATURE — schema Supabase (PostgreSQL)
-- ----------------------------------------------------------------------------
-- Da eseguire nel SQL editor del progetto Supabase (una volta sola).
-- L'app accede a queste tabelle SOLO lato server con la service role key,
-- quindi la RLS resta disattivata (l'autorizzazione è mediata da next-auth +
-- guardArea nelle API route). Se un domani si volesse accesso diretto dal
-- client, attivare RLS e scrivere le policy per email.
--
-- Convenzioni:
--   * ore SENZA arrotondamento (numeric, valore esatto)
--   * il servizio determina il centro di costo (1-5 = lavoro, 99 = giustificativi)
--   * finestra correzioni fino al 5 del mese successivo; poi chiusura HR
-- ============================================================================

-- --- Anagrafica servizi / centri di costo -----------------------------------
create table if not exists servizio (
  id            serial primary key,
  nome          text        not null unique,
  centro_costo  int         not null,               -- 1,2,3,4,5 oppure 99
  categoria     text,                               -- etichetta leggibile
  tipo_voce     text        not null default 'lavoro'
                 check (tipo_voce in ('lavoro','giustificativo')),
  attivo        boolean     not null default true,
  ordine        int         not null default 100    -- per ordinamento in UI
);

-- --- Specchio minimale dei dipendenti (chiave = email Microsoft 365) ---------
create table if not exists dipendente (
  id               serial primary key,
  email            text     not null unique,
  cognome_nome     text     not null,
  referente_email  text,
  attivo           boolean  not null default true
);

-- --- Monte ore settimanale, gestito SOLO da HR, con decorrenza ---------------
create table if not exists profilo_orario (
  id             serial primary key,
  dipendente_id  int      not null references dipendente(id) on delete cascade,
  decorrenza     date     not null,                 -- da quando vale
  ore_lun        numeric  not null default 0,
  ore_mar        numeric  not null default 0,
  ore_mer        numeric  not null default 0,
  ore_gio        numeric  not null default 0,
  ore_ven        numeric  not null default 0,
  ore_sab        numeric  not null default 0,
  ore_dom        numeric  not null default 0,
  aggiornato_da  text,                              -- email HR
  aggiornato_il  timestamptz not null default now(),
  unique (dipendente_id, decorrenza)
);

-- --- La riga ore: unità atomica del sistema ---------------------------------
create table if not exists timbratura (
  id             uuid        primary key default gen_random_uuid(),
  dipendente_id  int         not null references dipendente(id) on delete cascade,
  data           date        not null,
  servizio_id    int         not null references servizio(id),
  tipo_voce      text        not null default 'lavoro'
                  check (tipo_voce in ('lavoro','giustificativo')),
  -- Voce di lavoro: ingresso e uscita OBBLIGATORI (le ore sono derivate).
  -- Giustificativo: nessun orario, occupa il monte ore atteso del giorno.
  ora_inizio     time,
  ora_fine       time,
  -- ore esatte, senza arrotondamento; per il giustificativo si valorizza a monte-ore
  ore            numeric     not null default 0,
  notte          boolean     not null default false,
  mutua          boolean     not null default false,
  note           text,
  creata_da      text,                              -- email di chi ha inserito
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint timbratura_orari_coerenti check (
    (tipo_voce = 'lavoro'         and ora_inizio is not null and ora_fine is not null) or
    (tipo_voce = 'giustificativo' and ora_inizio is null     and ora_fine is null)
  )
);

create index if not exists idx_timbratura_dip_data on timbratura (dipendente_id, data);
create index if not exists idx_timbratura_data       on timbratura (data);
create index if not exists idx_timbratura_servizio   on timbratura (servizio_id);

-- --- Stato di chiusura del mese per singolo dipendente -----------------------
create table if not exists chiusura_mese (
  id             serial       primary key,
  dipendente_id  int          not null references dipendente(id) on delete cascade,
  anno           int          not null,
  mese           int          not null,             -- 1-12
  stato          text         not null default 'aperto'
                  check (stato in ('aperto','chiuso')),
  chiuso_da      text,
  chiuso_il      timestamptz,
  file_url       text,                              -- foglio ore nella cartella personale
  unique (dipendente_id, anno, mese)
);

-- trigger updated_at su timbratura
create or replace function _touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_timbratura_touch on timbratura;
create trigger trg_timbratura_touch before update on timbratura
  for each row execute function _touch_updated_at();

-- ============================================================================
-- SEED servizi / centri di costo (dal foglio "Dati" di Foglio ore_vs1.4.xlsx)
-- ============================================================================
insert into servizio (nome, centro_costo, categoria, tipo_voce, ordine) values
  ('UFFICIO',                               1, 'Interni',            'lavoro', 10),
  ('PROGETTAZIONE',                         1, 'Interni',            'lavoro', 11),
  ('ASL TO5',                               2, 'Sanitari / ASL',     'lavoro', 20),
  ('CENTRO DIURNO CASA OZ',                 2, 'Sanitari / ASL',     'lavoro', 21),
  ('COSMICA2',                              2, 'Sanitari / ASL',     'lavoro', 22),
  ('PROGETTO PONTE',                        2, 'Sanitari / ASL',     'lavoro', 23),
  ('PROGETTO TOC TOC',                      2, 'Sanitari / ASL',     'lavoro', 24),
  ('PSICHIATRIA ADULTI',                    2, 'Sanitari / ASL',     'lavoro', 25),
  ('SANITARIA TORINO',                      2, 'Sanitari / ASL',     'lavoro', 26),
  ('BIBLIOTECHE',                           3, 'Cultura',            'lavoro', 30),
  ('CPG',                                   3, 'Cultura',            'lavoro', 31),
  ('MUSEI',                                 3, 'Cultura',            'lavoro', 32),
  ('CARELEAVERS',                           4, 'Educativi / sociali','lavoro', 40),
  ('CASA ARTEMISIA',                        4, 'Educativi / sociali','lavoro', 41),
  ('CENTRO ANTIVIOLENZA IN RETE',           4, 'Educativi / sociali','lavoro', 42),
  ('CISA 12',                               4, 'Educativi / sociali','lavoro', 43),
  ('CONDOMINIO SOLIDALE VIA GESSI',         4, 'Educativi / sociali','lavoro', 44),
  ('COMUNITÀ GIULIA',                       4, 'Educativi / sociali','lavoro', 45),
  ('CUAV',                                  4, 'Educativi / sociali','lavoro', 46),
  ('EDUCATIVA SPECIALISTICA SCUOLE',        4, 'Educativi / sociali','lavoro', 47),
  ('IET/IEPD',                              4, 'Educativi / sociali','lavoro', 48),
  ('MIRAFLEMING',                           4, 'Educativi / sociali','lavoro', 49),
  ('SCAT.TO VIA COGGIOLA/STR. DEL DROSSO',  4, 'Educativi / sociali','lavoro', 50),
  ('LOCANDA',                               5, 'Altri',              'lavoro', 60),
  ('PROGETTI TIROCINI',                     5, 'Altri',              'lavoro', 61),
  ('Congedo parentale',                    99, 'Giustificativi',     'giustificativo', 90),
  ('Ferie',                                99, 'Giustificativi',     'giustificativo', 91),
  ('Fless',                                99, 'Giustificativi',     'giustificativo', 92),
  ('Fest.Sopp.',                           99, 'Giustificativi',     'giustificativo', 93),
  ('Formazione',                           99, 'Giustificativi',     'giustificativo', 94),
  ('Permessi retribuiti',                  99, 'Giustificativi',     'giustificativo', 95),
  ('Permessi NON retribuiti',              99, 'Giustificativi',     'giustificativo', 96),
  ('Legge 104',                            99, 'Giustificativi',     'giustificativo', 97)
on conflict (nome) do nothing;
