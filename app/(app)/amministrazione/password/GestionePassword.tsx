'use client'

/**
 * Cassaforte delle credenziali — elenco, ricerca, scheda di modifica.
 *
 * Tre cose decise qui, e il perché:
 *
 * 1. **Niente tabella.** Ogni voce è una card che sotto i 640px sta in colonna:
 *    la regola 5-bis di CLAUDE.md. Le credenziali si consultano quasi sempre col
 *    telefono in mano, davanti allo sportello o al portale che chiede il codice.
 * 2. **Password e PIN nascosti di partenza**, con "mostra" e "copia" separati:
 *    per usarne una non serve quasi mai leggerla, e quello che non compare a
 *    schermo non finisce nella foto di qualcun altro. Chi la mostra se la vede
 *    richiudere da sola dopo mezzo minuto.
 * 3. **La scheda è un `Modale`**, non un pannello in cima alla pagina: su
 *    telefono sale dal basso a tutta larghezza, e l'elenco resta dov'era.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'
import { Modale } from '@/components/ui/Modale'
import { Kpi } from '@/components/ui/Kpi'
import {
  CATEGORIE_PASSWORD,
  GIORNI_PASSWORD_VECCHIA,
  categoriaDi,
  passwordVecchia,
  type VocePassword,
} from '@/types/password'
import { SchedaVoce } from './_componenti/SchedaVoce'
import { FiltriCategoria } from './_componenti/FiltriCategoria'

/** Dopo quanti millisecondi un valore mostrato si richiude da solo. */
const RICHIUDI_DOPO = 30_000

type FormState = {
  nome: string
  categoria: string
  nomeUtente: string
  password: string
  pin: string
  linkSito: string
  telefonoVerifica: string
  note: string
}

const FORM_VUOTO: FormState = {
  nome: '',
  categoria: '',
  nomeUtente: '',
  password: '',
  pin: '',
  linkSito: '',
  telefonoVerifica: '',
  note: '',
}

function fromVoce(v: VocePassword): FormState {
  return {
    nome: v.nome,
    categoria: v.categoria,
    nomeUtente: v.nomeUtente,
    password: v.password,
    pin: v.pin,
    linkSito: v.linkSito,
    telefonoVerifica: v.telefonoVerifica,
    note: v.note,
  }
}

const BTN_PRIMARIO =
  'bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-60'
const BTN_NEUTRO =
  'text-sm font-semibold px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-60'

