-- ============================================================================
-- CONTROLLO DI GESTIONE · Fondamenta — schema del registro analitico
-- ----------------------------------------------------------------------------
-- Da eseguire nel SQL editor del progetto Supabase, DOPO pagamenti_schema.sql
-- e uscite_manuali.sql. È idempotente: rieseguirla non fa danno.
--
-- Fonte delle decisioni: docs/controllo-di-gestione-piano.md
--   § Principi · § Schema Supabase · § Attribuzione · § Tesoreria · § Budget
-- Riepilogo operativo e messa in funzione: docs/registro-fondamenta.md
--
-- L'app accede a queste tabelle SOLO lato server con la service role key: la
-- RLS resta disattivata, l'autorizzazione è mediata da next-auth e dai guard
-- (lib/pagamenti/guard.ts oggi, lib/gestione/guard.ts quando ci sarà).
--
-- ----------------------------------------------------------------------------
-- LE CINQUE REGOLE CHE QUESTO SCHEMA FA RISPETTARE
--
--   1. Un registro solo. Costi e ricavi finiscono tutti in `movimento`, nella
--      stessa forma. Cruscotti, report, budget e alert leggono solo da lì.
--
--   2. Il registro si alimenta dai documenti, mai dalla banca. I movimenti
--      bancari appaiano e valorizzano `data_cassa`; non generano mai un
--      movimento. Insieme al vincolo di unicità su (origine_tipo, origine_id,
--      cc_codice) è questo che rende il doppio conteggio impossibile per
--      costruzione, invece di qualcosa da riconoscere a posteriori.
--
--   3. Ogni riga del registro dice da dove viene e quanto ci si può credere.
--      `origine_tipo` + `origine_id` non sono facoltativi (senza, il vincolo di
--      unicità non vale nulla: in PostgreSQL due NULL non sono uguali e lo
--      stesso documento rientrerebbe infinite volte) e `confidenza` dice se il
--      centro di costo è un fatto o una convenzione.
--
--   4. Il centro di costo esiste per davvero. `centro_di_costo` è lo specchio
--      della lista SharePoint e ogni riferimento è una foreign key: un codice
--      storpiato non passa. Prima si sbagliava in silenzio, e un importo
--      sbagliato che sembra giusto è l'errore peggiore, perché nessuno lo cerca.
--
--   5. La competenza non è la cassa. `data_competenza` guida i cruscotti dei
--      costi, `data_cassa` la tesoreria. Sono due domande diverse sugli stessi
--      fatti, ed è la ragione per cui il registro porta due date e la
--      previsione di cassa non scrive mai qui.
-- ============================================================================


-- ============================================================================
-- 1. ANAGRAFICHE
-- ============================================================================

-- --- Centri di costo: specchio della lista SharePoint ------------------------
-- La fonte di verità resta SharePoint (permessi, responsabili, storico
-- leggibile). Qui serve una copia per due ragioni che valgono più della
-- duplicazione: le foreign key, e il fatto che aggregare per centro di costo
-- dentro una query SQL non si può fare leggendo un'altra piattaforma.
--
-- Il collegamento è sempre per CODICE (cc1…cc23), mai per id SharePoint:
-- sono due database distinti e un id non ha significato fuori dal suo.
-- Lo riempie `scripts/sync-centri-costo-supabase.mjs`, che non cancella mai
-- niente: un CC non si elimina, si spegne (lo storico lo referenzia).
create table if not exists centro_di_costo (
  codice           text primary key,
  nome             text not null,
  area             text,
  ordine           int  not null default 999,
  attivo           boolean not null default true,
  sp_item_id       int,                       -- id SharePoint, solo diagnostica
  sincronizzato_il timestamptz
);

comment on table centro_di_costo is
  'Specchio della lista SharePoint Centri di Costo. Fonte di verità: SharePoint. Sincronizza scripts/sync-centri-costo-supabase.mjs.';

-- I 23 centri di costo, più il segnaposto dei non attribuiti.
-- `nome` è quello già in uso su `servizio.centro_costo_nome`, quindi i due
-- elenchi partono allineati; area e ordine li porta la sincronizzazione.
-- `on conflict do nothing`: se la sincronizzazione è già passata, vince lei.
insert into centro_di_costo (codice, nome, ordine) values
  ('cc1',  'Scat.to Orientamento lavoro',     1),
  ('cc2',  'La Locanda nel Parco',            2),
  ('cc3',  'Una Serra per Mirafiori',         3),
  ('cc4',  'CAV In Rete',                     4),
  ('cc5',  'Casa Artemisia',                  5),
  ('cc6',  'Toc Toc Roberto',                 6),
  ('cc7',  'CPG Torino',                      7),
  ('cc8',  'MirArte',                         8),
  ('cc9',  'CRP CO.S.MI.C.A',                 9),
  ('cc10', 'Salute Mentale ASL TO',          10),
  ('cc11', 'Educativa Sanitaria ASL TO5',    11),
  ('cc12', 'Interventi CDSR Fondazione OZ',  12),
  ('cc13', 'Progetto Ponte',                 13),
  ('cc14', 'CER Giulia',                     14),
  ('cc15', 'Ed. amb. Nord',                  15),
  ('cc16', 'Ed. amb. Sud',                   16),
  ('cc17', 'SCAT.TO abitare',                17),
  ('cc18', 'Condominio Solidale',            18),
  ('cc19', 'Care Leavers',                   19),
  ('cc20', 'CISA 12 Nichelino',              20),
  ('cc21', 'Pian della Mussa',               21),
  ('cc22', 'Amazing',                        22),
  ('cc23', 'Progettazione - Amministrazione',23)
