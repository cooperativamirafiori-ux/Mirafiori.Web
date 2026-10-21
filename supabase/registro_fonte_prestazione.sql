-- Registro analitico: nuova fonte 'prestazione_occasionale' (21 ott 2026).
-- La prestazione occasionale scrive la sua riga di costo quando arriva la
-- notula (importo lordo definitivo), sul centro di costo della pratica.
alter table public.movimento drop constraint if exists movimento_fonte_check;
alter table public.movimento add constraint movimento_fonte_check check (fonte in (
  'acquisto','manutenzione','costo_diretto','lavoro',
  'fattura_passiva','spesa_dichiarata','spesa_carta',
  'fattura_attiva','convenzione','contributo','incasso',
  'uscita_manuale','manuale','prestazione_occasionale'
));
