-- ============================================================================
-- Cura Ambienti — passo 2: i Lavori
--
-- Da eseguire nel SQL editor di Supabase. Idempotente.
-- Piano: docs/cura-ambienti-piano.md
--
-- Un Lavoro è la scheda del coordinatore di Cura Ambienti: per chi (una
-- struttura → il suo centro di costo, oppure un cliente esterno), cosa,
-- preventivo e consuntivo. Le ore si dividono per figura perché la tariffa è
-- per figura (tabella `tariffa_interna`), anche se oggi le due tariffe
-- coincidono.
--
-- Gli importi NON sono salvati: si calcolano da ore × tariffa valida nel mese
-- di competenza + materiali. Un importo salvato divergerebbe alla prima ora
-- corretta. Quando il lavoro sarà addebitato (passo 3) l'importo vivrà nel
-- registro, che è l'unica fonte dei numeri.
--
-- `mese` è il mese di competenza (sempre il giorno 1): è quello che si
-- confronta con le ore timbrate su Cura Ambienti nello stesso mese.
--
-- `ricorrente` = pulizia ordinaria che si ripete ogni mese. "Prepara il mese"
-- copia i ricorrenti del mese prima con il loro consuntivo come nuovo
-- preventivo; `copiato_da` + il vincolo unico impediscono di copiarli due volte.
-- ============================================================================

begin;

create table if not exists lavoro_cura_ambienti (
  id                     uuid        primary key default gen_random_uuid(),
  numero                 int         generated always as identity,
  mese                   date        not null,
  destinatario           text        not null check (destinatario in ('struttura','esterno')),
  struttura_codice       text,
  struttura_nome         text,
  cc_codice              text        references centro_di_costo(codice),
  cliente                text,
  titolo                 text        not null check (length(trim(titolo)) > 0),
  descrizione            text,
  ricorrente             boolean     not null default false,
  copiato_da             uuid        references lavoro_cura_ambienti(id) on delete set null,
  stato                  text        not null default 'bozza'
                          check (stato in ('bozza','preventivato','in_corso','consuntivato','addebitato','annullato')),

  prev_ore_pulizie       numeric(7,2) not null default 0 check (prev_ore_pulizie >= 0),
  prev_ore_manutenzione  numeric(7,2) not null default 0 check (prev_ore_manutenzione >= 0),
  prev_materiali         numeric(10,2) not null default 0 check (prev_materiali >= 0),

  cons_ore_pulizie       numeric(7,2) check (cons_ore_pulizie >= 0),
  cons_ore_manutenzione  numeric(7,2) check (cons_ore_manutenzione >= 0),
  cons_materiali         numeric(10,2) check (cons_materiali >= 0),
  note_consuntivo        text,

  -- Visto facoltativo del coordinatore della struttura sul preventivo.
  visto_da               text,
  visto_il               timestamptz,

  creato_da              text        not null,
  creato_il              timestamptz not null default now(),
  aggiornato_da          text,
  aggiornato_il          timestamptz not null default now(),
  consuntivato_da        text,
  consuntivato_il        timestamptz,

  constraint lavoro_ca_mese_chk check (extract(day from mese) = 1),
  constraint lavoro_ca_destinatario_chk check (
    (destinatario = 'struttura' and cc_codice is not null and cliente is null) or
    (destinatario = 'esterno'   and cliente is not null and length(trim(cliente)) > 0 and cc_codice is null)
  ),
  -- Un consuntivo si chiude solo con le ore scritte (anche zero, ma scritte).
  constraint lavoro_ca_consuntivo_chk check (
    stato not in ('consuntivato','addebitato') or
    (cons_ore_pulizie is not null and cons_ore_manutenzione is not null and cons_materiali is not null)
  ),
  unique (copiato_da, mese)
);

create index if not exists lavoro_ca_mese_idx on lavoro_cura_ambienti (mese);
create index if not exists lavoro_ca_cc_idx   on lavoro_cura_ambienti (cc_codice, mese);

comment on table lavoro_cura_ambienti is
  'Lavori di Cura Ambienti (cc24): preventivo e consuntivo per struttura o cliente esterno. Importi calcolati da ore × tariffa_interna + materiali.';

alter table lavoro_cura_ambienti enable row level security;

commit;
