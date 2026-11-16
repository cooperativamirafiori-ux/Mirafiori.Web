-- Cura Ambienti — ricorrenza "Ogni due settimane" (16/11/2026, richiesta di
-- Marika Armandi: es. ufficio Strada del Drosso pulito ogni 15 giorni).
--
-- Un quindicinale ha bisogno di una data di partenza: senza, non si sa se in
-- un mese le volte sono 2 o 3. `prima_data` è la prima pulizia; il giorno
-- della settimana è il suo, e si tiene in giorno_settimana per mostrarlo.
--
-- Compatibile all'indietro: colonna facoltativa, vincoli solo allargati.

alter table public.ricorrenza_cura_ambienti
  add column if not exists prima_data date;

alter table public.ricorrenza_cura_ambienti
  drop constraint if exists ricorrenza_cura_ambienti_frequenza_check,
  drop constraint if exists ricorrenza_giorno_chk,
  drop constraint if exists ricorrenza_prima_data_chk;

alter table public.ricorrenza_cura_ambienti
  add constraint ricorrenza_cura_ambienti_frequenza_check
    check (frequenza in ('mensile', 'settimanale', 'quindicinale')),
  add constraint ricorrenza_giorno_chk
    check ((frequenza in ('settimanale', 'quindicinale')) = (giorno_settimana is not null)),
  add constraint ricorrenza_prima_data_chk
    check ((frequenza = 'quindicinale') = (prima_data is not null));
