'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CASISTICHE_GDPR } from '@/lib/prestazioni/casistiche-gdpr'
import {
  MAX_UPLOAD_BYTES,
  maxUploadMb,
  inviaFileABlocchi,
  erroreRisposta,
} from '@/lib/core/upload-diretto'
import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { Allegato } from '@/components/ui/Allegato'
import { Banner } from '@/components/ui/Banner'

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
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 space-y-6">
      <h2 className="text-lg font-semibold text-primary-dark">Nuova prestazione occasionale</h2>

      <Banner tono="errore">{error}</Banner>
      <Banner tono="ok">{success}</Banner>

      {/* Anagrafica prestatore */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-accent-purple uppercase tracking-wide">
          Prestatore
        </legend>

        {/* Ricerca da anagrafica: non è un campo del form ma una ricerca con
            tendina di risultati, quindi resta scritta a mano. */}
        <div className="relative">
          <label className={labelCls}>Cerca prestatore già inserito</label>
          <input
            className={inputCls}
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
          <Campo etichetta="Nome" obbligatorio valore={form.nome} onChange={(v) => set('nome', v)} />
          <Campo etichetta="Cognome" obbligatorio valore={form.cognome} onChange={(v) => set('cognome', v)} />
          <Campo
            etichetta="Data di nascita"
            tipo="date"
            obbligatorio
            valore={form.dataNascita}
            onChange={(v) => set('dataNascita', v)}
          />
          <Campo
            etichetta="Luogo di nascita"
            obbligatorio
            segnaposto="Es. Torino (TO)"
            valore={form.luogoNascita}
            onChange={(v) => set('luogoNascita', v)}
          />
          <Campo
            etichetta="Codice fiscale"
            obbligatorio
            maiuscolo
            maxLength={16}
            segnaposto="RSSMRA80A01H501U"
            valore={form.codiceFiscale}
            onChange={(v) => set('codiceFiscale', v)}
          />
        </div>

        <Campo
          etichetta="Residenza"
          obbligatorio
          aiuto="Indirizzo, Comune e CAP"
          segnaposto="Es. Via Roma 12, Torino (TO), 10100"
          valore={form.residenza}
          onChange={(v) => set('residenza', v)}
        />

        <Campo
          etichetta="Ruolo"
          obbligatorio
          segnaposto="Es. Educatrice"
          valore={form.ruolo}
          onChange={(v) => set('ruolo', v)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            etichetta="Email"
            tipo="email"
            obbligatorio
            valore={form.email}
            onChange={(v) => set('email', v)}
          />
          <Campo
            etichetta="Telefono"
            tipo="tel"
            obbligatorio
            valore={form.telefono}
            onChange={(v) => set('telefono', v)}
          />
        </div>

        <Campo
          etichetta="IBAN"
          obbligatorio
          maiuscolo
          aiuto="Per il pagamento del compenso."
          segnaposto="IT60 X054 2811 1010 0000 0123 456"
          valore={form.iban}
          onChange={(v) => set('iban', v)}
        />
      </fieldset>

      {/* Dati prestazione */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-accent-purple uppercase tracking-wide">
          Prestazione
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo
            etichetta="N. giorni"
            tipo="number"
            obbligatorio
            min={1}
            valore={form.giorni}
            onChange={(v) => set('giorni', v)}
          />
          <Campo
            etichetta="Data inizio"
            tipo="date"
            obbligatorio
            valore={form.dataInizio}
            onChange={(v) => set('dataInizio', v)}
          />
          <Campo
            etichetta="Data fine"
            tipo="date"
            obbligatorio
            valore={form.dataFine}
            onChange={(v) => set('dataFine', v)}
          />
        </div>

        <Campo
          etichetta="Compenso previsto (€ lordo)"
          tipo="currency"
          obbligatorio
          min={1}
          segnaposto="Es. 300,00 — importo indicativo riportato nel contratto"
          valore={form.compensoPrevisto}
          onChange={(v) => set('compensoPrevisto', v)}
        />

        <Campo
          etichetta="Attività oggetto della prestazione"
          tipo="textarea"
          obbligatorio
          valore={form.attivita}
          onChange={(v) => set('attivita', v)}
        />

        <Campo
          etichetta="Casistica GDPR"
          tipo="choice"
          obbligatorio
          vuoto="— Seleziona la casistica —"
          scelte={CASISTICHE_GDPR.map((c) => ({ valore: c.key, etichetta: c.label }))}
          aiuto="Determina l'autorizzazione al trattamento dei dati che il prestatore firmerà (i trattamenti in base ai dati che effettivamente gestisce)."
          valore={form.casisticaGdpr}
          onChange={(v) => set('casisticaGdpr', v)}
        />
      </fieldset>

      {/* Allegati */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-accent-purple uppercase tracking-wide">
          Documenti d&apos;identità
        </legend>

        {verificaDocumenti ? (
          <p className="text-sm text-gray-400">Verifica documenti in archivio…</p>
        ) : documentiGiaPresenti ? (
          <Banner tono="ok">
            ✅ Documenti d&apos;identità già in archivio per questo prestatore: non serve ricaricarli.
            <span className="block text-xs mt-1">Se vuoi aggiornarli, caricali qui sotto.</span>
            <div className="mt-3 space-y-3">
              <Allegato
                etichetta="Aggiorna codice fiscale (opzionale)"
                file={copiaCf}
                onChange={setCopiaCf}
              />
              <Allegato
                etichetta="Aggiorna carta d'identità (opzionale)"
                file={copiaCi}
                onChange={setCopiaCi}
              />
            </div>
          </Banner>
        ) : (
          <>
            <p className="text-xs text-gray-400">
              Primo inserimento di questo prestatore: i documenti vengono archiviati una sola
              volta e riutilizzati per le prestazioni successive.
            </p>
            <Allegato
              etichetta="Copia codice fiscale"
              obbligatorio
              file={copiaCf}
              onChange={setCopiaCf}
            />
            <Allegato
              etichetta="Copia carta d'identità"
              obbligatorio
              file={copiaCi}
              onChange={setCopiaCi}
            />
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
