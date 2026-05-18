import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import MonthNav from '../components/MonthNav'
import { getEnvelopes, updateEnvelope } from '../api/envelopes'
import { getPeriods, createPeriod, updatePeriod } from '../api/periods'
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, deleteTransfer, deleteSplit } from '../api/transactions'
import { getPayeeAliases, upsertPayeeAlias, deletePayeeAlias } from '../api/payees'
import { thisMonth, today, fmt, buildAliasMap, calcBudgetMetrics, txBadgeClass, ENVELOPE_TYPES } from '../utils'
import InlineTip from '../components/InlineTip'

export default function EnvelopeDetail() {
  const { householdId, envelopeId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const month = searchParams.get('month') || thisMonth()
  const isCurrentMonth = month === thisMonth()

  const [txAmount, setTxAmount] = useState('')
  const [txType, setTxType] = useState('debit')
  const [txDate, setTxDate] = useState(today())
  const [txNote, setTxNote] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editFields, setEditFields] = useState({})
  const [allTime, setAllTime] = useState(false)
  const [editingPayee, setEditingPayee] = useState(null)
  const [payeeInput, setPayeeInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const startEdit = (tx) => {
    setEditingId(tx.id)
    setEditFields({ amount: tx.amount, type: tx.type, date: tx.date, note: tx.note ?? '' })
  }
  const cancelEdit = () => setEditingId(null)

  const updateEnvelopeMutation = useMutation({
    mutationFn: (data) => updateEnvelope(householdId, envelopeId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['envelopes', householdId] }),
  })

  const commitName = () => {
    setEditingName(false)
    const val = nameDraft.trim()
    if (val && val !== envelope?.name) updateEnvelopeMutation.mutate({ name: val })
  }

  const { data: envelopes = [] } = useQuery({
    queryKey: ['envelopes', householdId],
    queryFn: () => getEnvelopes(householdId).then((r) => r.data),
  })

  const { data: aliasesRaw = [] } = useQuery({
    queryKey: ['payees', householdId],
    queryFn: () => getPayeeAliases(householdId).then((r) => r.data),
  })
  const aliasMap = buildAliasMap(aliasesRaw)
  const envelope = envelopes.find((e) => e.id === envelopeId)

  const { data: periods = [] } = useQuery({
    queryKey: ['periods', householdId, envelopeId],
    queryFn: () => getPeriods(householdId, envelopeId).then((r) => r.data),
  })
  const currentPeriod = periods.find((p) => p.month === month)

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['transactions', householdId, envelopeId, allTime ? 'all' : month],
    queryFn: () => getTransactions(householdId, envelopeId, allTime ? null : month).then((r) => r.data),
  })

  const addTxMutation = useMutation({
    mutationFn: (data) => createTransaction(householdId, envelopeId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', householdId, envelopeId] }, { exact: false })
      qc.invalidateQueries({ queryKey: ['periods', householdId, envelopeId] })
      setTxAmount('')
      setTxNote('')
      setTxDate(today())
    },
  })

  const updateTxMutation = useMutation({
    mutationFn: ({ txId, data }) => updateTransaction(householdId, envelopeId, txId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', householdId, envelopeId] }, { exact: false })
      qc.invalidateQueries({ queryKey: ['periods', householdId, envelopeId] })
      setEditingId(null)
    },
  })

  const deleteTxMutation = useMutation({
    mutationFn: (tx) =>
      tx.split_id
        ? deleteSplit(householdId, tx.split_id)
        : tx.transfer_id
        ? deleteTransfer(householdId, tx.transfer_id)
        : deleteTransaction(householdId, envelopeId, tx.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', householdId, envelopeId] }, { exact: false })
      qc.invalidateQueries({ queryKey: ['periods', householdId] }, { exact: false })
    },
  })

  const aliasMutation = useMutation({
    mutationFn: ({ raw, alias }) =>
      alias ? upsertPayeeAlias(householdId, raw, alias) : deletePayeeAlias(householdId, raw),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payees', householdId] })
      setEditingPayee(null)
    },
  })

  const startPayeeEdit = (raw) => {
    setEditingPayee(raw)
    setPayeeInput(aliasMap[raw] ?? '')
  }

  const submitPayeeEdit = (raw) => {
    const trimmed = payeeInput.trim()
    if (trimmed === (aliasMap[raw] ?? '')) { setEditingPayee(null); return }
    aliasMutation.mutate({ raw, alias: trimmed })
  }

  const setBudgetMutation = useMutation({
    mutationFn: (amount) =>
      currentPeriod
        ? updatePeriod(householdId, envelopeId, currentPeriod.id, { allocated: amount })
        : createPeriod(householdId, envelopeId, { month, allocated: amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods', householdId, envelopeId] })
      qc.invalidateQueries({ queryKey: ['periods', householdId] })
      setShowBudgetForm(false)
      setBudgetAmount('')
    },
  })

  const openBudgetEdit = () => {
    setBudgetAmount(currentPeriod ? String(parseFloat(currentPeriod.allocated)) : '')
    setShowBudgetForm(true)
  }

  const { allocated, rollover, spent, balance, pct, overBudget, barColor } = calcBudgetMetrics(currentPeriod)

  const q = search.trim().toLowerCase()
  const visibleTx = useMemo(() => transactions.filter((tx) => {
    if (typeFilter === 'debit' && (tx.type !== 'debit' || tx.transfer_id || tx.split_id)) return false
    if (typeFilter === 'credit' && tx.type !== 'credit') return false
    if (typeFilter === 'transfer' && !tx.transfer_id) return false
    if (typeFilter === 'split' && !tx.split_id) return false
    if (q) {
      const display = aliasMap[tx.note] ?? tx.note ?? ''
      return display.toLowerCase().includes(q) || String(tx.amount).includes(q)
    }
    return true
  }), [transactions, typeFilter, q, aliasMap])

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-2">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors group"
        >
          <span className="text-base leading-none group-hover:-translate-x-0.5 transition-transform">←</span>
          <span>Back to dashboard</span>
        </button>
        <MonthNav
          month={month}
          onChange={(m) => setSearchParams({ month: m })}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            {envelope?.group_name && (
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{envelope.group_name}</p>
            )}
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingName(false) }}
                className="text-2xl font-bold text-gray-900 border-b-2 border-indigo-400 outline-none bg-transparent w-64"
              />
            ) : (
              <h1
                className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-indigo-700 transition-colors group/name"
                onClick={() => { setNameDraft(envelope?.name ?? ''); setEditingName(true) }}
                title="Click to rename"
              >
                {envelope?.name ?? '…'}
                <span className="ml-2 text-base text-gray-300 opacity-0 group-hover/name:opacity-100 transition-opacity">✎</span>
              </h1>
            )}
          </div>
          {!showBudgetForm && (
            <button
              onClick={openBudgetEdit}
              className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700"
            >
              {currentPeriod ? 'Edit budget' : 'Set budget'}
            </button>
          )}
        </div>

        {envelope && (
          <div className="flex flex-wrap items-center gap-2 pb-4 mb-4 border-b border-gray-100">
            <select
              value={envelope.envelope_type ?? ''}
              onChange={(e) => updateEnvelopeMutation.mutate({ envelope_type: e.target.value })}
              className={`text-xs rounded-full px-3 py-1 cursor-pointer appearance-none border-0 outline-none transition-colors ${
                envelope.envelope_type ? ENVELOPE_TYPES[envelope.envelope_type].badge : 'bg-amber-50 text-amber-500 hover:bg-amber-100'
              }`}
            >
              {!envelope.envelope_type && <option value="" disabled>— select type —</option>}
              {Object.entries(ENVELOPE_TYPES).map(([val, { label }]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <button
              onClick={() => updateEnvelopeMutation.mutate({ rollover: !envelope.rollover })}
              className={`text-xs rounded-full px-3 py-1 transition-colors ${
                envelope.rollover ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}
            >
              ↻ Rollover {envelope.rollover ? 'on' : 'off'}
            </button>
            <button
              onClick={() => updateEnvelopeMutation.mutate({ is_protected: !envelope.is_protected })}
              className={`text-xs rounded-full px-3 py-1 transition-colors ${
                envelope.is_protected ? 'bg-slate-100 text-slate-600' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}
            >
              {envelope.is_protected ? '🔒 Protected' : '🔓 Unprotected'}
            </button>
          </div>
        )}

        {showBudgetForm && (
          <div className="flex gap-2 mb-4">
            <span className="text-gray-500 self-center">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="Monthly budget"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
            />
            <button
              onClick={() => setBudgetMutation.mutate(budgetAmount)}
              disabled={!budgetAmount || setBudgetMutation.isPending}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={() => setShowBudgetForm(false)} className="text-gray-400 hover:text-gray-600 px-2">
              ✕
            </button>
          </div>
        )}

        {currentPeriod && (
          <>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
              <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-4 sm:gap-6 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide">Budgeted</p>
                <p className="font-semibold text-gray-900">{fmt(allocated)}</p>
              </div>
              {rollover !== 0 && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Rollover</p>
                  <p className={`font-semibold ${rollover > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {rollover > 0 ? '+' : '-'}{fmt(Math.abs(rollover))}
                  </p>
                </div>
              )}
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide">Spent</p>
                <p className="font-semibold text-gray-900">{fmt(spent)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide">Remaining</p>
                <p className={`font-semibold ${overBudget ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {overBudget ? `-${fmt(Math.abs(balance))}` : fmt(balance)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">Add Transaction</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
            className="flex-1 sm:flex-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="debit">Debit (spend)</option>
            <option value="credit">Credit (refund)</option>
          </select>
          <div className="relative min-w-28">
            <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="0.00"
              className="border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28"
            />
          </div>
          <input
            type="date"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            className="flex-1 sm:flex-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={txNote}
            onChange={(e) => setTxNote(e.target.value)}
            placeholder="Note (optional)"
            className="min-w-0 flex-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => addTxMutation.mutate({ amount: txAmount, type: txType, date: txDate, note: txNote || null })}
            disabled={!txAmount || addTxMutation.isPending}
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-50 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Transactions</h2>
            <button
              onClick={() => { setAllTime((v) => !v); setSearch(''); setTypeFilter('all') }}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                allTime ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {allTime ? 'All time' : 'This month'}
            </button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1.5 text-gray-400 text-sm">⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search payee or amount…"
                className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1.5 text-gray-300 hover:text-gray-500 text-sm">✕</button>
              )}
            </div>
            <div className="flex gap-1 flex-nowrap">
              {['all', 'debit', 'credit', 'transfer', 'split'].map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    typeFilter === f
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!loadingTx && transactions.length === 0 && (
          <div className="px-4 pb-4">
            <InlineTip icon="🧾" title="No transactions yet">
              Use <strong>Add Transaction</strong> above to record a purchase, or go to <strong>Import</strong> to upload a bank statement and import multiple transactions at once.
            </InlineTip>
          </div>
        )}
        {loadingTx ? (
          <div className="text-center py-8 text-gray-400">Loading…</div>
        ) : visibleTx.length === 0 && transactions.length > 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No transactions match your filter.</div>
        ) : transactions.length > 0 ? (
          <ul className="divide-y divide-gray-50">
            {visibleTx.map((tx) => (
              <li key={tx.id} className="px-4 py-3 hover:bg-gray-50">
                {editingId === tx.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={editFields.type}
                      onChange={(e) => setEditFields((p) => ({ ...p, type: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                    <div className="relative min-w-28">
                      <span className="absolute left-2 top-1.5 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editFields.amount}
                        onChange={(e) => setEditFields((p) => ({ ...p, amount: e.target.value }))}
                        className="border border-gray-300 rounded-lg pl-5 pr-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <input
                      type="date"
                      value={editFields.date}
                      onChange={(e) => setEditFields((p) => ({ ...p, date: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={editFields.note}
                      onChange={(e) => setEditFields((p) => ({ ...p, note: e.target.value }))}
                      placeholder="Note"
                      className="flex-1 min-w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => updateTxMutation.mutate({ txId: tx.id, data: { ...editFields, note: editFields.note || null } })}
                      disabled={!editFields.amount || updateTxMutation.isPending}
                      className="bg-indigo-600 text-white rounded-lg px-3 py-1 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 text-sm px-1">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${txBadgeClass(tx)}`}>
                        {tx.split_id ? '⊕ split' : tx.transfer_id ? '⇄ transfer' : tx.type}
                      </span>
                      <div className="min-w-0">
                        {editingPayee === tx.note && tx.note ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={payeeInput}
                              onChange={(e) => setPayeeInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') submitPayeeEdit(tx.note); if (e.key === 'Escape') setEditingPayee(null) }}
                              className="border border-indigo-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-48"
                              placeholder="Clean name…"
                            />
                            <button onClick={() => submitPayeeEdit(tx.note)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">✓</button>
                            <button onClick={() => setEditingPayee(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                          </div>
                        ) : (
                          <p
                            className="text-sm text-gray-800 truncate cursor-pointer hover:text-indigo-600 transition-colors"
                            title={aliasMap[tx.note] ? tx.note : 'Click to set alias'}
                            onClick={() => tx.note && !tx.transfer_id && !tx.split_id && startPayeeEdit(tx.note)}
                          >
                            {aliasMap[tx.note] ?? tx.note ?? '—'}
                            {aliasMap[tx.note] && <span className="ml-1 text-xs text-indigo-300">✎</span>}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">{tx.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-medium text-sm tabular-nums ${tx.type === 'credit' ? 'text-emerald-600' : 'text-gray-700'}`}>
                        {tx.type === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                      </span>
                      {!tx.transfer_id && !tx.split_id && (
                        <button
                          onClick={() => startEdit(tx)}
                          className="text-gray-300 hover:text-indigo-500 transition-colors text-xs"
                          title="Edit"
                        >
                          ✎
                        </button>
                      )}
                      {confirmDeleteId === tx.id ? (
                        <>
                          <button
                            onClick={() => { deleteTxMutation.mutate(tx); setConfirmDeleteId(null) }}
                            className="text-xs bg-rose-500 text-white rounded px-2 py-0.5 hover:bg-rose-600"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(tx.id)}
                          className="text-gray-300 hover:text-rose-500 transition-colors text-xs"
                          title="Delete"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Layout>
  )
}
