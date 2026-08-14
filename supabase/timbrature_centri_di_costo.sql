-- ============================================================================
-- Timbrature — i servizi diventano centri di costo veri
--
-- Da eseguire nel SQL editor di Supabase. Idempotente: rieseguirlo non fa nulla.
--
-- COSA CAMBIA
--   L'elenco dei servizi ricalca la lista Centri di Costo di SharePoint: 21
--   voci una-a-una con il loro centro di costo, più due eccezioni volute:
--     · l'educativa territoriale si spacca in sei voci Nord/Sud, perché chi
--       timbra sa in quale zona ha lavorato ma non saprebbe dire il centro di
--       costo. Nord → cc15, Sud + Mirafleming → cc16.
--     · Amministrazione e Progettazione restano separate pur finendo entrambe
--       in cc23: è una distinzione che l'ufficio usa già.
--   Totale: 29 voci di lavoro + 8 giustificativi.
--
-- ATTENZIONE ALLA COLONNA `centro_costo`
--   Esiste già ma NON è un centro di costo: è il macro-raggruppamento del
--   vecchio foglio ore Excel (1=Interni, 2=Sanitari/ASL, 3=Cultura,
--   4=Educativi/sociali, 5=Altri, 99=Giustificativi). Qui NON viene toccata:
--   il codice in produzione la legge ancora. Si toglierà con una seconda
--   migrazione, dopo il deploy — vedi in fondo.
--
-- IL LEGAME CON SHAREPOINT
--   Si aggancia per CODICE (cc1…cc23) e non per id: SharePoint e Supabase sono
--   due database distinti e l'id dell'uno non significa niente nell'altro.
--   `centro_costo_nome` è una copia dell'etichetta, per il foglio ore; se in
--   ufficio rinominano un centro di costo, si riallinea con lo script di sync.
--
-- LO STORICO
--   Le timbrature già inserite puntano al servizio per id, quindi rinominare
--   non rompe niente. I servizi che spariscono dal menù vengono SPENTI
--   (attivo = false), non cancellati: le prove fatte finora continuano a
--   mostrare un nome invece di un buco.
-- ============================================================================

begin;

-- --- 1. colonne nuove -------------------------------------------------------
alter table servizio add column if not exists centro_costo_codice text;
alter table servizio add column if not exists centro_costo_nome   text;

-- --- 2. rinomine dei servizi che restano ------------------------------------
-- Si aggiorna la riga esistente invece di crearne una nuova: così le
-- timbrature già inserite restano attaccate al loro servizio.
-- La guardia `not exists` rende l'operazione ripetibile senza violare l'unique.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('UFFICIO',                               'Amministrazione'),
      ('PROGETTAZIONE',                         'Progettazione'),
      ('ASL TO5',                               'Educativa Sanitaria ASL TO5'),
      ('CENTRO DIURNO CASA OZ',                 'Interventi CDSR Fondazione OZ'),
      ('COSMICA2',                              'CRP CO.S.MI.C.A'),
      ('PROGETTO PONTE',                        'Progetto Ponte'),
      ('PROGETTO TOC TOC',                      'Toc Toc Roberto'),
      ('PSICHIATRIA ADULTI',                    'Salute Mentale ASL TO'),
      ('CPG',                                   'CPG Torino'),
      ('CARELEAVERS',                           'Care Leavers'),
      ('CASA ARTEMISIA',                        'Casa Artemisia'),
      ('CENTRO ANTIVIOLENZA IN RETE',           'CAV In Rete'),
      ('CISA 12',                               'CISA 12 Nichelino'),
      ('CONDOMINIO SOLIDALE VIA GESSI',         'Condominio Solidale'),
      ('COMUNITÀ GIULIA',                       'CER Giulia'),
      ('MIRAFLEMING',                           'Mirafleming'),
      ('SCAT.TO VIA COGGIOLA/STR. DEL DROSSO',  'SCAT.TO abitare'),
      ('LOCANDA',                               'La Locanda nel Parco'),
      ('PROGETTI TIROCINI',                     'Scat.to Orientamento lavoro')
    ) as t(vecchio, nuovo)
  loop
    update servizio
       set nome = r.nuovo
     where nome = r.vecchio
       and not exists (select 1 from servizio s2 where s2.nome = r.nuovo);
  end loop;
