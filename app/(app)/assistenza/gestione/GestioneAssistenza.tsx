'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'
import { Kpi } from '@/components/ui/Kpi'
import { Modale } from '@/components/ui/Modale'
import { Voce } from '@/components/ui/Voce'
import {
  GIORNI_ARRETRATO,
  PRIORITA,
  PRIORITA_STILE,
  STATI_APERTI,
  STATO_STILE,
  arretrato,
  dataBreve,
  dispositivoDi,
  giorniDa,
  type AzioneAssistenza,
  type RichiestaAssistenza,
} from '@/types/assistenza'

/**
 * La scrivania di chi fa assistenza.
 *
 * Una lista sola con tre filtri e un pannello per ticket: le azioni sono poche
 * e quasi tutte a un clic, quelle che chiedono di scrivere qualcosa (assegna,
 * chiedi informazioni, risolvi, annulla) aprono la modale. Le stesse azioni
 * dell'API, con gli stessi nomi.
 */
export function GestioneAssistenza({
  iniziali,
  gestori,
  io,
}: {
  iniziali: RichiestaAssistenza[]
  gestori: string[]
  io: string
}) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<'aperti' | 'miei' | 'tutti'>('aperti')
  const [busy, setBusy] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [aperto, setAperto] = useState<RichiestaAssistenza | null>(null)
  const [modale, setModale] = useState<AzioneAssistenza | null>(null)
  const [testo, setTesto] = useState('')
  const [testo2, setTesto2] = useState('')
  const [ore, setOre] = useState('')
  const [destinatario, setDestinatario] = useState('')

  const mioNome = io.toLowerCase()

  const visibili = useMemo(() => {
    const aperti = iniziali.filter((t) => STATI_APERTI.includes(t.stato))
    if (filtro === 'tutti') return iniziali
    if (filtro === 'miei') {
      // Il confronto è sul nome perché la Person column non porta l'email:
      // basta il cognome per riconoscersi nella propria coda.
      const mio = mioNome.split('@')[0].split('.')
      return aperti.filter((t) =>
        mio.every((p) => (t.assegnatoNome ?? '').toLowerCase().includes(p)),
      )
    }
    return aperti
  }, [iniziali, filtro, mioNome])

  const conteggi = useMemo(
    () => ({
      aperti: iniziali.filter((t) => STATI_APERTI.includes(t.stato)).length,
      nuovi: iniziali.filter((t) => t.stato === 'Inviata').length,
      critici: iniziali.filter(
        (t) => STATI_APERTI.includes(t.stato) && t.priorita === 'Critica',
      ).length,
      arretrati: iniziali.filter(arretrato).length,
    }),
    [iniziali],
  )

  function chiudiModale() {
    setModale(null)
    setTesto('')
    setTesto2('')
    setOre('')
    setDestinatario('')
  }

  async function azione(t: RichiestaAssistenza, body: Record<string, unknown>) {
    setBusy(t.spItemId)
    setErrore(null)
    try {
      const res = await fetch(`/api/assistenza/${t.spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Operazione non riuscita')
      chiudiModale()
      setAperto(null)
      router.refresh()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Kpi titolo="aperti" valore={conteggi.aperti} dimensione="lg" accento="cyan" />
        <Kpi titolo="da vedere" valore={conteggi.nuovi} dimensione="lg" accento="violet" />
        <Kpi titolo="critici" valore={conteggi.critici} dimensione="lg" accento="red" />
        <Kpi
          titolo={`da oltre ${GIORNI_ARRETRATO} gg`}
          valore={conteggi.arretrati}
          dimensione="lg"
          accento="amber"
        />
      </div>

      <div className="flex items-center gap-2 text-xs">
        {(['aperti', 'miei', 'tutti'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-full border capitalize ${
              filtro === f
                ? 'bg-brand-cyan text-white border-brand-cyan'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {f === 'miei' ? 'i miei' : f}
          </button>
        ))}
      </div>

      <Banner tono="errore">{errore}</Banner>

      {visibili.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Niente da lavorare qui.
        </div>
      ) : (
        <div className="space-y-2">
          {visibili.map((t) => {
            const stile = STATO_STILE[t.stato] ?? STATO_STILE['Inviata']
            const giorni = giorniDa(t.dataApertura) ?? 0
            return (
              <button
                key={t.spItemId}
                onClick={() => setAperto(t)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-gray-700">
                      {t.codice}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {dataBreve(t.dataApertura)}
                      {STATI_APERTI.includes(t.stato) && giorni > 0 && ` · ${giorni} gg`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITA_STILE[t.priorita] ?? ''}`}>
                      {t.priorita}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${stile.badge}`}
                    >
                      {t.stato}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-800">{t.problema}</p>

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{t.richiedenteNome}</span>
                  <span className="text-gray-300">·</span>
                  <span>{t.categoria}</span>
                  {dispositivoDi(t) && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span>{dispositivoDi(t)}</span>
                    </>
                  )}
                  {t.struttura?.value && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span>{t.struttura.value}</span>
                    </>
                  )}
                  {t.assegnatoNome ? (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-600">{t.assegnatoNome}</span>
                    </>
                  ) : (
                    <span className="text-violet-600 font-semibold">da assegnare</span>
                  )}
                  {t.riaperture > 0 && (
                    <span className="text-orange-600 font-semibold">
                      riaperto ×{t.riaperture}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ---------------- dettaglio ---------------- */}
      {aperto && !modale && (
        <Modale
          titolo={aperto.codice}
          sottotitolo={`${aperto.tipologia} · ${aperto.categoria}`}
          onChiudi={() => setAperto(null)}
          azioni={
            <div className="flex flex-wrap gap-2">
              {aperto.stato === 'Inviata' && (
                <Azione
                  testo="Prendo in carico"
                  primario
                  disabilitato={busy === aperto.spItemId}
                  onClick={() => azione(aperto, { azione: 'prendi-in-carico' })}
                />
              )}
              {STATI_APERTI.includes(aperto.stato) && aperto.stato !== 'In lavorazione' && (
                <Azione
                  testo="Ci lavoro"
                  disabilitato={busy === aperto.spItemId}
                  onClick={() => azione(aperto, { azione: 'lavora' })}
                />
              )}
              {STATI_APERTI.includes(aperto.stato) && (
                <>
                  <Azione testo="Assegna" onClick={() => setModale('assegna')} />
                  <Azione testo="Priorità" onClick={() => setModale('priorita')} />
                  <Azione testo="Attesa fornitore" onClick={() => setModale('attesa-fornitore')} />
                  <Azione testo="Chiedi info" onClick={() => setModale('chiedi-info')} />
                  <Azione testo="Risolvi" primario onClick={() => setModale('risolvi')} />
                  <Azione testo="Annulla" onClick={() => setModale('annulla')} />
                </>
              )}
              <Azione testo="Nota" onClick={() => setModale('note')} />
            </div>
          }
        >
          <dl className="space-y-1.5 text-sm">
            <Voce t="Richiedente" v={aperto.richiedenteNome} />
            <Voce t="Aperto il" v={dataBreve(aperto.dataApertura)} />
            <Voce t="Stato" v={`${aperto.stato} · priorità ${aperto.priorita}`} />
            <Voce t="Dispositivo" v={dispositivoDi(aperto) || '—'} />
            <Voce t="Impatto" v={`${aperto.impatto}${aperto.bloccante ? ' · non riesce a lavorare' : ''}`} />
            {aperto.daQuando && <Voce t="Da quando" v={dataBreve(aperto.daQuando)} />}
            {aperto.struttura?.value && <Voce t="Dove" v={aperto.struttura.value} />}
            {aperto.recapito && <Voce t="Telefono" v={aperto.recapito} />}
            {aperto.disponibilita && <Voce t="Reperibile" v={aperto.disponibilita} />}
            {aperto.centroCosto?.value && <Voce t="Centro di costo" v={aperto.centroCosto.value} />}
            {aperto.assegnatoNome && <Voce t="Assegnato a" v={aperto.assegnatoNome} />}
            {aperto.fornitoreEsterno && <Voce t="Fornitore" v={aperto.fornitoreEsterno} />}
            {aperto.oreLavoro != null && <Voce t="Ore" v={String(aperto.oreLavoro)} />}
          </dl>

          <p className="mt-3 text-sm text-gray-800 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
            {aperto.problema}
          </p>

          {aperto.allegatoNome && (
            <a
              href={aperto.allegatoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-xs text-brand-cyan underline"
            >
              📎 {aperto.allegatoNome}
            </a>
          )}

          {aperto.analisi && (
            <p className="mt-3 text-xs text-gray-600 whitespace-pre-wrap">
              <strong>Analisi:</strong> {aperto.analisi}
            </p>
          )}
          {aperto.interventi && (
            <p className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">
              <strong>Interventi:</strong> {aperto.interventi}
            </p>
          )}
          {aperto.noteInterne && (
            <p className="mt-2 text-xs text-gray-500 whitespace-pre-wrap border-t border-gray-100 pt-2">
              {aperto.noteInterne}
            </p>
          )}
        </Modale>
      )}

      {/* ---------------- azioni con testo ---------------- */}
      {aperto && modale && (
        <Modale
          titolo={TITOLI[modale] ?? 'Aggiorna'}
          sottotitolo={aperto.codice}
          onChiudi={chiudiModale}
          azioni={
            <div className="flex gap-3">
              <button
                onClick={chiudiModale}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Lascia stare
              </button>
              <button
                disabled={busy === aperto.spItemId}
                onClick={() => {
                  const body: Record<string, unknown> = { azione: modale }
                  if (modale === 'assegna') body.assegnatoEmail = destinatario
                  if (modale === 'priorita') body.priorita = testo
                  if (modale === 'attesa-fornitore') body.fornitoreEsterno = testo
                  if (modale === 'chiedi-info') body.messaggio = testo
                  if (modale === 'annulla') body.motivo = testo
                  if (modale === 'note') body.noteInterne = testo
                  if (modale === 'risolvi') {
                    body.interventi = testo
                    body.analisi = testo2 || undefined
                    body.oreLavoro = Number(ore) || undefined
                  }
                  azione(aperto, body)
                }}
                className="flex-1 bg-brand-cyan text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                Conferma
              </button>
            </div>
          }
        >
          {modale === 'assegna' && (
            <Campo
              etichetta="A chi"
              tipo="choice"
              scelte={gestori}
              valore={destinatario}
              onChange={setDestinatario}
              aiuto="Chi ha il permesso dell’area IT. Riceve subito una mail con il ticket."
            />
          )}

          {modale === 'priorita' && (
            <Campo
              etichetta="Priorità"
              tipo="choice"
              scelte={PRIORITA}
              valore={testo}
              onChange={setTesto}
              aiuto={`Adesso è ${aperto.priorita}, proposta da impatto e blocco dichiarati dal richiedente.`}
            />
          )}

          {modale === 'attesa-fornitore' && (
            <Campo
              etichetta="Chi stiamo aspettando"
              valore={testo}
              onChange={setTesto}
              segnaposto="Es. assistenza HP, ticket 4471"
              aiuto="Il ticket resta aperto e viene marcato come assistenza esterna."
            />
          )}

          {modale === 'chiedi-info' && (
            <Campo
              etichetta="Cosa ti serve sapere"
              tipo="textarea"
              righe={4}
              valore={testo}
              onChange={setTesto}
              obbligatorio
              aiuto="Questo testo arriva per mail al richiedente. Il ticket passa in “Attesa utente”."
            />
          )}

          {modale === 'risolvi' && (
            <div className="space-y-3">
              <Campo
                etichetta="Cosa hai fatto"
                tipo="textarea"
                righe={3}
                valore={testo}
                onChange={setTesto}
                obbligatorio
                aiuto="Lo legge il richiedente nella mail di chiusura, e resta nello storico del dispositivo."
              />
              <Campo
                etichetta="Analisi (resta interna)"
                tipo="textarea"
                righe={2}
                valore={testo2}
                onChange={setTesto2}
              />
              <Campo
                etichetta="Ore di lavoro"
                tipo="number"
                valore={ore}
                onChange={setOre}
                min={0}
                aiuto="Facoltativo. Serve al controllo di gestione, non al richiedente."
              />
            </div>
          )}

          {modale === 'annulla' && (
            <Campo
              etichetta="Perché si annulla"
              tipo="textarea"
              righe={3}
              valore={testo}
              onChange={setTesto}
              obbligatorio
              aiuto="Il motivo arriva al richiedente: annullare senza spiegare fa ritelefonare."
            />
          )}

          {modale === 'note' && (
            <Campo
              etichetta="Nota interna"
              tipo="textarea"
              righe={3}
              valore={testo}
              onChange={setTesto}
              aiuto="Si aggiunge in fondo alle precedenti, con la data. Non la vede il richiedente."
            />
          )}
        </Modale>
      )}
    </div>
  )
}

const TITOLI: Partial<Record<AzioneAssistenza, string>> = {
  assegna: 'Assegna il ticket',
  priorita: 'Cambia priorità',
  'attesa-fornitore': 'In attesa del fornitore',
  'chiedi-info': 'Chiedi una informazione',
  risolvi: 'Chiudi il ticket',
  annulla: 'Annulla il ticket',
  note: 'Aggiungi una nota',
}

function Azione({
  testo,
  onClick,
  primario,
  disabilitato,
}: {
  testo: string
  onClick: () => void
  primario?: boolean
  disabilitato?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabilitato}
      className={`text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50 ${
        primario
          ? 'bg-brand-cyan text-white'
          : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {testo}
    </button>
  )
}
