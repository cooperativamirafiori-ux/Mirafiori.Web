-- ============================================================================
-- Addebiti interni — costo esterno, senza servizio di partenza (13/11/2026)
--
-- Dennis: «può succedere che si facciano dei bonifici senza fattura e devono
-- essere allocati». Un addebito con cc_da NULL è un costo esterno attribuito a
-- un servizio: nel cruscotto pesa solo su chi lo riceve (come costo diretto),
-- nessuno lo "recupera". Solo chi ha "Controllo di Gestione" lo scrive.
-- Niente ore (il forfait vale per il lavoro di un servizio): solo altri costi.
-- Idempotente.
-- ============================================================================

alter table addebito_interno alter column cc_da drop not null;

-- Un costo esterno è sempre scritto a mano.
alter table addebito_interno drop constraint if exists addebito_interno_esterno_chk;
alter table addebito_interno add constraint addebito_interno_esterno_chk check (
  cc_da is not null or (origine_tipo = 'manuale' and ore = 0)
);