on conflict (codice) do nothing;

-- Il segnaposto dei costi non ancora attribuiti. È una riga vera e non un NULL
-- per una ragione precisa: con `cc_codice` nullable il vincolo di unicità del
-- registro non funzionerebbe (due NULL non collidono) e lo stesso documento
-- potrebbe entrare infinite volte senza centro di costo. Nasce `attivo=false`
-- così non compare in nessuna tendina.
insert into centro_di_costo (codice, nome, ordine, attivo) values
  ('DA_ATTRIBUIRE', 'Da attribuire', 9999, false)
on conflict (codice) do nothing;


-- --- Piano dei conti analitico -----------------------------------------------
-- Una ventina di voci, non il piano dei conti civilistico: serve a rispondere
-- a «di cosa è fatta la spesa di questo servizio», e con cinquanta voci nessuno
-- classifica più niente. `voce_bilancio` tiene il ponte verso il bilancio.
--
-- Il vincolo `unique (codice, tipo)` non è ridondante con la primary key:
-- serve alla foreign key composta di `movimento`, che è ciò che impedisce di
-- registrare un costo con segno positivo (vedi § 2).
create table if not exists voce_analitica (
  codice        text primary key,
  nome          text not null,
  tipo          text not null check (tipo in ('costo','ricavo')),
  voce_bilancio text,
  ordine        int  not null default 999,
  attiva        boolean not null default true,
  unique (codice, tipo)
);

comment on table voce_analitica is
  'Piano dei conti analitico: di cosa è fatta la spesa. Circa 20 voci, mappate al bilancio civilistico da voce_bilancio.';

insert into voce_analitica (codice, nome, tipo, voce_bilancio, ordine) values
  -- Costi — acquisti di beni (B6)
  ('ALIM', 'Alimentari e bevande',                'costo', 'B6',  10),
  ('CONS', 'Materiale di consumo e pulizia',      'costo', 'B6',  20),
  ('CANC', 'Cancelleria e stampati',              'costo', 'B6',  30),
  ('CARB', 'Carburanti e pedaggi',                'costo', 'B6',  40),
  ('ATTR', 'Attrezzature, arredi e beni minori',  'costo', 'B6',  50),
  -- Costi — servizi (B7)
  ('UTEN', 'Utenze: energia, gas, acqua',         'costo', 'B7',  60),
  ('TELE', 'Telefonia e connettività',            'costo', 'B7',  70),
  ('MANU', 'Manutenzioni e riparazioni',          'costo', 'B7',  80),
  ('SERV', 'Servizi da terzi e appalti',          'costo', 'B7',  90),
  ('PROF', 'Consulenze e prestazioni professionali', 'costo', 'B7', 100),
  ('FORM', 'Formazione e supervisione',           'costo', 'B7', 110),
  ('ASSI', 'Assicurazioni',                       'costo', 'B7', 120),
  ('TRAS', 'Trasporti e spese di viaggio',        'costo', 'B7', 130),
  -- Costi — godimento di beni di terzi (B8)
  ('AFFI', 'Affitti e spese condominiali',        'costo', 'B8', 140),
  ('NOLE', 'Noleggi e leasing',                   'costo', 'B8', 150),
  ('SOFT', 'Software, licenze e canoni',          'costo', 'B8', 160),
  -- Costi — personale (B9)
  ('PERS', 'Costo del personale',                 'costo', 'B9', 170),
  -- Costi — oneri diversi e finanziari
  ('TRIB', 'Imposte, tasse e tributi locali',     'costo', 'B14',180),
  ('BANC', 'Oneri bancari e finanziari',          'costo', 'C17',190),
  ('ALTR', 'Altri costi',                         'costo', 'B14',200),
  -- Ricavi
  ('CORR', 'Corrispettivi e vendite dirette',     'ricavo', 'A1', 300),
  ('CONV', 'Convenzioni, rette e appalti',        'ricavo', 'A1', 310),
  ('CONT', 'Contributi, bandi e liberalità',      'ricavo', 'A5', 320),
  ('RALT', 'Altri ricavi',                        'ricavo', 'A5', 330)
on conflict (codice) do nothing;


