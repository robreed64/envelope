import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import InlineTip from '../components/InlineTip'
import BankGuide from '../components/BankGuide'
import { getHouseholds } from '../api/households'
import { getEnvelopes } from '../api/envelopes'
import { getAccounts } from '../api/accounts'
import { previewImport, confirmImport } from '../api/imports'
import { getPayeeAssignments } from '../api/payees'
import { thisMonth, shiftMonth, monthLabel, nextMonthOf, fmt } from '../utils'

export default function Import() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(null)          // ParsedTransaction[]
  const [parseErrors, setParseErrors] = useState([])
  const [detectedAccount, setDetectedAccount] = useState(null) // from OFX
  const [accountName, setAccountName] = useState('')           // for CSV
  const [assignments, setAssignments] = useState({}) // { txId: envelopeId }
  const [selected, setSelected] = useState({})       // { txId: bool }
  const [budgetMonths, setBudgetMonths] = useState({}) // { txId: 'YYYY-MM-DD' | '' }
  const [workingMonth, setWorkingMonth] = useState(thisMonth())
  const [autoUncheckedCount, setAutoUncheckedCount] = useState(0)
  const [autoAssigned, setAutoAssigned] = useState(new Set())
  const [importedCount, setImportedCount] = useState(null)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const { data: envelopes = [] } = useQuery({
    queryKey: ['envelopes', household?.id],
    queryFn: () => getEnvelopes(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', household?.id],
    queryFn: () => getAccounts(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: payeeAssignments = {} } = useQuery({
    queryKey: ['payee-assignments', household?.id],
    queryFn: () => getPayeeAssignments(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const previewMutation = useMutation({
    mutationFn: (file) => previewImport(household.id, file),
    onSuccess: ({ data }) => {
      setPreview(data.transactions)
      setParseErrors(data.parse_errors ?? [])
      setDetectedAccount(data.detected_account ?? null)
      setAccountName('')
      const sel = {}
      const bm = {}
      const autoMap = {}
      const autoIds = new Set()
      const validEnvelopeIds = new Set(envelopes.map((e) => e.id))
      let unchecked = 0
      data.transactions.forEach((t) => {
        const inMonth = t.date.substring(0, 7) === workingMonth.substring(0, 7)
        const eligible = !t.duplicate && !t.already_income
        sel[t.id] = eligible && inMonth
        if (eligible && !inMonth) unchecked++
        if (t.type === 'credit' && !inMonth) bm[t.id] = workingMonth
        // pre-fill envelope from payee history (skip income sentinel, deleted envelopes)
        const knownEnvId = payeeAssignments[t.description]
        if (knownEnvId && validEnvelopeIds.has(knownEnvId) && eligible) {
          autoMap[t.id] = knownEnvId
          autoIds.add(t.id)
        }
      })
      setSelected(sel)
      setAssignments(autoMap)
      setAutoAssigned(autoIds)
      setBudgetMonths(bm)
      setAutoUncheckedCount(unchecked)
    },
  })

  const confirmMutation = useMutation({
    mutationFn: ({ txs, csvName }) => confirmImport(household.id, txs, csvName),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['periods'] })
      qc.invalidateQueries({ queryKey: ['income'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      setImportedCount(data.imported)
      setPreview(null)
      setDetectedAccount(null)
      setAccountName('')
      setAssignments({})
      setAutoAssigned(new Set())
      setSelected({})
      setBudgetMonths({})
      setAutoUncheckedCount(0)
    },
  })

  const handleFile = (file) => {
    if (file) previewMutation.mutate(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const assign = (txId, value) => {
    setAssignments((prev) => ({ ...prev, [txId]: value }))
    setAutoAssigned((prev) => { const n = new Set(prev); n.delete(txId); return n })
  }

  const applyToAll = (description, value) => {
    const updates = {}
    preview
      .filter((t) => t.description === description)
      .forEach((t) => (updates[t.id] = value))
    setAssignments((prev) => ({ ...prev, ...updates }))
  }

  const toggleAll = (checked) => {
    const next = {}
    preview?.forEach((t) => (next[t.id] = checked))
    setSelected(next)
  }

  const INCOME_SENTINEL = '__income__'

  const readyToImport = preview?.filter(
    (t) => selected[t.id] && assignments[t.id]
  ) ?? []

  const handleImport = () => {
    const txs = readyToImport.map((t) => {
      const isIncome = assignments[t.id] === INCOME_SENTINEL
      const bm = budgetMonths[t.id]
      return {
        date: t.date,
        amount: t.amount,
        type: t.type,
        note: t.description,
        bank_ref: t.bank_ref,
        envelope_id: isIncome ? null : assignments[t.id],
        is_income: isIncome,
        budget_month: isIncome && bm ? bm : undefined,
        account_id: detectedAccount?.resolved_id ?? undefined,
      }
    })
    const csvName = !detectedAccount && accountName.trim() ? accountName.trim() : undefined
    confirmMutation.mutate({ txs, csvName })
  }

  const descriptionCounts = preview?.reduce((acc, t) => {
    acc[t.description] = (acc[t.description] ?? 0) + 1
    return acc
  }, {}) ?? {}

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Transactions</h1>
          <p className="text-gray-500 text-sm">Supports .qfx, .ofx, and .csv files from your bank</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Importing for</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWorkingMonth((m) => shiftMonth(m, -1))}
                className="text-gray-400 hover:text-indigo-600 px-1 transition-colors"
              >
                ‹
              </button>
              <span className="text-sm font-medium text-gray-800 w-28 text-center">
                {monthLabel(new Date(workingMonth + 'T00:00:00'))}
              </span>
              <button
                onClick={() => setWorkingMonth((m) => shiftMonth(m, 1))}
                className="text-gray-400 hover:text-indigo-600 px-1 transition-colors"
              >
                ›
              </button>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors group"
          >
            <span className="text-base leading-none group-hover:-translate-x-0.5 transition-transform">←</span>
            <span>Back</span>
          </button>
        </div>
      </div>

      {importedCount !== null && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-500 text-lg">✓</span>
            <p className="text-emerald-700 text-sm font-medium">{importedCount} transaction{importedCount !== 1 ? 's' : ''} imported successfully.</p>
          </div>
          <button onClick={() => setImportedCount(null)} className="text-emerald-400 hover:text-emerald-600 text-sm">✕</button>
        </div>
      )}

      {!preview && (
        <>
          <div className="mb-4">
            <InlineTip icon="📥" title="How importing works">
              Download a transaction file from your bank's website (look for "Export" or "Download transactions"). Drop it below, assign each transaction to an envelope, then click Import to save them all at once.
            </InlineTip>
          </div>
          <BankGuide />
        </>
      )}

      {/* Upload zone */}
      {!preview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".qfx,.ofx,.csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {previewMutation.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
              <p className="text-gray-500 text-sm">Parsing file…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-colors ${
                dragging ? 'bg-indigo-100' : 'bg-gray-100'
              }`}>
                📄
              </div>
              <div>
                <p className="text-gray-700 font-medium">Drop your bank file here</p>
                <p className="text-gray-400 text-sm mt-0.5">or click to browse — .qfx, .ofx, .csv</p>
              </div>
            </div>
          )}
        </div>
      )}

      {previewMutation.isError && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mt-4 text-rose-700 text-sm">
          {previewMutation.error?.response?.data?.detail ?? 'Failed to parse file. Check the format and try again.'}
        </div>
      )}

      {/* Preview table */}
      {preview && (
        <>
          {parseErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-amber-700 text-sm">
              {parseErrors.length} row(s) could not be parsed and were skipped.
            </div>
          )}
          {preview.some((t) => t.duplicate) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-amber-700 text-sm">
              {preview.filter((t) => t.duplicate).length} transaction(s) were already imported as expenses and have been unchecked.
            </div>
          )}
          {preview.some((t) => t.already_income) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-emerald-700 text-sm">
              {preview.filter((t) => t.already_income).length} income transaction(s) already exist and have been unchecked to prevent doubling. Check them to re-budget to a different month.
            </div>
          )}
          {autoUncheckedCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-blue-700 text-sm">
              {autoUncheckedCount} transaction(s) outside {monthLabel(new Date(workingMonth + 'T00:00:00'))} were unchecked. Check them individually to include — income will be budgeted to your working month.
            </div>
          )}

          {/* OFX: show detected bank as read-only badge */}
          {detectedAccount && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex items-center gap-3">
              <span className="text-indigo-500 text-base">🏦</span>
              <div className="flex-1 min-w-0">
                <p className="text-indigo-800 text-sm font-medium">
                  {detectedAccount.bank_name}
                  {detectedAccount.account_id && (
                    <span className="text-indigo-500 font-normal ml-1">···{detectedAccount.account_id.slice(-4)}</span>
                  )}
                  {detectedAccount.account_type && (
                    <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 rounded-full px-2 py-0.5 capitalize">{detectedAccount.account_type}</span>
                  )}
                </p>
                <p className="text-indigo-500 text-xs mt-0.5">Detected from file — transactions will be linked to this account</p>
              </div>
            </div>
          )}

          {/* CSV: require user to name the account */}
          {!detectedAccount && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 flex items-center gap-3">
              <span className="text-gray-400 text-base">🏦</span>
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">Account name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Chase Checking"
                  list="accounts-list"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <datalist id="accounts-list">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.display_name || a.bank_name} />
                  ))}
                </datalist>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={preview.every((t) => selected[t.id])}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">
                  {preview.length} transactions parsed
                </span>
              </div>
              <button
                onClick={() => { setPreview(null); setDetectedAccount(null); setAccountName(''); setAssignments({}); setAutoAssigned(new Set()); setSelected({}); setBudgetMonths({}); setAutoUncheckedCount(0) }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Upload different file
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 text-left w-8"></th>
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Description</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-left w-48">Envelope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((tx) => {
                    const inWorkingMonth = tx.date.substring(0, 7) === workingMonth.substring(0, 7)
                    return (
                    <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${!selected[tx.id] ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!selected[tx.id]}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [tx.id]: e.target.checked }))}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap tabular-nums">{tx.date}</td>
                      <td className="px-4 py-3 text-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-xs">{tx.description}</span>
                          {!inWorkingMonth && (
                            <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium shrink-0">
                              {tx.date.substring(0, 7)}
                            </span>
                          )}
                          {tx.duplicate && (
                            <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium shrink-0">
                              duplicate
                            </span>
                          )}
                          {tx.already_income && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium shrink-0">
                              income
                            </span>
                          )}
                          {descriptionCounts[tx.description] > 1 && assignments[tx.id] && (
                            <button
                              onClick={() => applyToAll(tx.description, assignments[tx.id])}
                              className="text-xs text-indigo-500 hover:text-indigo-700 whitespace-nowrap shrink-0"
                              title="Apply this envelope to all matching descriptions"
                            >
                              Apply to all {descriptionCounts[tx.description]}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        <span className={`font-medium ${tx.type === 'credit' ? 'text-emerald-600' : 'text-gray-700'}`}>
                          {tx.type === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {autoAssigned.has(tx.id) && (
                            <span className="text-xs text-indigo-500 font-medium">✦ auto-assigned</span>
                          )}
                          <select
                            value={assignments[tx.id] ?? ''}
                            onChange={(e) => assign(tx.id, e.target.value)}
                            className={`w-full border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                              assignments[tx.id] === INCOME_SENTINEL
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : autoAssigned.has(tx.id)
                                ? 'border-indigo-200 bg-indigo-50/50'
                                : 'border-gray-200'
                            }`}
                          >
                            <option value="">— assign —</option>
                            {tx.type === 'credit' && (
                              <option value={INCOME_SENTINEL}>💰 Record as Income</option>
                            )}
                            {tx.type === 'credit' && envelopes.length > 0 && (
                              <option disabled>── Envelopes (refund/credit) ──</option>
                            )}
                            {envelopes.map((env) => (
                              <option key={env.id} value={env.id}>{env.name}</option>
                            ))}
                          </select>
                          {assignments[tx.id] === INCOME_SENTINEL && (() => {
                            const nm = nextMonthOf(tx.date)
                            const txMonthFirst = tx.date.substring(0, 8) + '01'
                            const sameLabel = new Date(tx.date + 'T00:00:00')
                              .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                            const workingIsOther = workingMonth !== txMonthFirst && workingMonth !== nm.first
                            return (
                              <select
                                value={budgetMonths[tx.id] ?? ''}
                                onChange={(e) => setBudgetMonths((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                                className="w-full border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                title="Which month to budget this income toward"
                              >
                                {workingIsOther && (
                                  <option value={workingMonth}>Budget → {monthLabel(new Date(workingMonth + 'T00:00:00'))} (working)</option>
                                )}
                                <option value="">Budget → {sameLabel}</option>
                                <option value={nm.first}>Budget → {nm.label}</option>
                              </select>
                            )
                          })()}
                        </div>
                      </td>
                    </tr>
                  )}
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {readyToImport.filter((t) => assignments[t.id] !== INCOME_SENTINEL).length} expenses
              {' · '}
              <span className="text-emerald-600">
                {readyToImport.filter((t) => assignments[t.id] === INCOME_SENTINEL).length} income
              </span>
              {' '}ready to import
              {autoAssigned.size > 0 && (
                <span className="text-indigo-500 ml-1">· {autoAssigned.size} auto-assigned</span>
              )}
              {preview.filter((t) => selected[t.id] && !assignments[t.id]).length > 0 && (
                <span className="text-amber-500 ml-1">
                  ({preview.filter((t) => selected[t.id] && !assignments[t.id]).length} unassigned)
                </span>
              )}
            </p>
            <button
              onClick={handleImport}
              disabled={readyToImport.length === 0 || confirmMutation.isPending}
              className="bg-indigo-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {confirmMutation.isPending ? 'Importing…' : `Import ${readyToImport.length} transactions`}
            </button>
          </div>
        </>
      )}
    </Layout>
  )
}
