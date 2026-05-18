import { useLocation } from 'react-router-dom'

const PAGE_HELP = {
  '/': {
    title: 'Dashboard',
    tips: [
      { q: 'What is an envelope?', a: 'An envelope is a spending category. Each one holds a portion of your income for a specific purpose — Groceries, Gas, Rent, etc.' },
      { q: 'What does "unallocated" mean?', a: 'Money you\'ve received as income but haven\'t assigned to an envelope yet. Your goal is to get this to $0 — give every dollar a job.' },
      { q: 'What are the Envelope / Budget / Map views?', a: 'Envelope shows cards grouped by type (Needs, Wants, etc.). Budget shows an editable table where you can set allocations by typing. Map shows how your spending compares to targets for your income level. The view switcher is sticky so it\'s always visible while you scroll.' },
      { q: 'What is the getting started checklist?', a: 'A four-step guide that appears for new users: create envelopes, record income, set budgets, and import transactions. Each step links directly to the right action. It disappears automatically once all steps are complete, or you can dismiss it with the ✕ button.' },
      { q: 'What is the "envelopes without a type" nudge?', a: 'If any envelopes have no type set (Needs, Wants, Dreams, Fix, Emergency), a small card appears below the stats showing each one with a type dropdown. Pick a type and it saves immediately. Types organize the card view and drive Money Map targets. Dismiss the nudge with ✕ if you prefer to leave them untyped.' },
      { q: 'What is the new month banner?', a: 'When it\'s the current month and no income has been recorded yet, a yellow banner appears with three shortcuts: record income, copy last month\'s budgets into this month, or go apply recurring templates. Dismiss it with ✕ once you\'ve handled the month.' },
      { q: 'What is rollover?', a: 'If you don\'t spend all of an envelope\'s budget this month, the leftover rolls into next month\'s balance when rollover is enabled (↻ button on the card).' },
      { q: 'How do I transfer between envelopes?', a: 'Use the ⇄ Transfer button. This moves money from one envelope to another without recording a real transaction.' },
      { q: 'How do I add a transaction manually?', a: 'Click "✎ Add Transaction" in the toolbar. Choose Expense (debit) or Income (credit), pick the envelope, enter the amount, date, and an optional note, then click Save. The envelope balance updates immediately.' },
      { q: 'What is a split payment?', a: 'Use ⊕ Split to record one payment that spans multiple envelopes — for example, a credit card bill split across Groceries, Gas, and Dining Out.' },
      { q: 'How do I add an envelope quickly?', a: 'Click "+ Add Envelope". A suggestion dropdown shows common categories not yet in your budget — picking one auto-fills the name and type. You can also type a custom name.' },
    ],
  },
  '/income': {
    title: 'Income',
    tips: [
      { q: 'Why record income?', a: 'Income is the foundation of your budget. Every dollar you record here is money available to allocate to your envelopes.' },
      { q: 'What are the income types?', a: 'Fixed: enter your monthly take-home amount directly (salary, set pay). Hourly: enter your after-tax rate and hours per week — the monthly amount is calculated automatically (rate × hours × 52 ÷ 12). Variable: for commission or freelance income, enter a conservative estimate and record the real amount each month.' },
      { q: 'What is the budget month?', a: 'Sometimes you get paid at the end of one month but intend it for next month\'s budget. The budget month lets you assign income to the correct period.' },
    ],
  },
  '/recurring': {
    title: 'Recurring',
    tips: [
      { q: 'What are recurring templates?', a: 'Templates for bills or income that happen regularly — rent, subscriptions, paychecks. You apply them each month to quickly create the transactions.' },
      { q: 'Do recurring items apply automatically?', a: 'No — you apply them manually each month so you stay in control and can adjust amounts as needed.' },
    ],
  },
  '/import': {
    title: 'Import',
    tips: [
      { q: 'What file formats are supported?', a: 'OFX and QFX files from most banks, plus CSV. QFX/OFX is preferred — it\'s more reliable and includes a unique bank reference that prevents duplicate imports.' },
      { q: 'How do I get a file from my bank?', a: 'Expand the "How do I get a file from my bank?" guide on this page. Select your bank (Chase, Varo Bank, Ally Bank, Capital One, Citibank, US Bank, TD Bank, and others) for step-by-step export instructions. Look for "Download", "Export", or "Download Transactions" near your account activity.' },
      { q: 'What happens after I import?', a: 'You stay on the Import page so you can import another file right away. A green banner confirms how many transactions were saved. Dismiss it with ✕ when you\'re done.' },
      { q: 'What is a bank reference?', a: 'A unique ID from your bank that prevents the same transaction from being imported twice. Duplicates are detected automatically and unchecked.' },
      { q: 'What is auto-assignment?', a: 'When you upload a file, the app looks at your past imports and pre-fills the envelope for any payee it recognises. Auto-assigned rows are marked "✦ auto-assigned" with a light indigo border — review them and change any that are wrong.' },
      { q: 'Do I have to assign every transaction?', a: 'No — uncheck any transactions you don\'t want to import. Only checked and assigned transactions are saved.' },
    ],
  },
  '/payees': {
    title: 'Payees',
    tips: [
      { q: 'What is a payee alias?', a: 'Banks often use messy names like "AMZN*MKTP US 123456". An alias lets you display it as "Amazon" everywhere instead.' },
      { q: 'How do aliases get created?', a: 'Click on any transaction note in an envelope to set an alias for that payee. It applies everywhere that note appears.' },
    ],
  },
  '/reports': {
    title: 'Reports',
    tips: [
      { q: 'What does the spending report show?', a: 'A breakdown of actual spending across all your envelopes for the selected period (3, 6, or 12 months), shown as a stacked bar chart and a detailed table. Hover over any bar to see the full breakdown for that month.' },
      { q: 'How do I export my transactions?', a: 'Use the Export section at the top of this page. Set a date range and click "↓ CSV" to download all transactions as a spreadsheet.' },
    ],
  },
  '/settings': {
    title: 'Settings',
    tips: [
      { q: 'How do I invite someone to my household?', a: 'Go to Members → Generate invite link. Copy the link and send it. They\'ll create an account (or log in) and be added to your household.' },
      { q: 'What is a financial season?', a: 'Your current life phase — Recover (paying off debt), Fund (building savings), Activate (enjoying life), or Balance (both). It determines your Money Map targets.' },
      { q: 'What is the annual income for?', a: 'Used by the Money Map to show recommended allocation percentages based on your income tier.' },
    ],
  },
}

