/**
 * Tipi e SCHEMA dei campi per l'area Risorse Umane.
 *
 * Lo schema è la fonte unica di verità: lo usano sia il backend
 * (lib/risorse-umane.ts, per costruire/mappare i campi SharePoint) sia il
 * frontend (per generare elenco e form). Per aggiungere un campo in futuro
 * basta: 1) aggiungerlo qui, 2) aggiungere la colonna in
 * scripts/provision-risorse-umane.mjs (stesso `key` = `name` SP), 3) rilanciare
 * il provisioning. Nessun'altra modifica al codice.
 *
 * IMPORTANTE: il `key` di ogni campo DEVE coincidere col nome interno della
 * colonna SharePoint creata dallo script di provisioning.
 */

export type RUEntity = 'dipendenti' | 'collaboratori' | 'tirocini'

export type RUFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'currency'
  | 'choice'
  | 'email'
  | 'tel'

export interface RUField {
  key: string
  label: string
  type: RUFieldType
  choices?: readonly string[]
  section?: string
  /** mostrato in elenco come colonna sintetica */
  inList?: boolean
}

/** Un record RU generico: sempre presente spItemId + campi dinamici. */
export interface RURecord {
  spItemId: string
  [key: string]: string | number | null | undefined
}

// ------------------------------------------------------------------
// Valori a tendina (devono essere un sottoinsieme delle choices SP)
// ------------------------------------------------------------------
export const GENERE = ['Maschio', 'Femmina'] as const
export const SINO = ['Si', 'No'] as const
export const AREA_GEO = ['Comunitario', 'Extracomunitario'] as const
export const STATO_CIVILE = ['Celibe', 'Nubile', 'Coniugato/a', 'Convivente', 'Separato/a', 'Vedovo/a'] as const
export const TITOLO_STUDIO = [
  'Licenza media', 'Diploma Prof (PostLicenMedia)', 'Diploma scuola superiore',
  'Diploma Prof (PostScuoSup)', 'Laurea', 'Laurea triennale', 'Master I livello',
  'Laurea magistrale', 'Master II livello', 'Dottorato di ricerca',
  'Qualifica Professionale', 'Altro',
] as const
export const TIPO_CONTRATTO = [
  'Determinato Tempo Pieno', 'Determinato Tempo Parziale',
  'Indeterminato Tempo Pieno', 'Indeterminato Tempo Parziale',
  'Intermittente Tempo Determinato',
] as const
export const TIPO_RAPPORTO = [
  'Dipendente', 'Libero professionista', 'Socio lavoratore', 'Socio volontario',
  'Socio libero professionista', 'Tirocinante e/o Stagista', 'Volontario in servizio civile',
  'Socio fruitore', 'Socio persona giuridica', 'Socio sovventore e finanziatore',
  'Apprendista', 'Collaborazione Coordinate Continuativa',
] as const
export const AREA_ASSUNZIONE = ['Tipo A', 'Tipo B'] as const
export const LIVELLO = ['A1', 'A2', 'B1', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E2', 'F1', 'F2'] as const
export const MANSIONE = [
  'ADEST', 'Assistente Sociale', 'Assistente alla persona', 'Addetto alle pulizie',
  'Addetto alla sala', 'Addetto mensa', 'Addetto manutenzione aree verdi', 'Aiuto cuoco',
  'Aiuto Bibliotecaria', 'Animatore', 'Autista', 'Barista', 'Bibliotecario', 'Cuoco',
  'Coordinatore AS', 'Cameriere', 'Dirigente quadro', 'Educatore', 'Educatore Coordinatore',
  'Educatore quadro', 'Educatore prima infanzia', 'Grafico', 'Guida Museale', 'Infermiere',
  'Impiegato', 'Lava piatti', 'Logopedista', 'Maestra', 'Mediatore culturale',
  "Operatore dell'inserimento lavorativo", 'OSS', 'Pizzaiolo', 'Psicologo', 'Sociologo',
  'Supervisore', 'Segretario', 'Tirocinante',
] as const
export const SERVIZIO = ['Locanda', 'Residenziale', 'Ambientale', 'Biblioteche', 'Ufficio', 'Scuola', 'Comunità Giulia', 'Cosmica2'] as const
export const TIPOLOGIA_SVANTAGGIO = [
  'DISABILITA FISICA E/O SENSORIALE', 'DISABILITA PSICHICA', 'DIPENDENZA PATOLOGICA',
  'MINORE IN ETA LAVORATIVA IN NUCLEO FAMILIARE VULNERABILE', 'DETENUTO IN REGIME ALTERNATIVO',
  'DISAGIO SOCIALE O MOLTO SVANTAGGIATE', 'ALTRO',
] as const
export const STATO_TIROCINIO = ['ATTIVO', 'INTERROTTO', 'TERMINATO'] as const
export const CATEGORIA_COLLAB = ['TIROCINIO', 'SERVIZIO CIVILE'] as const

/** Stato del rapporto di lavoro del dipendente. "Cessato" = rapporto terminato. */
export const STATO_RAPPORTO = [
  'Attivo', 'Aspettativa', 'Maternità', 'Congedo parentale',
  'Malattia lunga', 'Sospeso', 'Cessato',
] as const

/**
 * Colore del pallino/etichetta per ogni stato rapporto (classi Tailwind).
 * `badge` = sfondo+testo dell'etichetta, `dot` = colore del pallino.
 */
export const STATO_RAPPORTO_STILE: Record<string, { badge: string; dot: string }> = {
  Attivo: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  Aspettativa: { badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  Maternità: { badge: 'bg-pink-100 text-pink-800 border-pink-200', dot: 'bg-pink-500' },
  'Congedo parentale': { badge: 'bg-violet-100 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  'Malattia lunga': { badge: 'bg-orange-100 text-orange-800 border-orange-200', dot: 'bg-orange-500' },
  Sospeso: { badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  Cessato: { badge: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
}

/** Stati che indicano un dipendente "in forza" (tutto tranne Cessato). */
export const STATO_IN_FORZA: readonly string[] = STATO_RAPPORTO.filter((s) => s !== 'Cessato')

// ------------------------------------------------------------------
// Schema campi per entità
// ------------------------------------------------------------------
export const DIPENDENTI_FIELDS: readonly RUField[] = [
  { key: 'Cognome', label: 'Cognome', type: 'text', section: 'Anagrafica', inList: true },
  { key: 'Nome', label: 'Nome', type: 'text', section: 'Anagrafica', inList: true },
  { key: 'Genere', label: 'Genere', type: 'choice', choices: GENERE, section: 'Anagrafica' },
  { key: 'DataNascita', label: 'Data di nascita', type: 'date', section: 'Anagrafica' },
  { key: 'LuogoNascita', label: 'Luogo di nascita', type: 'text', section: 'Anagrafica' },
  { key: 'CodiceFiscale', label: 'Codice fiscale', type: 'text', section: 'Anagrafica' },
  { key: 'Nazionalita', label: 'Nazionalità', type: 'text', section: 'Anagrafica' },
  { key: 'AreaGeografica', label: 'Area geografica di provenienza', type: 'choice', choices: AREA_GEO, section: 'Anagrafica' },
  { key: 'StatoCivile', label: 'Stato civile', type: 'choice', choices: STATO_CIVILE, section: 'Anagrafica' },

  { key: 'Residenza', label: 'Residenza', type: 'text', section: 'Contatti e residenza' },
  { key: 'Domicilio', label: 'Domicilio', type: 'text', section: 'Contatti e residenza' },
  { key: 'CellAziendale', label: 'Cellulare aziendale', type: 'tel', section: 'Contatti e residenza' },
  { key: 'CellPrivato', label: 'Cellulare privato', type: 'tel', section: 'Contatti e residenza' },
  { key: 'MailAziendale', label: 'Mail aziendale', type: 'email', section: 'Contatti e residenza' },
  { key: 'MailPersonale', label: 'Mail personale', type: 'email', section: 'Contatti e residenza' },

  { key: 'TitoloStudio', label: 'Titolo di studio', type: 'choice', choices: TITOLO_STUDIO, section: 'Formazione' },
  { key: 'Qualifica', label: 'Qualifica', type: 'text', section: 'Formazione' },

  { key: 'StatoRapporto', label: 'Stato rapporto', type: 'choice', choices: STATO_RAPPORTO, section: 'Rapporto di lavoro' },
  { key: 'Matricola', label: 'Matricola', type: 'text', section: 'Rapporto di lavoro', inList: true },
  { key: 'DataAssunzione', label: 'Data assunzione', type: 'date', section: 'Rapporto di lavoro' },
  { key: 'OreLavoroPreviste', label: 'Ore lavoro previste', type: 'number', section: 'Rapporto di lavoro' },
  { key: 'TipoContratto', label: 'Tipo di contratto', type: 'choice', choices: TIPO_CONTRATTO, section: 'Rapporto di lavoro' },
  { key: 'DataScadenzaContratto', label: 'Data scadenza contratto (se determinato)', type: 'date', section: 'Rapporto di lavoro' },
  { key: 'TipoRapporto', label: 'Tipo di rapporto', type: 'choice', choices: TIPO_RAPPORTO, section: 'Rapporto di lavoro' },
  { key: 'AreaAssunzione', label: 'Cooperativa (Tipo A / Tipo B)', type: 'choice', choices: AREA_ASSUNZIONE, section: 'Rapporto di lavoro' },
  { key: 'LivelloContrattuale', label: 'Livello contrattuale', type: 'choice', choices: LIVELLO, section: 'Rapporto di lavoro' },
  { key: 'Mansione', label: 'Mansione', type: 'choice', choices: MANSIONE, section: 'Rapporto di lavoro', inList: true },
  { key: 'ServizioAppartenenza', label: 'Servizio di appartenenza', type: 'choice', choices: SERVIZIO, section: 'Rapporto di lavoro', inList: true },
  { key: 'DataDimissioneLavoratore', label: 'Data dimissione lavoratore', type: 'date', section: 'Rapporto di lavoro' },
  { key: 'StatoServizio', label: 'Stato di servizio / note contrattuali', type: 'textarea', section: 'Rapporto di lavoro' },

  { key: 'IBAN', label: 'IBAN', type: 'text', section: 'Dati bancari e previdenza' },
  { key: 'AdesioneFondoPensione', label: 'Adesione a fondo pensione (destinazione TFR)', type: 'choice', choices: SINO, section: 'Dati bancari e previdenza' },
  { key: 'FondoPensioneDettaglio', label: 'Fondo pensione / dettaglio', type: 'text', section: 'Dati bancari e previdenza' },

  { key: 'Socio', label: 'Socio', type: 'choice', choices: SINO, section: 'Socio' },
  { key: 'DataAmmissioneSocio', label: 'Data ammissione socio', type: 'date', section: 'Socio' },
  { key: 'QuotaSociale', label: 'Quota sociale sottoscritta', type: 'currency', section: 'Socio' },
  { key: 'QuotaSocialeVersata', label: 'Quota sociale già versata', type: 'currency', section: 'Socio' },
  { key: 'QuotaSocialeRestituita', label: 'Quota sociale restituita', type: 'currency', section: 'Socio' },
  { key: 'DataDimissioneSocio', label: 'Data dimissione socio', type: 'date', section: 'Socio' },

  { key: 'InvalidoSvantaggiato', label: 'Invalido civile / svantaggiato', type: 'choice', choices: SINO, section: 'Svantaggio e informazioni personali' },
  { key: 'TipologiaSvantaggio', label: 'Tipologia invalidità / svantaggio', type: 'choice', choices: TIPOLOGIA_SVANTAGGIO, section: 'Svantaggio e informazioni personali' },
  { key: 'Legge104', label: 'Legge 104', type: 'choice', choices: SINO, section: 'Svantaggio e informazioni personali' },
  { key: 'StatoFamiglia', label: 'Stato di famiglia', type: 'text', section: 'Svantaggio e informazioni personali' },
  { key: 'FondoCoopersalute', label: 'Fondo Coopersalute', type: 'text', section: 'Svantaggio e informazioni personali' },

  { key: 'Note', label: 'Note', type: 'textarea', section: 'Note' },
]

export const COLLABORATORI_FIELDS: readonly RUField[] = [
  { key: 'Cognome', label: 'Cognome', type: 'text', section: 'Anagrafica', inList: true },
  { key: 'Nome', label: 'Nome', type: 'text', section: 'Anagrafica', inList: true },
  { key: 'Genere', label: 'Genere', type: 'choice', choices: GENERE, section: 'Anagrafica' },
  { key: 'RecapitoTelefonico', label: 'Recapito telefonico', type: 'tel', section: 'Anagrafica' },
  { key: 'CategoriaProfessionale', label: 'Categoria professionale', type: 'text', section: 'Prestazione', inList: true },
  { key: 'TipoPrestazione', label: 'Tipo di prestazione', type: 'text', section: 'Prestazione', inList: true },
  { key: 'ServizioCoop', label: 'Servizio coop interessato', type: 'choice', choices: SERVIZIO, section: 'Prestazione' },
  { key: 'SocioCooperativa', label: 'Socio cooperativa', type: 'choice', choices: SINO, section: 'Socio' },
  { key: 'CapitaleSociale', label: 'Capitale sociale sottoscritto', type: 'currency', section: 'Socio' },
  { key: 'Note', label: 'Note', type: 'textarea', section: 'Note' },
]

export const TIROCINI_FIELDS: readonly RUField[] = [
  { key: 'Cognome', label: 'Cognome', type: 'text', section: 'Anagrafica', inList: true },
  { key: 'Nome', label: 'Nome', type: 'text', section: 'Anagrafica', inList: true },
  { key: 'Genere', label: 'Genere', type: 'choice', choices: GENERE, section: 'Anagrafica' },
  { key: 'DataNascita', label: 'Data di nascita', type: 'date', section: 'Anagrafica' },
  { key: 'LuogoNascita', label: 'Luogo di nascita', type: 'text', section: 'Anagrafica' },
  { key: 'Nazionalita', label: 'Nazionalità', type: 'text', section: 'Anagrafica' },
  { key: 'StatoCivile', label: 'Stato civile', type: 'choice', choices: STATO_CIVILE, section: 'Anagrafica' },
  { key: 'Residenza', label: 'Residenza', type: 'text', section: 'Contatti e residenza' },
  { key: 'Domicilio', label: 'Domicilio', type: 'text', section: 'Contatti e residenza' },
  { key: 'RecapitoTelefonico', label: 'Recapito telefonico', type: 'tel', section: 'Contatti e residenza' },
  { key: 'LivelloIstruzione', label: 'Livello di istruzione', type: 'text', section: 'Tirocinio' },
  { key: 'CategoriaTirocinante', label: 'Categoria tirocinante', type: 'text', section: 'Tirocinio' },
  { key: 'TipologiaTirocinio', label: 'Tipologia di tirocinio', type: 'text', section: 'Tirocinio' },
  { key: 'AttivitaAteco', label: 'Attività (cod. ATECO)', type: 'text', section: 'Tirocinio' },
  { key: 'SoggettoOspitante', label: 'Soggetto ospitante', type: 'text', section: 'Tirocinio', inList: true },
  { key: 'DataInizio', label: 'Data inizio tirocinio', type: 'date', section: 'Tirocinio' },
  { key: 'DataFine', label: 'Data fine tirocinio', type: 'date', section: 'Tirocinio' },
  { key: 'DurataMesi', label: 'Durata (mesi)', type: 'number', section: 'Tirocinio' },
  { key: 'ImpegnoOrarioSettimanale', label: 'Impegno orario settimanale', type: 'text', section: 'Tirocinio' },
  { key: 'IndennitaMensileLorda', label: 'Indennità mensile lorda', type: 'currency', section: 'Tirocinio' },
  { key: 'StatoTirocinio', label: 'Stato tirocinio', type: 'choice', choices: STATO_TIROCINIO, section: 'Tirocinio', inList: true },
  { key: 'CategoriaCollaborazione', label: 'Categoria collaborazione', type: 'choice', choices: CATEGORIA_COLLAB, section: 'Tirocinio' },
  { key: 'Note', label: 'Note', type: 'textarea', section: 'Note' },
]

export interface RUEntityConfig {
  entity: RUEntity
  label: string        // plurale
  singolare: string
  emoji: string
  fields: readonly RUField[]
}

export const RU_CONFIG: Record<RUEntity, RUEntityConfig> = {
  dipendenti: { entity: 'dipendenti', label: 'Dipendenti', singolare: 'Dipendente', emoji: '👤', fields: DIPENDENTI_FIELDS },
  collaboratori: { entity: 'collaboratori', label: 'Collaboratori', singolare: 'Collaboratore', emoji: '🤝', fields: COLLABORATORI_FIELDS },
  tirocini: { entity: 'tirocini', label: 'Tirocini', singolare: 'Tirocinante', emoji: '🎓', fields: TIROCINI_FIELDS },
}
