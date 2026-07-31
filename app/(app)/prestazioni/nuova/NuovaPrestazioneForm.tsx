'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CASISTICHE_GDPR } from '@/lib/casistiche-gdpr'
import {
  MAX_UPLOAD_BYTES,
  maxUploadMb,
  inviaFileABlocchi,
  erroreRisposta,
} from '@/lib/upload-diretto'

const CF_REGEX = /^[A-Z]{6}\d{2}[A-EHLMPR-T]{1}\d{2}[A-Z]{1}\d{3}[A-Z]{1}$/

interface PrestatoreAnagrafica {
  nome: string
  cognome: string
  dataNascita: string
  luogoNascita: string
  codiceFiscale: string
  residenza: string
  ruolo: string
  email: string
  telefono: string
  iban: string
}

export function NuovaPrestazioneForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Avanzamento del caricamento diretto a SharePoint (null = nessun upload in corso)
  const [faseUpload, setFaseUpload] = useState<string | null>(null)
  const [avanzamento, setAvanzamento] = useState<number | null>(null)

  const [form, setForm] = useState({
    // Anagrafica prestatore
    nome: '',
    cognome: '',
    dataNascita: '',
    luogoNascita: '',
    codiceFiscale: '',
    residenza: '',
    ruolo: '',
    email: '',
    telefono: '',
    iban: '',
    // Dati prestazione
    giorni: '',
    dataInizio: '',
    dataFine: '',
    attivita: '',
    compensoPrevisto: '',
    casisticaGdpr: '',
  })

  // Allegati
  const [copiaCf, setCopiaCf] = useState<File | null>(null)
  const [copiaCi, setCopiaCi] = useState<File | null>(null)
  // True se il prestatore selezionato ha già i documenti d'identità in archivio
  const [documentiGiaPresenti, setDocumentiGiaPresenti] = useState(false)
  const [verificaDocumenti, setVerificaDocumenti] = useState(false)

  // Anagrafica prestatori (per non reinserire i dati di chi è già noto)
  const [anagrafica, setAnagrafica] = useState<PrestatoreAnagrafica[]>([])
  const [ricerca, setRicerca] = useState('')
  const [mostraRisultati, setMostraRisultati] = useState(false)

  useEffect(() => {
    fetch('/api/prestatori')
      .then((r) => r.json())
      .then((d) => setAnagrafica(Array.isArray(d.prestatori) ? d.prestatori : []))
      .catch(() => setAnagrafica([]))
  }, [])

  const risultati = useMemo(() => {
    const q = ricerca.trim().toLowerCase()
    if (q.length < 2) return []
    return anagrafica
      .filter(
        (p) =>
          `${p.cognome} ${p.nome}`.toLowerCase().includes(q) ||
          p.codiceFiscale.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [ricerca, anagrafica])

  function selezionaPrestatore(p: PrestatoreAnagrafica) {
    setForm((f) => ({
      ...f,
      nome: p.nome,
      cognome: p.cognome,
      dataNascita: (p.dataNascita || '').slice(0, 10),
      luogoNascita: p.luogoNascita,
      codiceFiscale: p.codiceFiscale,
      residenza: p.residenza,
      ruolo: p.ruolo,
      email: p.email,
      telefono: p.telefono,
      iban: p.iban,
    }))
    setRicerca(`${p.cognome} ${p.nome}`)
    setMostraRisultati(false)
    // Verifica se i documenti d'identità sono già archiviati per questo CF
    if (p.codiceFiscale) {
      setVerificaDocumenti(true)
      setDocumentiGiaPresenti(false)
      fetch(`/api/prestatori/documenti?cf=${encodeURIComponent(p.codiceFiscale)}`)
        .then((r) => r.json())
        .then((d) => setDocumentiGiaPresenti(!!d.haDocumenti))
        .catch(() => setDocumentiGiaPresenti(false))
        .finally(() => setVerificaDocumenti(false))
    }
  }

  const set = (key: string, value: string) => {
    // Se cambio manualmente il CF, i documenti vanno ri-richiesti (prestatore diverso)
    if (key === 'codiceFiscale') {
      setDocumentiGiaPresenti(false)
    }
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate(): string | null {
    const required: [string, string][] = [
      [form.nome, 'Nome'],
      [form.cognome, 'Cognome'],
      [form.dataNascita, 'Data di nascita'],
      [form.luogoNascita, 'Luogo di nascita'],
      [form.codiceFiscale, 'Codice fiscale'],
      [form.residenza, 'Residenza'],
      [form.ruolo, 'Ruolo'],
      [form.email, 'Email'],
      [form.telefono, 'Telefono'],
      [form.iban, 'IBAN'],
      [form.giorni, 'Numero giorni'],
      [form.dataInizio, 'Data inizio'],
      [form.dataFine, 'Data fine'],
      [form.attivita, 'Attività oggetto'],
      [form.compensoPrevisto, 'Compenso previsto'],
      [form.casisticaGdpr, 'Casistica GDPR'],
    ]
    for (const [val, label] of required) {
      if (!String(val).trim()) return `⚠️ Campo obbligatorio mancante: ${label}.`
    }

    const cf = form.codiceFiscale.trim().toUpperCase()
    if (!CF_REGEX.test(cf)) return '⚠️ Codice fiscale non valido (formato 16 caratteri).'

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return '⚠️ Email non valida.'

    const iban = form.iban.replace(/\s+/g, '').toUpperCase()
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban))
      return '⚠️ IBAN non valido.'

    if (form.dataFine < form.dataInizio)
      return '⚠️ La data fine non può precedere la data inizio.'

    const giorni = Number(form.giorni)
    if (!Number.isInteger(giorni) || giorni <= 0)
      return '⚠️ Il numero di giorni deve essere un intero positivo.'

    const compenso = Number(form.compensoPrevisto.replace(',', '.'))
    if (!Number.isFinite(compenso) || compenso <= 0)
      return '⚠️ Il compenso previsto deve essere un importo positivo.'

    if (!documentiGiaPresenti) {
      if (!copiaCf) return '⚠️ Allega la copia del codice fiscale.'
      if (!copiaCi) return '⚠️ Allega la copia della carta d’identità.'
    }

    for (const f of [copiaCf, copiaCi]) {
      if (f && f.size > MAX_UPLOAD_BYTES)
        return `⚠️ Allegato troppo grande (max ${maxUploadMb()} MB): ${f.name}`
    }

    return null
  }

  /**
   * Carica un documento d'identità DIRETTAMENTE su SharePoint, a blocchi.
   * Il nostro server apre solo la sessione: i byte non passano da Vercel, quindi
   * non vale più il vecchio limite dei 4 MB.
   */
  async function caricaDocumento(spItemId: string, tipo: 'cf' | 'ci', file: File) {
    const etichetta = tipo === 'cf' ? 'codice fiscale' : 'carta d’identità'
    setFaseUpload(`Caricamento ${etichetta}…`)
    setAvanzamento(0)

    const resSessione = await fetch(`/api/prestazioni/${spItemId}/allegati-identita`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, filename: file.name, dimensione: file.size }),
    })
    if (!resSessione.ok) {
      throw new Error(
        await erroreRisposta(resSessione, `Errore apertura caricamento ${etichetta}`),
      )
    }
    const { uploadUrl, nomeFile } = (await resSessione.json()) as {
      uploadUrl: string
      nomeFile: string
    }

    await inviaFileABlocchi(uploadUrl, file, setAvanzamento)
    return nomeFile
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const err = validate()
    if (err) {
      setError(err)
      return
    }

    setLoading(true)
    try {
      // 1. Record + cartelle (solo dati, nessun file: body JSON)
      setFaseUpload('Creazione pratica…')
      const res = await fetch('/api/prestazioni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          allegheraCf: !!copiaCf,
          allegheraCi: !!copiaCi,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante il salvataggio')

      // 2. Documenti d'identità: PUT diretto a SharePoint
      const caricati: string[] = []
      if (copiaCf) caricati.push(await caricaDocumento(data.spItemId, 'cf', copiaCf))
      if (copiaCi) caricati.push(await caricaDocumento(data.spItemId, 'ci', copiaCi))

      // 3. Conferma: mail di riepilogo + log
      setFaseUpload('Invio riepilogo…')
      setAvanzamento(null)
      const resConferma = await fetch(`/api/prestazioni/${data.spItemId}/conferma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentiCaricati: caricati }),
      })
      if (!resConferma.ok) {
        throw new Error(
          await erroreRisposta(
            resConferma,
            `Pratica ${data.idPrestazione} creata, ma l'invio del riepilogo è fallito.`,
          ),
        )
      }

      setSuccess(
        `✅ Prestazione creata: ${data.idPrestazione}. Cartella SharePoint creata e mail di riepilogo inviata.`,
      )
      setForm({
        nome: '', cognome: '', dataNascita: '', luogoNascita: '', codiceFiscale: '',
        residenza: '', ruolo: '', email: '', telefono: '', iban: '', giorni: '', dataInizio: '',
        dataFine: '', attivita: '', compensoPrevisto: '', casisticaGdpr: '',
      })
      setCopiaCf(null)
      setCopiaCi(null)
      setDocumentiGiaPresenti(false)
      setRicerca('')
    } catch (err: any) {
      setError(err?.message ?? 'Errore imprevisto')
    } finally {
      setLoading(false)
      setFaseUpload(null)
      setAvanzamento(null)
    }
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'
  const fileClass =
    'w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent-purple/10 file:text-accent-purple hover:file:bg-accent-purple/20'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary-dark">Nuova prestazione occasionale</h2>
        <button
          type="button"
          onClick={() => router.push('/prestazioni')}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Indietro
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{success}</div>
      )}

      {/* Anagrafica prestatore */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-accent-purple uppercase tracking-wide">
          Prestatore
        </legend>

        {/* Ricerca da anagrafica */}
        <div className="relative">
          <label className={labelClass}>Cerca prestatore già inserito</label>
          <input
            className={inputClass}
            value={ricerca}
            onChange={(e) => {
              setRicerca(e.target.value)
              setMostraRisultati(true)
            }}
            onFocus={() => setMostraRisultati(true)}
            placeholder="Digita cognome o codice fiscale…"
          />
          {mostraRisultati && risultati.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {risultati.map((p) => (
                <li key={p.codiceFiscale}>
                  <button
                    type="button"
                    onClick={() => selezionaPrestatore(p)}
                    className="w-full text-left px-3 py-2 hover:bg-accent-purple/10 text-sm"
                  >
                    <span className="font-medium text-gray-800">{p.cognome} {p.nome}</span>
                    <span className="block text-xs text-gray-400">{p.codiceFiscale}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Seleziona per compilare automaticamente i campi, oppure inseriscili a mano per un nuovo prestatore.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Nome *</label>
            <input className={inputClass} value={form.nome} onChange={(e) => set('nome', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Cognome *</label>
            <input className={inputClass} value={form.cognome} onChange={(e) => set('cognome', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Data di nascita *</label>
            <input type="date" className={inputClass} value={form.dataNascita} onChange={(e) => set('dataNascita', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Luogo di nascita *</label>
            <input className={inputClass} value={form.luogoNascita} onChange={(e) => set('luogoNascita', e.target.value)} placeholder="Es. Torino (TO)" />
          </div>
          <div>
            <label className={labelClass}>Codice fiscale *</label>
            <input
              className={`${inputClass} uppercase`}
              value={form.codiceFiscale}
              onChange={(e) => set('codiceFiscale', e.target.value.toUpperCase())}
              maxLength={16}
              placeholder="RSSMRA80A01H501U"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-accent-purple mb-1">
            Residenza * <span className="font-medium text-gray-500">(Indirizzo, Comune e CAP)</span>
          </label>
          <input className={inputClass} value={form.residenza} onChange={(e) => set('residenza', e.target.value)} placeholder="Es. Via Roma 12, Torino (TO), 10100" />
        </div>

        <div>
          <label className={labelClass}>Ruolo *</label>
          <input className={inputClass} value={form.ruolo} onChange={(e) => set('ruolo', e.target.value)} placeholder="Es. Educatrice" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email *</label>
            <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Telefono *</label>
            <input className={inputClass} value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelClass}>IBAN *</label>
          <input
            className={`${inputClass} uppercase`}
            value={form.iban}
            onChange={(e) => set('iban', e.target.value.toUpperCase())}
            placeholder="IT60 X054 2811 1010 0000 0123 456"
          />
          <p className="text-xs text-gray-400 mt-1">Per il pagamento del compenso.</p>
        </div>
      </fieldset>

      {/* Dati prestazione */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-accent-purple uppercase tracking-wide">
          Prestazione
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>N. giorni *</label>
            <input type="number" min={1} className={inputClass} value={form.giorni} onChange={(e) => set('giorni', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Data inizio *</label>
            <input type="date" className={inputClass} value={form.dataInizio} onChange={(e) => set('dataInizio', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Data fine *</label>
            <input type="date" className={inputClass} value={form.dataFine} onChange={(e) => set('dataFine', e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Compenso previsto (€ lordo) *</label>
          <input
            type="number"
            min={1}
            step="0.01"
            className={inputClass}
            value={form.compensoPrevisto}
            onChange={(e) => set('compensoPrevisto', e.target.value)}
            placeholder="Es. 300,00 — importo indicativo riportato nel contratto"
          />
        </div>

        <div>
          <label className={labelClass}>Attività oggetto della prestazione *</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={form.attivita}
            onChange={(e) => set('attivita', e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>Casistica GDPR *</label>
          <select
            className={inputClass}
            value={form.casisticaGdpr}
            onChange={(e) => set('casisticaGdpr', e.target.value)}
          >
            <option value="">— Seleziona la casistica —</option>
            {CASISTICHE_GDPR.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Determina l&apos;autorizzazione al trattamento dei dati che il prestatore firmerà
            (i trattamenti in base ai dati che effettivamente gestisce).
          </p>
        </div>
      </fieldset>

      {/* Allegati */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-accent-purple uppercase tracking-wide">
          Documenti d&apos;identità
        </legend>

        {verificaDocumenti ? (
          <p className="text-sm text-gray-400">Verifica documenti in archivio…</p>
        ) : documentiGiaPresenti ? (
          <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">
            ✅ Documenti d&apos;identità già in archivio per questo prestatore: non serve ricaricarli.
            <span className="block text-xs text-green-600 mt-1">
              Se vuoi aggiornarli, caricali qui sotto.
            </span>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>Aggiorna codice fiscale (opzionale)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className={fileClass}
                  onChange={(e) => setCopiaCf(e.target.files?.[0] ?? null)}
                />
              </div>
              <div>
                <label className={labelClass}>Aggiorna carta d&apos;identità (opzionale)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className={fileClass}
                  onChange={(e) => setCopiaCi(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400">
              Primo inserimento di questo prestatore: i documenti vengono archiviati una sola
              volta e riutilizzati per le prestazioni successive.
            </p>
            <div>
              <label className={labelClass}>Copia codice fiscale *</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                className={fileClass}
                onChange={(e) => setCopiaCf(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className={labelClass}>Copia carta d&apos;identità *</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                className={fileClass}
                onChange={(e) => setCopiaCi(e.target.files?.[0] ?? null)}
              />
            </div>
          </>
        )}
      </fieldset>

      {faseUpload && (
        <div className="bg-accent-purple/5 border border-accent-purple/20 rounded-lg p-3">
          <p className="text-sm text-accent-purple font-medium">{faseUpload}</p>
          {avanzamento !== null && (
            <div className="mt-2 h-2 bg-accent-purple/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-purple transition-all"
                style={{ width: `${avanzamento}%` }}
              />
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent-purple text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Salvataggio…' : 'Salva'}
      </button>
    </form>
  )
}