const GLOSSARY = [
  { term: 'Envelope', def: 'A named budget category that holds a portion of your income.' },
  { term: 'Envelope type', def: 'Needs, Wants, Dreams, Fix, or Emergency — used to group cards on the dashboard and drive Money Map targets.' },
  { term: 'Period', def: 'A monthly budget allocation for one envelope.' },
  { term: 'Rollover', def: 'Unspent balance that carries forward to the next month (↻ on each card).' },
  { term: 'Transfer', def: 'Moving money between two envelopes without a real purchase.' },
  { term: 'Split', def: 'A single payment divided across multiple envelopes.' },
  { term: 'Unallocated', def: 'Income received but not yet assigned to any envelope. Goal: $0.' },
  { term: 'Bank ref', def: 'A unique transaction ID from your bank, used to prevent duplicate imports.' },
]

const SHORTCUTS = [
  { keys: '?', desc: 'Open / close this help panel' },
  { keys: '⌘K', desc: 'Search transactions' },
]

export default function HelpPanel({ onClose, onOpenWizard }) {
  const { pathname } = useLocation()
  const basePath = '/' + pathname.split('/')[1]
  const help = PAGE_HELP[basePath] || PAGE_HELP['/']

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm h-full shadow-xl overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Help — {help.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-6">

          {/* Setup wizard */}
          <section className="border-b border-gray-100 pb-4">
            <button
              onClick={() => { onClose(); onOpenWizard() }}
              className="w-full text-left text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2"
            >
              <span>🧭</span> Re-run the setup wizard
            </button>
          </section>

          {/* Page tips */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Common questions</h3>
            <div className="space-y-3">
              {help.tips.map((t) => (
                <details key={t.q} className="group rounded-lg border border-gray-100 overflow-hidden">
                  <summary className="px-3 py-2.5 text-sm font-medium text-gray-800 cursor-pointer list-none flex items-center justify-between hover:bg-gray-50">
                    {t.q}
                    <span className="text-gray-400 group-open:rotate-180 transition-transform text-xs ml-2">▼</span>
                  </summary>
                  <p className="px-3 pb-3 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-2">{t.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Glossary */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Glossary</h3>
            <div className="space-y-2">
              {GLOSSARY.map((g) => (
                <div key={g.term} className="text-sm">
                  <span className="font-medium text-gray-800">{g.term} — </span>
                  <span className="text-gray-600">{g.def}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Keyboard shortcuts */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Keyboard shortcuts</h3>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{s.desc}</span>
                  <kbd className="bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-xs font-mono ml-3 shrink-0">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