end $$;

-- --- 3. i 29 servizi di lavoro ----------------------------------------------
-- `ordine` segue l'ordine dei centri di costo (cc1 = 10 … cc23 = 230), con i
-- decimali di coda per le voci che condividono lo stesso centro di costo.
insert into servizio (nome, centro_costo, centro_costo_codice, centro_costo_nome, categoria, tipo_voce, ordine, attivo) values
  ('Scat.to Orientamento lavoro',   5, 'cc1',  'Scat.to Orientamento lavoro',      'Lavoro',                'lavoro',  10, true),
  ('La Locanda nel Parco',          5, 'cc2',  'La Locanda nel Parco',             'Ristorazione',          'lavoro',  20, true),
  ('Una Serra per Mirafiori',       5, 'cc3',  'Una Serra per Mirafiori',          'Ristorazione',          'lavoro',  30, true),
  ('CAV In Rete',                   4, 'cc4',  'CAV In Rete',                      'Pari opportunità',      'lavoro',  40, true),
  ('Casa Artemisia',                4, 'cc5',  'Casa Artemisia',                   'Pari opportunità',      'lavoro',  50, true),
  ('Toc Toc Roberto',               4, 'cc6',  'Toc Toc Roberto',                  'Pari opportunità',      'lavoro',  60, true),
  ('CPG Torino',                    3, 'cc7',  'CPG Torino',                       'Area Socio-Culturale',  'lavoro',  70, true),
  ('MirArte',                       3, 'cc8',  'MirArte',                          'Area Socio-Culturale',  'lavoro',  80, true),
  ('CRP CO.S.MI.C.A',               2, 'cc9',  'CRP CO.S.MI.C.A',                  'Area Socio Sanitaria',  'lavoro',  90, true),
  ('Salute Mentale ASL TO',         2, 'cc10', 'Salute Mentale ASL TO',            'Area Socio Sanitaria',  'lavoro', 100, true),
  ('Educativa Sanitaria ASL TO5',   2, 'cc11', 'Educativa Sanitaria ASL TO5',      'Area Socio Sanitaria',  'lavoro', 110, true),
  ('Interventi CDSR Fondazione OZ', 2, 'cc12', 'Interventi CDSR Fondazione OZ',    'Area Socio Sanitaria',  'lavoro', 120, true),
  ('Progetto Ponte',                2, 'cc13', 'Progetto Ponte',                   'Area Socio Sanitaria',  'lavoro', 130, true),
  ('CER Giulia',                    4, 'cc14', 'CER Giulia',                       'Area Educativa',        'lavoro', 140, true),

  -- Educativa territoriale Nord → un solo centro di costo, tre voci di menù
  ('Educativa Comunità Nord',       4, 'cc15', 'Ed. amb. Nord',                    'Area Educativa',        'lavoro', 150, true),
  ('IET/IEPD Nord',                 4, 'cc15', 'Ed. amb. Nord',                    'Area Educativa',        'lavoro', 151, true),
  ('Specialistica Nord',            4, 'cc15', 'Ed. amb. Nord',                    'Area Educativa',        'lavoro', 152, true),

  -- Educativa territoriale Sud → un solo centro di costo, quattro voci di menù
  ('Educativa Comunità Sud',        4, 'cc16', 'Ed. amb. Sud',                     'Area Educativa',        'lavoro', 160, true),
  ('IET/IEPD Sud',                  4, 'cc16', 'Ed. amb. Sud',                     'Area Educativa',        'lavoro', 161, true),
  ('Specialistica Sud',             4, 'cc16', 'Ed. amb. Sud',                     'Area Educativa',        'lavoro', 162, true),
  ('Mirafleming',                   4, 'cc16', 'Ed. amb. Sud',                     'Area Educativa',        'lavoro', 163, true),

  ('SCAT.TO abitare',               4, 'cc17', 'SCAT.TO abitare',                  'Area Autonomie',        'lavoro', 170, true),
  ('Condominio Solidale',           4, 'cc18', 'Condominio Solidale',              'Area Autonomie',        'lavoro', 180, true),
  ('Care Leavers',                  4, 'cc19', 'Care Leavers',                     'Area Autonomie',        'lavoro', 190, true),
  ('CISA 12 Nichelino',             4, 'cc20', 'CISA 12 Nichelino',                'Area Autonomie',        'lavoro', 200, true),
  ('Pian della Mussa',              5, 'cc21', 'Pian della Mussa',                 'Ricettività',           'lavoro', 210, true),
  ('Amazing',                       5, 'cc22', 'Amazing',                          'Commercio',             'lavoro', 220, true),

  -- Ufficio e progettazione: due voci, un solo centro di costo
  ('Amministrazione',               1, 'cc23', 'Progettazione - Amministrazione',  'Servizi Generali',      'lavoro', 230, true),
  ('Progettazione',                 1, 'cc23', 'Progettazione - Amministrazione',  'Servizi Generali',      'lavoro', 231, true)
