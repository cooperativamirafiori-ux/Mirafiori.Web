-- ============================================================================
-- Timbrature — correzione ortografica dei nomi dei servizi
--
-- Da eseguire nel SQL editor di Supabase, dopo `timbrature_reset_orari.sql`.
--
-- Le timbrature puntano al servizio per `id`, non per nome: rinominare non
-- rompe nulla e vale anche a tabella già popolata. Il nome corretto si propaga
-- da sé a foglio ore, rendicontazione per centro di costo e menù dell'app.
--
-- Idempotente: rieseguirlo non fa nulla (le WHERE non trovano più niente).
-- ============================================================================

begin;

-- ------------------------------------------------------- 1. errore di battitura
-- "CODOMINIO" → "CONDOMINIO" (manca la N)
update servizio
   set nome = 'CONDOMINIO SOLIDALE VIA GESSI'
 where nome = 'CODOMINIO SOLIDALE VIA GESSI';

-- ----------------------------------------------- 2. accento al posto dell'apostrofo
-- "COMUNITA' GIULIA" → "COMUNITÀ GIULIA".
-- L'apostrofo finale è la vecchia convenzione da macchina da scrivere; il
-- database è UTF-8 e la À maiuscola accentata non dà problemi.
-- Se preferisci lasciare l'apostrofo, salta questo blocco.
update servizio
   set nome = 'COMUNITÀ GIULIA'
 where nome = 'COMUNITA'' GIULIA';

commit;

-- ------------------------------------------------------------------- verifica
-- Attese: 2 righe, con i nomi corretti.
select id, nome, centro_costo, categoria, ordine
  from servizio
 where nome in ('CONDOMINIO SOLIDALE VIA GESSI', 'COMUNITÀ GIULIA')
 order by ordine;
