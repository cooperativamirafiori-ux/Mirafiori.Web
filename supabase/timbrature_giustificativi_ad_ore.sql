-- ============================================================================
-- Timbrature — giustificativi "ad ore"
-- ----------------------------------------------------------------------------
-- Ferie, Flessibilità, Congedo parentale, Legge 104 e Permessi retribuiti
-- potevano essere presi solo a giornata intera (occupano tutto il monte ore
-- atteso del giorno). Con questa migrazione possono anche essere presi per
-- una fascia oraria (dalle-alle), esattamente come le ore di lavoro: le ore
-- si continuano a calcolare dagli orari, mai a digitarle a mano.
--
-- Idempotente: si può rieseguire senza effetti collaterali.
-- Da eseguire una volta nel SQL editor del progetto Supabase.
-- ============================================================================

-- 1) flag sul servizio: quali giustificativi ammettono l'inserimento a ore
alter table servizio add column if not exists ad_ore boolean not null default false;

-- 2) assicura che le 5 voci esistano e siano marcate ad_ore = true
--    (se già presenti dal seed originale, aggiorna solo il flag)
insert into servizio (nome, centro_costo, categoria, tipo_voce, ordine, ad_ore) values
  ('Congedo parentale',    99, 'Giustificativi', 'giustificativo', 90, true),
  ('Ferie',                99, 'Giustificativi', 'giustificativo', 91, true),
  ('Flessibilità',         99, 'Giustificativi', 'giustificativo', 92, true),
  ('Permessi retribuiti',  99, 'Giustificativi', 'giustificativo', 95, true),
  ('Legge 104',            99, 'Giustificativi', 'giustificativo', 97, true)
on conflict (nome) do update set ad_ore = excluded.ad_ore;

-- 3) rilassa il vincolo sugli orari: un giustificativo può averli (ore
--    parziali) oppure no (giornata intera, comportamento invariato);
--    una voce di lavoro li richiede sempre entrambi.
alter table timbratura drop constraint if exists timbratura_orari_coerenti;
alter table timbratura add constraint timbratura_orari_coerenti check (
  (ora_inizio is null) = (ora_fine is null)
  and (tipo_voce <> 'lavoro' or (ora_inizio is not null and ora_fine is not null))
);
