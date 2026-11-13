-- ============================================================================
-- Timbrature — giustificativo "Visita medica del lavoro" (13/11/2026)
-- ----------------------------------------------------------------------------
-- Ammette anche la fascia oraria (ad_ore = true): resta il toggle
-- "Giornata intera / Alcune ore".
--
-- GIA APPLICATA in produzione il 13/11/2026 (id 72).
-- Idempotente: si puo rieseguire senza effetti.
-- ============================================================================

insert into servizio (nome, centro_costo, categoria, tipo_voce, ordine, ad_ore) values
  ('Visita medica del lavoro', 99, 'Giustificativi', 'giustificativo', 1001, true)
on conflict (nome) do nothing;
