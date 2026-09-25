/**
 * Informativa privacy clienti — pagina pubblica, linkata dal modulo del QR.
 *
 * Il testo è quello del documento della cooperativa «INF03_Informativa CLIENTI
 * VER 3.3 del 06.04.24» (Sistema Gestione GDPR), riportato senza modifiche.
 * Se l'informativa cambia, si aggiorna qui: VERSIONE e SEZIONI.
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Informativa privacy clienti — Cooperativa Mirafiori',
}

const VERSIONE = 'Versione 3.3 del 06/04/2024'

const CONTATTI =
  'ocgdpr@cooperativamirafiori.com — mirafioriscs@pec.confcooperative.it — tel. 011 3471263 / 011 19176035 — S.da del Drosso 33/7, 10135 Torino'

const SEZIONI: ReadonlyArray<{ titolo: string; testo: readonly string[] }> = [
  {
    titolo: '0. Introduzione',
    testo: [
      'La tutela dei dati personali è l’occasione per una compliance condivisa e trasparente tra la Cooperativa Mirafiori e il “Cliente” di cui può raccoglierne i dati.',
      'È compito della Cooperativa Mirafiori, infatti, proteggerli, preservarli da eventuali danni, conservarli e disporne in seguito ad una semplice interazione con il “Cliente”.',
      'Con “dati personali” – detti anche IPI, Informazioni Personali Identificabili – si intendono quelli anagrafici e identificativi del Contatto, le informazioni su fatti e opinioni, gli interessi personali, inclusi quelli aventi natura particolare, raccolti prima o nel corso dell’esecuzione della trattativa commerciale.',
      'Per “trattamento” si intende qualsiasi operazione o insieme di operazioni, compiute con o senza l’ausilio di processi automatizzati e applicate a dati personali o insiemi di dati personali, come la raccolta, la registrazione, l’organizzazione, la strutturazione, la conservazione, l’adattamento o la modifica, l’estrazione, la consultazione, l’uso, la comunicazione mediante trasmissione, diffusione o qualsiasi altra forma di messa a disposizione, il raffronto o l’interconnessione, la limitazione, la cancellazione o la distruzione.',
    ],
  },
  {
    titolo: '1. Titolare del trattamento',
    testo: [
      'La Cooperativa Mirafiori è il Titolare del trattamento dei dati personali ed è possibile contattarla ai seguenti indirizzi di posta elettronica ocgdpr@cooperativamirafiori.com - mirafioriscs@pec.confcooperative.it o al numero telefonico 0113471263 – 01119176035, oppure scrivendo al seguente indirizzo di posta: Cooperativa Mirafiori - S.da del Drosso 33/7, 10135 Torino.',
      'Il Titolare decide in ordine alle finalità e alle modalità del trattamento dei dati personali, nonché alla loro sicurezza e agli strumenti utilizzati.',
    ],
  },
  {
    titolo: '2. Raccolta dati personali e basi giuridiche',
    testo: [
      'I dati personali oggetto di raccolta riguardano tutte le informazioni identificative e di contatto del “Cliente” al fine di consentire lo svolgimento di attività gestionali e commerciali generiche.',
      'I dati sono direttamente e liberamente forniti dal “Cliente” e sono revocabili in qualsiasi momento.',
      'Il contatto tra la Cooperativa Mirafiori e il “Cliente” può avvenire in maniera diretta o indiretta attraverso diversi canali comunemente, o meno, utilizzati.',
      'A seguito della raccolta, la Cooperativa Mirafiori garantisce che i dati personali siano anche pertinenti e non eccedenti affinché questo processo avvenga secondo liceità e correttezza, ossia per le finalità del trattamento, esplicite e legittime, indicate di seguito nella presente Informativa.',
      'Il trattamento dei dati avviene con strumenti e supporti sia cartacei che informatici, entrambi nel rispetto di criteri e procedure di sicurezza, conservazione e accessibilità, nel ristretto ambito delle finalità espresse.',
      'Inoltre, la Cooperativa Mirafiori può esercitare un interesse legittimo sia per tutelare l’attività di impresa sia per difendere i suoi diritti in sede giudiziaria nei casi di reclamo o contenziosi con il “Cliente”.',
      'La Cooperativa Mirafiori si rivolge a un target di “Clienti” che godono inscindibilmente di capacità giuridica, fiscale e contrattuale.',
    ],
  },
  {
    titolo: '3. Finalità del trattamento',
    testo: [
      'Le finalità gestionali per cui i dati personali del “Cliente” diventano oggetto di trattamento riguardano le attività funzionali alla gestione d’impresa, al fine di permettere il regolare svolgimento di attività di business della Cooperativa Mirafiori.',
    ],
  },
  {
    titolo: '4. Sicurezza dei dati personali',
    testo: [
      'La Cooperativa Mirafiori tratta con scrupolosa attenzione i dati personali e proprio per questo motivo adotta misure di sicurezza e protezione in stretta osservanza del GDPR e in linea con le norme ISO 9001 e ISO 27001.',
      'Inoltre, la Cooperativa Mirafiori mette in moto valide e opportune pratiche e tecniche volte a garantire in tutti i processi di trattamento le seguenti condizioni: riservatezza, ossia la protezione da accessi non autorizzati; integrità, per scongiurarne la perdita o il danneggiamento; disponibilità, al fine di assicurare al Contatto l’accesso continuo ai suoi dati.',
      'Anche nel caso in cui vengano trasferite le informazioni a terzi di fiducia, e per gli scopi indicati nella presente Informativa, è cura e attenzione della Cooperativa Mirafiori affinché costoro adottino analogamente misure di sicurezza, tecniche operative, secondo gli stessi criteri sopra esposti.',
    ],
  },
  {
    titolo: '5. Periodo di conservazione dei dati',
    testo: [
      'I dati personali del Contatto sono trattati per il tempo necessario per sviluppare tutte le finalità del trattamento, e comunque non oltre un periodo di tre anni.',
      'Il periodo di conservazione dei dati personali e delle informazioni aziendali, dunque, è determinato in base a questi criteri: natura e finalità del trattamento dei dati; adempimenti normativi; eventuali contenziosi.',
      'Allo scadere dei termini prospettati, i dati saranno cancellati dagli archivi correnti, cartacei e informatizzati, e secondo procedure tecniche adeguate e in accordo alle best practice di Information Security.',
    ],
  },
  {
    titolo: '6. Trasferimento internazionale di dati',
    testo: [
      'Ad oggi la Cooperativa Mirafiori non effettua alcun trasferimento internazionale di dati a Paesi Terzi fuori dall’Unione Europea.',
    ],
  },
  {
    titolo: '7. Condivisione dei dati personali',
    testo: [
      'I dati personali del “Cliente” non saranno oggetto di condivisione con altri soggetti se non nei casi che prevedono l’obbligatorietà.',
      'L’accesso ai dati può avvenire ad opera di alcuni addetti al trattamento interni all’organizzazione per tutte le operatività necessarie alla gestione del “Cliente” ai fini amministrativi, gestionali e all’erogazione di servizi interni: si tratta di personale delle aree aziendali, quali l’amministrazione, marketing e comunicazione, e i sistemi informativi.',
      'Lo stesso può avvenire da parte di alcuni soggetti esterni, quali i fornitori di servizi, alcuni dei quali gestiti e controllati in qualità di Responsabili del Trattamento.',
    ],
  },
  {
    titolo: '8. Obbligo di conferimento dei dati ed eventuali conseguenze in caso di rifiuto',
    testo: [
      'L’eventuale rifiuto da parte del “Cliente”, totale o parziale, comprometterebbe la corretta esecuzione delle attività connesse alle finalità espresse, e ciò determinerebbe l’impossibilità di attuare le attività di gestione.',
    ],
  },
  {
    titolo: '9. Tipologia dei dati personali raccolti',
    testo: [
      'I dati personali oggetto del trattamento sono di diversa tipologia a seconda della gestione diretta e indiretta messa in atto nella raccolta dati (anagrafica, dati di contatto, indirizzo, contatti web, ecc.)',
    ],
  },
  {
    titolo: '10. Responsabile della protezione dei dati',
    testo: ['Il Titolare ha previsto la nomina di un Organismo di Controllo per la protezione dei dati.'],
  },
  {
    titolo: '11. Diritti di protezione dei dati',
    testo: [
      'È diritto del “Cliente” conoscere l’esistenza dei suoi dati personali raccolti e trattati presso il Titolare, quindi conoscerne il contenuto e la provenienza, verificarne l’esattezza ed eventualmente modificarli, integrarli con altre informazioni, chiederne la cancellazione o la trasformazione in forma anonima, bloccarne l’uso nel caso di una presunta violazione di legge o addirittura opporsi in via definitiva al trattamento.',
      'Tutte le richieste di informazioni, ed eventuali reclami, potranno essere diretti al Titolare presso gli indirizzi resi noti in questa Informativa.',
    ],
  },
  {
    titolo: '12. Modifiche all’informativa sulla privacy',
    testo: [
      'La presente Informativa sulla privacy è soggetta a eventuali modifiche e aggiornamenti al fine di recepire cambiamenti della normativa nazionale e/o comunitaria, ossia per adeguarsi a innovazioni tecnologiche o per motivi di natura organizzativa della Cooperativa Mirafiori per cui sarà diligenza della stessa informare il “Cliente”, utilizzando gli strumenti di comunicazione aziendale a disposizione.',
      'Le modifiche, come quella attuale dovuta all’adeguamento al nuovo Regolamento GDPR, continueranno ad applicare le regole in vigore a meno che l’interessato non sia sfavorevole ai cambiamenti proposti e richieda la cessazione dei trattamenti e conseguente cancellazione dei suoi dati.',
      'Il “Cliente” deve comunque verificare in modo autonomo e con periodicità lo stato di aggiornamento della presente Informativa, e comunque consultarla tutte le volte che viene informato delle avvenute modifiche.',
    ],
  },
  {
    titolo: '13. Cancellazioni, opposizione e rettifiche',
    testo: [
      'In qualsiasi momento il “Cliente” può richiedere la rettifica, l’opposizione, in tutto o in parte, e la revoca del trattamento dei suoi dati, e, nel caso, ottenerne la cancellazione.',
      'I casi di cancellazione sono dunque i seguenti: i dati personali non sono più necessari a seguito di cessazione del rapporto intercorrente con la Cooperativa Mirafiori; il “Cliente” effettua una revoca; il “Cliente” si oppone al trattamento; i dati personali sono stati trattati illecitamente.',
      'Ai sensi dell’art. 77 del GDPR, il “Cliente” ha il diritto di proporre reclamo a un’autorità di controllo.',
    ],
  },
  {
    titolo: '14. Informazioni e revisioni',
    testo: [
      'Il Titolare del Trattamento dei Dati è responsabile per questa Privacy Policy (Informativa).',
    ],
  },
]

export default function InformativaClientiPage() {
  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <article className="mx-auto w-full max-w-2xl space-y-6 text-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mirafiori.png" alt="Cooperativa Mirafiori" className="h-auto w-32" />
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Informativa privacy clienti</h1>
          <p className="text-sm text-gray-600">
            Ai sensi del Regolamento generale sulla protezione dei dati (GDPR) n. 679/2016 · {VERSIONE}
          </p>
          <p className="text-sm text-gray-600">Cooperativa Mirafiori S.C.S. — {CONTATTI}</p>
          <p className="text-base">
            Con questa informativa si intende comunicare all’Interessato (qui denominato “Cliente”) le modalità
            di gestione riguardo al trattamento dei suoi dati personali, così come prescritto dagli artt. 13 e 14
            del Regolamento europeo n. 679/2016 – GDPR, General Data Protection Regulation e dalle normative vigenti.
          </p>
        </header>
        {SEZIONI.map((s) => (
          <section key={s.titolo} className="space-y-2">
            <h2 className="text-lg font-bold text-gray-900">{s.titolo}</h2>
            {s.testo.map((p, i) => (
              <p key={i} className="text-base leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}
