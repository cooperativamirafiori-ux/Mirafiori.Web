-- Giornata di reperibilità (ottobre 2026)
--
-- Una spunta per GIORNATA, non per riga di ore: la persona dichiara di essere
-- stata reperibile anche se quel giorno non ha lavorato nemmeno un'ora. Non
-- incide su nessun conteggio (ore attese, coperte, flessibilita'): le HR la
-- vedono nel riepilogo e liquidano un rimborso forfettario per ogni giornata.
--
-- NON sostituisce la spunta `timbratura.reperibilita` sulla riga di lavoro, che
-- resta e vuol dire un'altra cosa: chiamato in servizio durante la reperibilita'
-- (pagamento maggiorato). Qui: ero reperibile quel giorno (forfait).
-- Il travaso qui sotto (05/10/2026) ha copiato l'unica riga spuntata come giornata.
--
-- Regole di scrittura (in lib/timbrature/reperibilita.ts, non nel DB):
--   - il dipendente: stessa finestra delle ore di lavoro, oggi + 2 giorni prima;
--   - responsabile/HR: per conto, finche' il foglio non e' validato.

create table if not exists giornata_reperibilita (
  dipendente_id integer not null references dipendente(id) on delete cascade,
  data          date    not null,
  per_conto     boolean not null default false,
  creata_da     text,
  creata_il     timestamptz not null default now(),
  primary key (dipendente_id, data)
);

comment on table giornata_reperibilita is
  'Giornate dichiarate di reperibilita''. Nessun effetto sulle ore: serve alle HR per il forfait giornaliero.';

-- Come le altre tabelle: si accede solo dal server con la service role.
alter table giornata_reperibilita enable row level security;

-- Travaso delle spunte gia' messe sulle righe di lavoro.
insert into giornata_reperibilita (dipendente_id, data, per_conto, creata_da)
select distinct on (dipendente_id, data) dipendente_id, data, coalesce(per_conto, false), creata_da
  from timbratura
 where reperibilita
 order by dipendente_id, data
on conflict do nothing;