-- --- Conti e carte ------------------------------------------------------------
-- Assetto deciso il 22/08/2026: due conti in banca e un conto Revolut.
--
-- `cc_codice` NULL vuol dire «non attribuisce». Sul Generale resta NULL di
-- proposito: se ci mettessimo un valore di comodo, ventidue centri di costo
-- finirebbero in un contenitore sbagliato con l'aria di essere a posto.
create table if not exists conto (
  id                serial primary key,
  nome              text not null unique,
  iban              text unique,
  tipo              text not null check (tipo in ('corrente','carta')),
  cc_codice         text references centro_di_costo(codice),
  -- Positivo. La linea rossa della previsione di cassa sta a -fido: sul
  -- Generale ci sono fido e castelletto, quindi il vincolo non è lo zero.
  fido              numeric(12,2) not null default 0 check (fido >= 0),
  -- Punto di partenza della previsione. Viene dall'ultimo estratto conto
  -- importato, non da un totale calcolato: se i due divergono, la divergenza
  -- è essa stessa l'informazione utile.
  saldo_iniziale    numeric(12,2),
  saldo_iniziale_al date,
  attivo            boolean not null default true
);

-- IBAN e fido non li abbiamo ancora: si riempiono con
-- `scripts/imposta-conti.mjs` quando arrivano. Le righe nascono comunque,
-- perché è a loro che si agganciano scadenze e movimenti bancari.
insert into conto (nome, tipo, cc_codice) values
  ('Conto Generale',     'corrente', null),
  ('Conto La Locanda',   'corrente', 'cc2'),
  ('Conto Revolut',      'corrente', null)
on conflict (nome) do nothing;