export function GestionePassword({ iniziali }: { iniziali: VocePassword[] }) {
  const [lista, setLista] = useState<VocePassword[]>(iniziali)
  const [cerca, setCerca] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [schedaAperta, setSchedaAperta] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VUOTO)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  /** Chiave "id:campo" → valore in chiaro a schermo */
  const [scoperti, setScoperti] = useState<Record<string, boolean>>({})
  const [copiato, setCopiato] = useState<string | null>(null)

  // I valori mostrati si richiudono da soli: un timer solo per tutti, riarmato
  // a ogni "mostra". Senza questo basta lasciare il telefono sul tavolo.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!Object.values(scoperti).some(Boolean)) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setScoperti({}), RICHIUDI_DOPO)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [scoperti])

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    return lista.filter((v) => {
      // `categoriaDi`: le voci senza categoria stanno sotto "Altro", come nei conteggi.
      if (filtroCat && categoriaDi(v) !== filtroCat) return false
      if (!q) return true
      // Si cerca su quello che si ricorda: il nome, l'utente, il sito, le note.
      // Mai sulla password: digitarla nel campo di ricerca la metterebbe a schermo.
      return [v.nome, v.nomeUtente, v.linkSito, v.categoria, v.note]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [lista, cerca, filtroCat])

  const daAggiornare = useMemo(() => lista.filter(passwordVecchia).length, [lista])

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  function apriNuova() {
    setEditId(null)
    setForm(FORM_VUOTO)
    setErrore(null)
    setSchedaAperta(true)
  }

  function apriModifica(v: VocePassword) {
    setEditId(v.spItemId)
    setForm(fromVoce(v))
    setErrore(null)
    setSchedaAperta(true)
  }

  function chiudiScheda() {
    setSchedaAperta(false)
    setEditId(null)
    setForm(FORM_VUOTO)
  }

  async function copia(chiave: string, valore: string) {
    try {
      await navigator.clipboard?.writeText(valore)
      setCopiato(chiave)
      setTimeout(() => setCopiato((c) => (c === chiave ? null : c)), 1500)
    } catch {
      // Appunti negati dal browser: si mostra il valore, così si copia a mano.
      setScoperti((p) => ({ ...p, [chiave]: true }))
    }
  }

  async function salva() {
    if (busy) return
    if (!form.nome.trim()) {
      setErrore('Il nome della voce è obbligatorio.')
      return
    }
    setErrore(null)
    setBusy(true)
    try {
      const url = editId ? `/api/password/${editId}` : '/api/password'
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore salvataggio')
      const { voce } = await res.json()
      setLista((prev) =>
        editId ? prev.map((v) => (v.spItemId === editId ? voce : v)) : [voce, ...prev],
      )
      chiudiScheda()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  async function elimina(v: VocePassword) {
    if (busy) return
    if (!confirm(`Eliminare "${v.nome}"? L'operazione non è reversibile.`)) return
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/password/${v.spItemId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore eliminazione')
      setLista((prev) => prev.filter((x) => x.spItemId !== v.spItemId))
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Riepilogo */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi titolo="Voci in archivio" valore={lista.length} dimensione="lg" accento="slate" />
        <Kpi
          titolo={`Password ferme da oltre ${Math.round(GIORNI_PASSWORD_VECCHIA / 30)} mesi`}
          valore={daAggiornare}
          dimensione="lg"
          accento={daAggiornare > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Ricerca + nuova voce. `flex-wrap`: su telefono il bottone va a capo intero. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <Campo
            etichetta="Cerca"
            valore={cerca}
            onChange={setCerca}
            segnaposto="nome, utente, sito…"
          />
        </div>
        <button onClick={apriNuova} className={`${BTN_PRIMARIO} w-full sm:w-auto`}>
          + Nuova voce
        </button>
      </div>

      {/* Categorie: bottoni colorati, non una tendina. Vedi FiltriCategoria. */}
      <FiltriCategoria lista={lista} filtro={filtroCat} onFiltro={setFiltroCat} />

      <Banner tono="errore">{errore}</Banner>

      {/* Elenco */}
      {visibili.length === 0 ? (
        <Vuoto>
          {lista.length === 0
            ? 'Nessuna credenziale in archivio. Aggiungi la prima voce.'
            : filtroCat && cerca.trim()
              ? `Nessuna voce in “${filtroCat}” corrisponde alla ricerca.`
              : 'Nessuna voce corrisponde alla ricerca.'}
        </Vuoto>
      ) : (
        <div className="space-y-3">
          {visibili.map((v) => (
            <SchedaVoce
              key={v.spItemId}
              voce={v}
              scoperti={scoperti}
              copiato={copiato}
              onScopri={(chiave) => setScoperti((p) => ({ ...p, [chiave]: !p[chiave] }))}
              onCopia={copia}
              onModifica={() => apriModifica(v)}
              onElimina={() => elimina(v)}
              disabilitato={busy}
            />
          ))}
        </div>
      )}

      {/* Scheda crea/modifica */}
      {schedaAperta && (
        <Modale
          titolo={editId ? 'Modifica voce' : 'Nuova voce'}
          sottotitolo={
            editId
              ? 'La data dell’ultima modifica password si aggiorna solo se cambi davvero la password.'
              : undefined
          }
          onChiudi={chiudiScheda}
          azioni={
            <>
              <button onClick={chiudiScheda} disabled={busy} className={`${BTN_NEUTRO} flex-1`}>
                Annulla
              </button>
              <button onClick={salva} disabled={busy} className={`${BTN_PRIMARIO} flex-1`}>
                {busy ? 'Salvataggio…' : 'Salva'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <Banner tono="errore">{errore}</Banner>

            <Campo
              etichetta="A cosa serve"
              valore={form.nome}
              onChange={(x) => set('nome', x)}
              obbligatorio
              segnaposto="es. INPS — Cassetto previdenziale"
            />
            <Campo
              etichetta="Categoria"
              tipo="choice"
              valore={form.categoria}
              onChange={(x) => set('categoria', x)}
              scelte={CATEGORIE_PASSWORD}
            />
            <Campo
              etichetta="Nome utente"
              valore={form.nomeUtente}
              onChange={(x) => set('nomeUtente', x)}
              segnaposto="utente o email di accesso"
            />
            <Campo
              etichetta="Password"
              valore={form.password}
              onChange={(x) => set('password', x)}
            />
            <Campo
              etichetta="PIN"
              valore={form.pin}
              onChange={(x) => set('pin', x)}
              aiuto="Se il servizio ne ha uno. Altrimenti lascia vuoto."
            />
            <Campo
              etichetta="Link al sito"
              valore={form.linkSito}
              onChange={(x) => set('linkSito', x)}
              segnaposto="https://…"
            />
            <Campo
              etichetta="Telefono per il secondo fattore"
              tipo="tel"
              valore={form.telefonoVerifica}
              onChange={(x) => set('telefonoVerifica', x)}
              aiuto="Il numero su cui arriva l’SMS o la notifica di verifica."
            />
            <Campo
              etichetta="Note"
              tipo="textarea"
              valore={form.note}
              onChange={(x) => set('note', x)}
              righe={2}
            />

            {editId && (
              <p className="text-xs text-gray-400">
                Le date di inserimento e di ultima modifica le tiene l’app: non si scrivono a mano.
              </p>
            )}
          </div>
        </Modale>
      )}
    </div>
  )
}