on conflict (nome) do update set
  centro_costo_codice = excluded.centro_costo_codice,
  centro_costo_nome   = excluded.centro_costo_nome,
  categoria           = excluded.categoria,
  tipo_voce           = excluded.tipo_voce,
  ordine              = excluded.ordine,
  attivo              = true;

-- --- 4. i servizi che escono dal menù ---------------------------------------
-- Spenti, non cancellati: le timbrature di prova continuano a risolvere il
-- nome. Se domani servisse riaccenderne uno, è una riga di SQL.
--   BIBLIOTECHE / MUSEI          → confluiscono in MirArte
--   CUAV                         → confluisce in Toc Toc Roberto
--   SANITARIA TORINO             → confluisce in Salute Mentale ASL TO
--   IET/IEPD, ED. SPEC. SCUOLE   → sostituiti dalle voci Nord/Sud
update servizio
   set attivo = false
 where nome in (
   'BIBLIOTECHE',
   'MUSEI',
   'CUAV',
   'SANITARIA TORINO',
   'IET/IEPD',
   'EDUCATIVA SPECIALISTICA SCUOLE'
 );

-- --- 5. giustificativi in fondo al menù -------------------------------------
-- Avevano ordine 90-97, che ora si scontra con i servizi di lavoro (10-231).
update servizio
   set ordine = ordine + 900
 where tipo_voce = 'giustificativo'
   and ordine < 900;

commit;

-- ------------------------------------------------------------------ verifica
-- Attesi: 29 servizi di lavoro attivi, 8 giustificativi, 6 servizi spenti.
select tipo_voce, attivo, count(*)
  from servizio
 group by tipo_voce, attivo
 order by tipo_voce, attivo;

-- Il menù come lo vedrà chi timbra:
select ordine, nome, centro_costo_codice, centro_costo_nome, categoria
  from servizio
 where attivo and tipo_voce = 'lavoro'
 order by ordine;

-- Nessun servizio di lavoro attivo deve restare senza centro di costo:
select nome from servizio
 where attivo and tipo_voce = 'lavoro' and centro_costo_codice is null;

-- ============================================================================
-- DOPO IL DEPLOY DEL CODICE, e solo allora:
--
--   alter table servizio rename column centro_costo to macro_gruppo;
--
-- Finché l'app in produzione legge `centro_costo`, rinominarla la rompe.
-- ============================================================================
