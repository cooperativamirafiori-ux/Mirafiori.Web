-- Assistente "?" dell'app (30 ott 2026) — vedi lib/assistente/registro.ts
--
-- Registro ANONIMO delle domande + contatore giornaliero per persona, in due
-- tabelle separate e non collegate: dal registro non si risale a chi ha chiesto.

create table if not exists assistente_domanda (
  id         bigint generated always as identity primary key,
  creata_il  timestamptz not null default now(),
  pagina     text,
  domanda    text not null,
  risposta   text not null,
  utile      boolean,
  modello    text,
  token_in   integer,
  token_out  integer
);

create index if not exists assistente_domanda_creata_il on assistente_domanda (creata_il desc);

-- `chi` è un'impronta che cambia ogni giorno (sha256 di mail + giorno + segreto).
create table if not exists assistente_uso (
  chi        text not null,
  giorno     date not null,
  conteggio  integer not null default 0,
  primary key (chi, giorno)
);

-- Solo il server (service role) ci scrive: niente accesso dal browser.
alter table assistente_domanda enable row level security;
alter table assistente_uso enable row level security;

-- Aggiunge una domanda al contatore di oggi e restituisce il totale.
-- Intanto butta i contatori di più di 7 giorni fa: non servono a niente.
create or replace function assistente_conta(p_chi text, p_giorno date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  delete from assistente_uso where giorno < p_giorno - 7;
  insert into assistente_uso (chi, giorno, conteggio)
  values (p_chi, p_giorno, 1)
  on conflict (chi, giorno) do update set conteggio = assistente_uso.conteggio + 1
  returning conteggio into n;
  return n;
end;
$$;

-- Solo il server la chiama: niente esecuzione dal browser.
revoke execute on function assistente_conta(text, date) from public, anon, authenticated;