-- --- Carte: una per persona, non per centro di costo -------------------------
-- Troppe persone lavorano su più servizi (lo dicono le timbrature) perché una
-- carta-per-CC funzioni. Il centro di costo arriva dall'ETICHETTA che chi
-- spende mette sulla transazione, con la foto dello scontrino.
--
-- `cc_default` è il servizio abituale della persona ed è un ripiego, non una
-- risposta: se chi lavora su Cosmica compra per Giulia e non etichetta,
-- l'attribuzione è muta e sbagliata. Per questo la riga che lo usa nasce con
-- confidenza `alta` e si segnala, non `certa`.
--
-- Nessuna riga di esempio: Revolut non è ancora attivo (problema loro, in
-- corso con l'assistenza). La tabella c'è perché il modello dati si decide una
-- volta sola, e il giorno dell'attivazione non ci sia una migrazione da fare.
create table if not exists carta (
  id               serial primary key,
  conto_id         int  not null references conto(id),
  intestatario     text not null,            -- mail aziendale della persona
  etichetta        text,                      -- come la chiama Revolut
  ultime_cifre     text,
  cc_default       text references centro_di_costo(codice),
  -- Il tetto per operazione va tenuto PIÙ ALTO della soglia di libera spesa
  -- (100 € sul singolo bene), altrimenti blocca l'acquisto legittimo di più
  -- articoli. Il valore vive in lista SP Parametri; qui c'è quello impostato
  -- sulla carta, per poterlo confrontare.
  tetto_operazione numeric(12,2),
  tetto_mensile    numeric(12,2),
  attiva           boolean not null default true,
  unique (conto_id, intestatario)
);


-- ============================================================================
-- 2. IL REGISTRO
-- ============================================================================

-- Tutto converge qui, e da nient'altro si leggono i costi per servizio.
--
-- Il segno: negativo = costo, positivo = ricavo. Non è una convenzione lasciata
-- alla buona volontà di chi scrive — la foreign key composta (voce, tipo) più
-- `movimento_segno_chk` la rendono un vincolo: un costo con importo positivo
-- non entra, e nemmeno un costo classificato con una voce di ricavo.
--
-- `quota` < 1 quando lo stesso documento è ripartito su più centri di costo.
-- Che le quote di un documento sommino a 1 non si può controllare riga per
-- riga: lo garantisce `registro_riscrivi()` (§ 3), che è l'unica porta di
-- scrittura.
create table if not exists movimento (
  id              uuid primary key default gen_random_uuid(),

  -- Guida i cruscotti dei costi. È la data del documento, non del pagamento.
  data_competenza date not null,
  -- Valorizzata dall'appaiamento bancario, mai digitata. Resta NULL finché il
  -- denaro non si è mosso davvero.
  data_cassa      date,

  cc_codice       text not null references centro_di_costo(codice),

  -- Denormalizzato per necessità: serve alla FK composta e al vincolo di segno.
  tipo            text not null check (tipo in ('costo','ricavo')),
  -- Facoltativa. Una fattura appena importata non ha ancora una voce: meglio
  -- vuota che classificata "Altro" per riempire il campo, perché "Altro" ha
  -- l'aria di una risposta e nessuno lo va più a rivedere.
  voce            text,

  importo         numeric(12,2) not null check (importo <> 0),

  controparte     text,
  piva            text,

  -- Da quale flusso nasce la riga.
  fonte           text not null check (fonte in (
                    'acquisto','manutenzione','costo_diretto','lavoro',
                    'fattura_passiva','spesa_dichiarata','spesa_carta',
                    'fattura_attiva','convenzione','contributo','incasso',
                    'uscita_manuale','manuale'
                  )),

  -- Identità del documento da cui la riga viene. NOT NULL entrambi: è il
  -- vincolo di unicità qui sotto a impedire il doppio conteggio, e con un NULL
  -- non impedirebbe nulla. Le righe inserite a mano portano
  -- origine_tipo='manuale' e un id generato da chi scrive.
  origine_tipo    text not null,
  origine_id      text not null,

  -- Quanto ci si può credere. `da_attribuire` è l'unico valore ammesso quando
  -- il centro di costo è il segnaposto, e viceversa: il vincolo qui sotto
  -- impedisce sia un CC vero marcato «da attribuire» sia un segnaposto che si
  -- spaccia per attribuito.
  confidenza      text not null check (confidenza in (
                    'certa','alta','convenzionale','manuale','da_attribuire'
                  )),
  -- Perché il sistema ha deciso così. Si legge in chiaro nella lista del
  -- residuo: senza, chi chiude l'attribuzione a mano non sa cosa correggere.
  motivo          text,

  quota           numeric(5,4) not null default 1 check (quota > 0 and quota <= 1),
  note            text,
  creato_il       timestamptz not null default now(),
  creato_da       text,

  -- Import idempotente e anti-doppio-conteggio in un vincolo solo.
  unique (origine_tipo, origine_id, cc_codice),

  foreign key (voce, tipo) references voce_analitica (codice, tipo),

  constraint movimento_segno_chk check (
    (tipo = 'costo'  and importo < 0) or
    (tipo = 'ricavo' and importo > 0)
  ),

  constraint movimento_attribuzione_chk check (
    (cc_codice = 'DA_ATTRIBUIRE') = (confidenza = 'da_attribuire')
  )
);

comment on table movimento is
  'IL REGISTRO: tutti i costi e i ricavi, nella stessa forma. Si scrive solo da registro_riscrivi(); i movimenti bancari non generano mai una riga qui.';

create index if not exists movimento_competenza_idx on movimento (data_competenza);
create index if not exists movimento_cc_idx         on movimento (cc_codice, data_competenza);
create index if not exists movimento_origine_idx    on movimento (origine_tipo, origine_id);
create index if not exists movimento_voce_idx       on movimento (voce, data_competenza);
-- Parziale: la lista del residuo è corta e la si guarda spesso.
create index if not exists movimento_residuo_idx
  on movimento (data_competenza) where cc_codice = 'DA_ATTRIBUIRE';


-- ============================================================================
-- 3. L'UNICA PORTA DI SCRITTURA DEL REGISTRO
-- ============================================================================

-- Riscrive TUTTE le righe di un documento in un colpo solo.
--
-- Perché una funzione e non due chiamate dall'app. Riattribuire un documento
-- da DA_ATTRIBUIRE a un centro di costo vero significa togliere una riga e
-- metterne un'altra. Il vincolo di unicità non lo impedisce — le due chiavi
-- sono diverse — quindi senza una scrittura atomica bastava un errore di rete
-- fra le due operazioni per lasciare il documento contato due volte, o
-- (invertendo l'ordine) per farlo sparire del tutto. PostgREST non ha
-- transazioni: una funzione sì, il suo corpo è una transazione.
--
-- `p_righe` è un array JSON di oggetti con le chiavi del registro. Array vuoto
-- = cancella le righe del documento (serve a un documento annullato).
--
-- Le quote si controllano qui perché è l'unico posto che vede tutte le righe
-- del documento insieme: un check di tabella non può sommare fra righe.
create or replace function registro_riscrivi(
  p_origine_tipo text,
  p_origine_id   text,
  p_righe        jsonb
) returns int
language plpgsql
as $$
declare
  v_somma_quote numeric;
  v_inserite    int;
begin
  if p_origine_tipo is null or p_origine_id is null then
    raise exception 'registro_riscrivi: origine_tipo e origine_id sono obbligatori';
  end if;

  if jsonb_typeof(p_righe) <> 'array' then
    raise exception 'registro_riscrivi: p_righe deve essere un array JSON';
  end if;

  if jsonb_array_length(p_righe) > 0 then
    -- ⚠️ La quota omessa vale 1, esattamente come nell'insert qui sotto. Con
    -- `(r->>'quota')::numeric` secco una riga senza la chiave `quota` — il
    -- caso normale di un documento non ripartito — sommava a NULL, quindi 0,
    -- e la funzione rifiutava una scrittura legittima. Trovato al collaudo.
    select coalesce(sum(coalesce((r->>'quota')::numeric, 1)), 0)
      into v_somma_quote
      from jsonb_array_elements(p_righe) r;

    -- Tolleranza al centesimo di quota: 1/3 + 1/3 + 1/3 non fa mai 1 esatto.
    if abs(v_somma_quote - 1) > 0.0002 then
      raise exception
        'registro_riscrivi: le quote di %/% sommano a % invece di 1',
        p_origine_tipo, p_origine_id, v_somma_quote;
    end if;
  end if;

  delete from movimento
   where origine_tipo = p_origine_tipo
     and origine_id   = p_origine_id;

  insert into movimento (
    data_competenza, data_cassa, cc_codice, tipo, voce, importo,
    controparte, piva, fonte, origine_tipo, origine_id,
    confidenza, motivo, quota, note, creato_da
  )
  select
    (r->>'data_competenza')::date,
    nullif(r->>'data_cassa','')::date,
    r->>'cc_codice',
    r->>'tipo',
    nullif(r->>'voce',''),
    (r->>'importo')::numeric,
    nullif(r->>'controparte',''),
    nullif(r->>'piva',''),
    r->>'fonte',
    p_origine_tipo,
    p_origine_id,
    r->>'confidenza',
    nullif(r->>'motivo',''),
    coalesce((r->>'quota')::numeric, 1),
    nullif(r->>'note',''),
    nullif(r->>'creato_da','')
  from jsonb_array_elements(p_righe) r;

  get diagnostics v_inserite = row_count;
  return v_inserite;
end
$$;

comment on function registro_riscrivi is
  'Unica porta di scrittura di movimento: cancella e riscrive atomicamente tutte le righe di un documento, controllando che le quote sommino a 1.';


-- --- Le due letture di aggregazione ------------------------------------------
-- Stanno qui e non nell'app perché PostgREST non sa fare GROUP BY: senza,
-- l'unico modo sarebbe scaricare tutte le righe del periodo e sommarle in
-- JavaScript — 36.000 righe l'anno, e il cruscotto diventerebbe più lento ogni
-- mese che passa.
--
-- Nessuna vista materializzata: l'indice basta, e una vista sarebbe un secondo
-- posto in cui la verità può divergere.

-- Costi e ricavi per centro di costo, per competenza.
-- `DA_ATTRIBUIRE` non si filtra: compare in fondo con il suo totale, perché è
-- la misura della salute del sistema e va guardata insieme al resto.
create or replace function registro_per_cc(p_dal date, p_al date)
returns table (
  cc_codice text,
  cc_nome   text,
  area      text,
  costi     numeric,
  ricavi    numeric,
  righe     bigint
)
language sql
stable
as $$
  select m.cc_codice,
         c.nome,
         c.area,
         coalesce(-sum(m.importo) filter (where m.tipo = 'costo'), 0),
         coalesce( sum(m.importo) filter (where m.tipo = 'ricavo'), 0),
         count(*)
    from movimento m
    join centro_di_costo c on c.codice = m.cc_codice
   where m.data_competenza between p_dal and p_al
   group by m.cc_codice, c.nome, c.area, c.ordine
   order by c.ordine, c.nome;
$$;

-- Di cosa è fatta la spesa: per voce analitica, tutta o di un solo CC.
-- I costi tornano positivi, come si leggono in un report: il segno negativo
-- del registro è un vincolo di coerenza interna, non un modo di presentare
-- un numero a chi legge.
create or replace function registro_per_voce(p_dal date, p_al date, p_cc text default null)
returns table (
  voce      text,
  voce_nome text,
  tipo      text,
  totale    numeric,
  righe     bigint
)
language sql
stable
as $$
  select m.voce,
         coalesce(v.nome, 'Da classificare'),
         m.tipo,
         case when m.tipo = 'costo' then -sum(m.importo) else sum(m.importo) end,
         count(*)
    from movimento m
    left join voce_analitica v on v.codice = m.voce
   where m.data_competenza between p_dal and p_al
     and (p_cc is null or m.cc_codice = p_cc)
   group by m.voce, v.nome, v.ordine, m.tipo
   order by m.tipo, v.ordine nulls last, m.voce nulls last;
$$;


-- ============================================================================
-- 4. CATTURA DEI COSTI
-- ============================================================================

-- --- Quello che l'operatore dichiara in "Inserisci Spesa" --------------------
-- Nasce come INDIZIO DI ATTRIBUZIONE, non come costo. Serve a un caso solo:
-- segnalare ciò che verrà fatturato e pagato con bonifico, così la fattura è
-- attribuibile quando arriva. Più le fatture estere, che dallo SDI non passano
-- e per cui la dichiarazione È il costo.
--
-- `piva` valorizzata solo se la ditta è stata scelta dall'autocompletamento:
-- è la mitigazione che vale più di tutto il resto, perché senza P.IVA
-- l'appaiamento dichiarazione↔fattura non regge.
create table if not exists spesa_dichiarata (
  id                 uuid primary key default gen_random_uuid(),
  data               date not null,
  importo            numeric(12,2) not null check (importo > 0),  -- totale pagato, IVA inclusa
  ditta              text not null,
  piva               text,
  cc_codice          text not null references centro_di_costo(codice),
  voce               text references voce_analitica(codice),
  -- Spunta "fattura estera": nessuna fattura arriverà mai dallo SDI, quindi
  -- questa riga diventa subito un movimento.
  estera             boolean not null default false,
  allegato_url       text,
  inserita_da        text not null,
  fattura_attesa     boolean not null default true,
  fattura_passiva_id uuid references fattura_passiva(id) on delete set null,
  stato              text not null default 'in_attesa'
                     check (stato in ('in_attesa','appaiata','diventata_costo','orfana')),
  creata_il          timestamptz not null default now(),

  -- Una dichiarazione estera non aspetta nessuna fattura, e una appaiata ha
  -- la sua. Il vincolo tiene allineate tre colonne che dicono la stessa cosa
  -- in tre modi, invece di fidarsi del codice.
  constraint spesa_estera_chk check (not estera or fattura_attesa = false),
  constraint spesa_appaiata_chk check (
    (stato = 'appaiata') = (fattura_passiva_id is not null)
  ),
  constraint spesa_allegato_estera_chk check (not estera or allegato_url is not null)
);

create index if not exists spesa_dichiarata_aperte_idx
  on spesa_dichiarata (data) where stato = 'in_attesa';
create index if not exists spesa_dichiarata_piva_idx on spesa_dichiarata (piva);


-- --- Regole fornitore → centro di costo --------------------------------------
-- Si imparano dalle dichiarazioni e dalle chiusure manuali del residuo.
--
-- Applicazione automatica solo se la P.IVA è stata coerente su un solo centro
-- di costo per almeno tre conferme. Le ripartizioni su più CC sono SEMPRE
-- `manuale`: una ripartizione appresa sarebbe un numero inventato.
--
-- Un fornitore che cambia destinazione non riscrive la sua regola: si chiude
-- con `al` e se ne apre una nuova, così lo storico resta leggibile. Per questo
-- la chiave porta anche `dal`.
--
-- Che le quote di una P.IVA sommino a 1 non è un vincolo di tabella: lo
-- controlla lib/gestione/attribuzione.ts quando le scrive, e la lista delle
-- regole incoerenti sta nel cruscotto. Metà delle fatture (Lidl, Spesa
-- Intelligente, SOGEGROSS) non avrà mai una regola: quelle si risolvono
-- dall'etichetta della carta, ed è la ragione della carta per persona.
create table if not exists regola_fornitore (
  piva      text not null,
  cc_codice text not null references centro_di_costo(codice),
  dal       date not null default current_date,
  al        date,
  quota     numeric(5,4) not null default 1 check (quota > 0 and quota <= 1),
  voce      text references voce_analitica(codice),
  origine   text not null default 'appresa' check (origine in ('appresa','manuale')),
  conferme  int  not null default 0,
  primary key (piva, cc_codice, dal),
  constraint regola_periodo_chk check (al is null or al >= dal),
  -- Una ripartizione (quota < 1) non può essere appresa: sarebbe inventata.
  constraint regola_riparto_chk check (quota = 1 or origine = 'manuale')
);

create index if not exists regola_fornitore_attive_idx
  on regola_fornitore (piva) where al is null;


-- --- Utenze: attribuzione per codice di fornitura ----------------------------
-- Le bollette non si ripartiscono per convenzione, si attribuiscono
-- esattamente: ogni fornitura ha un identificativo permanente stampato in
-- fattura — POD, PDR, matricola contatore, numero SIM, targa.
--
-- Verificato il 27/08/2026: nell'export di Fattura SMART quel codice NON c'è
-- (zero occorrenze su 6.082 righe). La tabella resta perché è il modo giusto
-- di attribuire una bolletta, ma oggi si alimenta solo dalla lista SharePoint
-- del sito Controllo Gestione e serve quando si leggeranno gli XML. Il volume
-- rende la cosa poco urgente: quindici fatture di utenze in due mesi.
--
-- `cc_codice` punta diretto al centro di costo e la struttura è solo
-- un'informazione di comodo: POD → struttura → CC sarebbe una catena a due
-- passi da risolvere a runtime, e riscriverebbe il passato ogni volta che si
-- sistema un'anagrafica.
create table if not exists utenza (
  codice     text primary key,               -- POD / PDR / matricola / SIM / targa
  tipo       text not null check (tipo in ('energia','gas','acqua','telefonia','veicolo','altro')),
  struttura  text,
  cc_codice  text not null references centro_di_costo(codice),
  quota      numeric(5,4) not null default 1 check (quota > 0 and quota <= 1),
  fornitore  text,
  attiva     boolean not null default true
);


-- ============================================================================
-- 5. BANCA
-- ============================================================================

-- --- Movimenti dei conti ------------------------------------------------------
-- NON generano mai un movimento nel registro: appaiano e valorizzano
-- `data_cassa`. È la regola 2 in cima al file, ed è quella che rende il doppio
-- conteggio impossibile invece che improbabile.
--
-- I giroconti (le ricariche del conto Revolut dal Generale) sono movimenti
-- interni: uscita su un conto, entrata sull'altro, nessun fatto economico.
-- Senza il filtro, ogni ricarica settimanale diventerebbe un costo finto sul
-- Generale e un ricavo finto su Revolut — e siccome le ricariche coprono TUTTA
-- la spesa con carta, l'errore raddoppierebbe la voce più frequente di tutte.
create table if not exists movimento_bancario (
  id               uuid primary key default gen_random_uuid(),
  conto_id         int  not null references conto(id),
  -- Valorizzata sulle spese con carta: è da qui che arriva il centro di costo.
  carta_id         int  references carta(id),
  data_valuta      date,
  data_contabile   date not null,
  importo          numeric(12,2) not null check (importo <> 0),  -- negativo = uscita
  causale          text,
  controparte      text,
  controparte_iban text,
  -- L'etichetta messa da chi spende nell'app Revolut, e lo scontrino.
  etichetta_cc     text references centro_di_costo(codice),
  ricevuta_url     text,
  giroconto        boolean not null default false,
  -- Idempotenza dell'import: stesso estratto conto due volte, nessun doppione.
  hash             text unique,
  import_id        uuid,
  creato_il        timestamptz not null default now()
);

create index if not exists movimento_bancario_conto_idx
  on movimento_bancario (conto_id, data_contabile);
create index if not exists movimento_bancario_data_idx
  on movimento_bancario (data_contabile);


-- --- Appaiamento banca ↔ scadenze --------------------------------------------
-- Molti-a-molti, perché un'unica uscita da 4.200 € può saldare sette fatture
-- dello stesso fornitore: è il subset-sum già previsto per le dichiarazioni,
-- applicato alle scadenze aperte di quella P.IVA.
--
-- Punta a `scadenza` e non a `fattura_passiva` — cambio rispetto al piano, che
-- è stato scritto prima che i Flussi fatture esistessero. Quello che si paga è
-- la rata, non il documento: una fattura con due rate saldate in due bonifici
-- diversi con la fattura come chiave non si sarebbe potuta rappresentare.
create table if not exists appaiamento (
  movimento_bancario_id uuid not null references movimento_bancario(id) on delete cascade,
  scadenza_id           uuid not null references scadenza(id) on delete cascade,
  importo               numeric(12,2) not null,
  confidenza            text not null default 'alta'
                        check (confidenza in ('certa','alta','manuale')),
  motivo                text,
  creato_il             timestamptz not null default now(),
  primary key (movimento_bancario_id, scadenza_id)
);


-- --- Uscite fisse -------------------------------------------------------------
-- Stipendi, F24, rate dei finanziamenti, canoni: date fisse, importi noti o
-- stimabili, e insieme la parte più grande delle uscite. Non arrivano da
-- Fattura SMART e non hanno una fattura, quindi si censiscono a mano una volta.
--
-- Attenzione a non confonderle con le uscite senza fattura di
-- docs/uscite-senza-fattura.md: quelle sono scadenze VERE, con un importo noto
-- e il tasto PAGATA. Questa tabella è una REGOLA che serve alla sola
-- previsione di cassa — «il 27 di ogni mese escono gli stipendi» — e non
-- diventa mai un movimento, altrimenti il costo del lavoro sarebbe contato due
-- volte: una dal cedolino e una dalla previsione.
--
-- `importo_stima` si autocorregge: quando l'estratto conto mostra l'uscita
-- reale si aggiorna, e dopo tre mesi la previsione degli stipendi non è più
-- una stima ma una media recente che nessuno deve mantenere a mano.
create table if not exists uscita_fissa (
  id             serial primary key,
  descrizione    text not null,
  tipo           text not null check (tipo in ('personale','tributi','finanziamento','canone','altro')),
  periodicita    text not null check (periodicita in ('mensile','bimestrale','trimestrale','semestrale','annuale')),
  giorno_mese    int  check (giorno_mese between 1 and 31),
  mesi           int[],                        -- per le non mensili: quali mesi
  importo_stima  numeric(12,2),
  importo_al     date,                         -- a quando risale la stima
  conto_id       int references conto(id),
  attiva         boolean not null default true,
  note           text
);


-- ============================================================================
-- 6. COSTO DEL LAVORO
-- ============================================================================

-- --- Estrazione dell'ufficio paghe, grezza -----------------------------------
-- Chiave di riconciliazione: la MATRICOLA. `dipendente_id` la risolve
-- l'import contro l'anagrafica RU e resta NULL quando non trova
-- corrispondenza — le righe orfane sono una lista da guardare, non un errore
-- da nascondere.
--
-- Riservatezza: questa tabella e `costo_lavoro` per singolo dipendente sono
-- accessibili solo a RU e Amministrazione (guard applicativo). Nei cruscotti
-- per centro di costo e nei report al CDA passa solo l'aggregato.
create table if not exists cedolino_mese (
  matricola      text not null,
  anno           int  not null check (anno between 2020 and 2100),
  mese           int  not null check (mese between 1 and 12),
  dipendente_id  int  references dipendente(id),
  lordo          numeric(12,2),
  contributi     numeric(12,2),
  accantonamenti numeric(12,2),
  costo_totale   numeric(12,2) not null,
  ore_retribuite numeric(8,2),
  import_id      uuid,
  creato_il      timestamptz not null default now(),
  primary key (matricola, anno, mese)
);

-- --- Il costo del lavoro ripartito per centro di costo -----------------------
--   costo_cc = cedolino_mese.costo_totale × (ore su quel CC / ore del mese)
-- Le ore vengono da `timbratura` join `servizio.centro_costo_codice`.
--
-- I giustificativi (ferie, 104, permessi) e i costi non correlati alle ore si
-- ripartiscono sui centri di costo del dipendente in proporzione alle ore
-- lavorate del mese. Da confermare con l'ufficio paghe.
create table if not exists costo_lavoro (
  dipendente_id int  not null references dipendente(id),
  anno          int  not null check (anno between 2020 and 2100),
  mese          int  not null check (mese between 1 and 12),
  cc_codice     text not null references centro_di_costo(codice),
  ore           numeric(8,2) not null default 0,
  costo         numeric(12,2) not null default 0,
  calcolato_il  timestamptz not null default now(),
  primary key (dipendente_id, anno, mese, cc_codice)
);

create index if not exists costo_lavoro_cc_idx on costo_lavoro (cc_codice, anno, mese);


-- ============================================================================
-- 7. BUDGET
-- ============================================================================

-- Granularità: centro di costo × voce analitica × mese. Chi non sa
-- mensilizzare mette l'annuo e il sistema divide per dodici, segnalando che è
-- una ripartizione piatta (`piatto = true`): un dodicesimo esatto in ogni mese
-- non è un budget, è l'assenza di un budget travestita da numero.
--
-- Il budget non blocca niente, segnala uno scostamento. Un budget che blocca
-- produce solo aggiramenti, e l'aggiramento è invisibile per definizione.
--
-- Il primo anno non si chiede a nessuno: il budget 2027 è il consuntivo 2026
-- riportato. Chiedere un preventivo a chi non ha mai visto un consuntivo
-- mensile produce numeri inventati, e i numeri inventati screditano il
-- confronto per sempre.
create table if not exists budget (
  cc_codice   text not null references centro_di_costo(codice),
  anno        int  not null check (anno between 2020 and 2100),
  mese        int  not null check (mese between 1 and 12),
  voce        text not null references voce_analitica(codice),
  importo     numeric(12,2) not null,
  piatto      boolean not null default false,
  approvato   boolean not null default false,
  inserito_da text,
  creato_il   timestamptz not null default now(),
  primary key (cc_codice, anno, mese, voce)
);


-- ============================================================================
-- 8. RLS ACCESA, NESSUNA POLICY
-- ============================================================================
-- È l'assetto di tutte le altre tabelle del progetto, e non è una
-- contraddizione con «la RLS resta disattivata» scritto in
-- pagamenti_schema.sql: quella frase vuol dire che non ci sono policy da
-- scrivere, perché l'autorizzazione la fanno next-auth e i guard.
--
-- Accesa senza policy significa: la chiave pubblica (anon) non legge niente,
-- la service role passa comunque perché la bypassa per progetto. Spenta
-- significherebbe che chiunque avesse la chiave pubblica — che sta nel
-- browser — potrebbe leggere tutto. Su `cedolino_mese` ci sono gli stipendi
-- per persona, su `conto` gli IBAN: la differenza fra le due righe di codice
-- qui sotto e nessuna riga è la riservatezza dei dati del personale.
alter table centro_di_costo    enable row level security;
alter table voce_analitica     enable row level security;
alter table conto              enable row level security;
alter table carta              enable row level security;
alter table movimento          enable row level security;
alter table spesa_dichiarata   enable row level security;
alter table regola_fornitore   enable row level security;
alter table utenza             enable row level security;
alter table movimento_bancario enable row level security;
alter table appaiamento        enable row level security;
alter table uscita_fissa       enable row level security;
alter table cedolino_mese      enable row level security;
alter table costo_lavoro       enable row level security;
alter table budget             enable row level security;

-- Le tre funzioni con il search_path fissato. Senza, chi le chiama può
-- impostare un search_path che punta a un'altra tabella `movimento` e la
-- funzione scriverebbe là: è la raccomandazione del linter di Supabase, e su
-- una funzione che è l'unica porta di scrittura del registro conta più che
-- altrove. `pg_temp` per ultimo, mai per primo.
alter function registro_riscrivi(text, text, jsonb) set search_path = public, pg_temp;
alter function registro_per_cc(date, date)          set search_path = public, pg_temp;
alter function registro_per_voce(date, date, text)  set search_path = public, pg_temp;


-- ============================================================================
-- NOTE SU CIÒ CHE NON C'È, DI PROPOSITO
-- ----------------------------------------------------------------------------
-- • Nessun trigger. Come in pagamenti_schema.sql: la logica sta in un posto
--   solo — `registro_riscrivi()` per il registro, lib/gestione/* per il resto.
--   Un trigger che riscrive righe è la cosa più difficile da trovare quando un
--   numero non torna.
--
-- • Nessuna vista materializzata dei totali per centro di costo. Sarebbe un
--   secondo posto in cui la verità può divergere, e con 36.000 righe l'anno le
--   aggregazioni le fa l'indice.
--
-- • Nessuna tabella `soggetto` (clienti + fornitori). L'anagrafica unica è
--   della fase 3 e vive su SharePoint: è un elenco compilato da persone, con
--   permessi e storico leggibile. Qui arriverebbe solo la P.IVA, che c'è già
--   sui documenti.
--
-- • Nessuna tabella `decisione_pagamento`. Le due transizioni che passano da
--   una persona (APPROVA, PAGATA) sono già tracciate su `scadenza` con chi e
--   quando: una tabella di decisioni sarebbe lo stesso dato in due posti.
--
-- • Nessun `check` sul fatto che le quote di una regola fornitore sommino a 1,
--   e nessuno sul fatto che `movimento.data_cassa` sia >= `data_competenza`.
--   Il primo non è esprimibile riga per riga; il secondo è falso nella realtà
--   (gli acconti si pagano prima della fattura).
-- ============================================================================
