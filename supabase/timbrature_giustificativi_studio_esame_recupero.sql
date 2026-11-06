-- ============================================================================
-- Timbrature — tre nuovi giustificativi (06/11/2026)
-- ----------------------------------------------------------------------------
-- Richiesti da Stefania Melissari (Permesso studio, Permesso esame) e
-- Cinzia Mosca (Recupero festività) il 05/11/2026.
-- Tutti e tre ammettono anche la fascia oraria (ad_ore = true): il toggle
-- "Giornata intera / Alcune ore" resta, la giornata intera è sempre possibile.
-- Recupero festività NON è Fest.Sopp. (ex festività soppresse con residuo da
-- cedolino): è il riposo compensativo per un festivo lavorato, senza residuo.
--
-- GIÀ APPLICATA in produzione il 06/11/2026 (id 69, 70, 71).
-- Idempotente: si può rieseguire senza effetti.
-- ============================================================================

insert into servizio (nome, centro_costo, categoria, tipo_voce, ordine, ad_ore) values
  ('Permesso studio',     99, 'Giustificativi', 'giustificativo', 998,  true),
  ('Permesso esame',      99, 'Giustificativi', 'giustificativo', 999,  true),
  ('Recupero festività',  99, 'Giustificativi', 'giustificativo', 1000, true)
on conflict (nome) do nothing;
