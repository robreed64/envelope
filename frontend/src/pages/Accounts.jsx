import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import { getHouseholds } from '../api/households'
import { getAccounts, createAccount, getAccountTransactions } from '../api/accounts'
import { getEnvelopes } from '../api/envelopes'
import { setTransactionCleared, splitTransaction } from '../api/transactions'
import { fmt, accountLabel, envelopeLabel } from '../utils'

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment']

function diff(cleared, target) {
  if (!target) return null
  return Math.round((parseFloat(target) - cleared) * 100) / 100
}

function AddAccountForm({ householdId, onClose }) {
  const qc = useQueryClient()
  const [bankName, setBankName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accountType, setAccountType] = useState('')
  const [lastFour, setLastFour] = useState('')

  const createMutation = useMutation({
    mutationFn: (data) => createAccount(householdId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts', householdId] })
      onClose()
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!bankName.trim()) return
    createMutation.mutate({
      bank_name: bankName.trim(),
      display_name: displayName.trim() || null,
      account_type: accountType || null,
      account_id: lastFour.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-indigo-200 p-4 mb-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">New account</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bank name <span className="text-rose-400">*</span></label>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. Chase, Ally"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Chase Checking"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Account type</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— optional —</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Last 4 digits</label>
          <input
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="optional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!bankName.trim() || createMutation.isPending}
          className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Saving…' : 'Add account'}
        </button>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
          Cancel
        </button>
      </div>
    </form>
  )
}

function SplitEditor({ tx, envelopes, householdId, onClose, onSuccess }) {
  const total = parseFloat(tx.amount)
  const [legs, setLegs] = useState([
    { envelope_id: '', amount: '', note: tx.note || '' },
    { envelope_id: '', amount: '', note: '' },
  ])

  const allocated = legs.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const remaining = Math.round((total - allocated) * 100) / 100
  const canSubmit =
    remaining === 0 &&
    legs.length >= 2 &&
    legs.every((l) => l.envelope_id && parseFloat(l.amount) > 0)

  const splitMutation = useMutation({
    mutationFn: () =>
      splitTransaction(
        householdId,
        tx.id,
        legs.map((l) => ({
          envelope_id: l.envelope_id,
          amount: parseFloat(l.amount),
          note: l.note.trim() || null,
        }))
      ),
    onSuccess,
  })

  const updateLeg = (i, field, value) =>
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const addLeg = () => setLegs((prev) => [...prev, { envelope_id: '', amount: '', note: '' }])

  const removeLeg = (i) => setLegs((prev) => prev.filter((_, idx) => idx !== i))

  const distributeEvenly = () => {
    const each = Math.floor((total / legs.length) * 100) / 100
    const remainder = Math.round((total - each * legs.length) * 100) / 100
    setLegs((prev) =>
      prev.map((l, i) => ({
        ...l,
        amount: i === 0 ? String(Math.round((each + remainder) * 100) / 100) : String(each),
      }))
    )
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-4 mt-1 mb-1">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-700">
          Split {fmt(total)} across envelopes
        </div>
        <button
          type="button"
          onClick={distributeEvenly}
          className="text-xs text-indigo-600 hover:underline"
        >
          Distribute evenly
        </button>
      </div>

      <div className="space-y-2 mb-3">
        {legs.map((leg, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              value={leg.envelope_id}
              onChange={(e) => updateLeg(i, 'envelope_id', e.target.value)}
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— envelope —</option>
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>{envelopeLabel(e)}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={leg.amount}
              onChange={(e) => updateLeg(i, 'amount', e.target.value)}
              placeholder="0.00"
              className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={leg.note}
              onChange={(e) => updateLeg(i, 'note', e.target.value)}
              placeholder="note (optional)"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {legs.length > 2 && (
              <button
                type="button"
                onClick={() => removeLeg(i)}
                className="text-gray-400 hover:text-rose-500 text-lg leading-none shrink-0"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={addLeg}
            className="text-xs text-indigo-600 hover:underline"
          >
            + Add line
          </button>
          <span className={`text-xs tabular-nums font-medium ${remaining === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {remaining === 0 ? '✓ Balanced' : `${fmt(Math.abs(remaining))} ${remaining > 0 ? 'remaining' : 'over'}`}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => splitMutation.mutate()}
            disabled={!canSubmit || splitMutation.isPending}
            className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {splitMutation.isPending ? 'Saving…' : 'Confirm split'}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Accounts() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [statementBalance, setStatementBalance] = useState('')
  const [splittingTxId, setSplittingTxId] = useState(null)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts', household?.id],
    queryFn: () => getAccounts(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['account-transactions', household?.id, selectedId],
    queryFn: () => getAccountTransactions(household.id, selectedId).then((r) => r.data),
    enabled: !!household && !!selectedId,
  })

  const { data: envelopes = [] } = useQuery({
    queryKey: ['envelopes', household?.id],
    queryFn: () => getEnvelopes(household.id).then((r) => r.data),
    enabled: !!household && !!selectedId,
  })

  const clearMutation = useMutation({
    mutationFn: ({ envelopeId, txId, cleared }) =>
      setTransactionCleared(household.id, envelopeId, txId, cleared),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['account-transactions', household?.id, selectedId] }),
  })

  const selected = accounts.find((a) => a.id === selectedId)

  const handleBack = () => {
    setSelectedId(null)
    setReconciling(false)
    setStatementBalance('')
    setSplittingTxId(null)
  }

  if (selectedId && selected) {
    const { totalSpent, totalReceived, clearedDebits, clearedCredits } = transactions.reduce(
      (acc, t) => {
        const amt = parseFloat(t.amount)
        if (t.type === 'debit') acc.totalSpent += amt
        else acc.totalReceived += amt
        if (t.cleared && t.type === 'debit') acc.clearedDebits += amt
        else if (t.cleared) acc.clearedCredits += amt
        return acc
      },
      { totalSpent: 0, totalReceived: 0, clearedDebits: 0, clearedCredits: 0 }
    )
    const clearedBalance = clearedCredits - clearedDebits
    const diffAmt = diff(clearedBalance, statementBalance)
    const balanced = diffAmt === 0

    return (
      <Layout title={accountLabel(selected)}>
        <div className="flex items-center justify-between mb-5">
          <button onClick={handleBack} className="text-sm text-indigo-600 hover:underline">
            ← All accounts
          </button>
          {!reconciling && (
            <button
              onClick={() => setReconciling(true)}
              className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700"
            >
              Reconcile
            </button>
          )}
        </div>

        {reconciling && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4 mb-5">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-amber-700 font-medium mb-1">Statement ending balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  placeholder="0.00"
                  className="border border-amber-300 rounded px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="text-sm">
                <div className="text-gray-500">Cleared balance</div>
                <div className="font-semibold text-gray-900 tabular-nums">{fmt(Math.abs(clearedBalance))}</div>
              </div>
              {statementBalance !== '' && (
                <div className="text-sm">
                  <div className="text-gray-500">Difference</div>
                  <div className={`font-semibold tabular-nums ${balanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {balanced ? '✓ $0.00' : fmt(Math.abs(diffAmt))}
                  </div>
                </div>
              )}
              <button
                onClick={() => { setReconciling(false); setStatementBalance('') }}
                className="text-sm text-gray-400 hover:text-gray-600 ml-auto"
              >
                Done
              </button>
            </div>
            <p className="text-xs text-amber-600 mt-2">Check off transactions that appear on your bank statement.</p>
          </div>
        )}

        {!reconciling && (
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 min-w-[100px]">
              <div className="text-xs text-gray-500 mb-1">Transactions</div>
              <div className="text-lg font-semibold text-gray-900">{transactions.length}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 min-w-[120px]">
              <div className="text-xs text-gray-500 mb-1">Total spent</div>
              <div className="text-lg font-semibold text-rose-600">{fmt(totalSpent)}</div>
            </div>
            {totalReceived > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 min-w-[120px]">
                <div className="text-xs text-gray-500 mb-1">Total received</div>
                <div className="text-lg font-semibold text-emerald-600">{fmt(totalReceived)}</div>
              </div>
            )}
          </div>
        )}

        {loadingTx ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="text-sm text-gray-400">No transactions for this account yet.</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {transactions.map((tx) => (
              <div key={tx.id}>
                <div
                  className={`flex items-center justify-between px-4 py-3 text-sm ${reconciling && tx.cleared ? 'bg-emerald-50' : ''}`}
                >
                  {reconciling && (
                    <input
                      type="checkbox"
                      checked={tx.cleared}
                      onChange={(e) =>
                        clearMutation.mutate({ envelopeId: tx.envelope_id, txId: tx.id, cleared: e.target.checked })
                      }
                      className="mr-3 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                    />
                  )}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-gray-400 w-24 shrink-0 tabular-nums">{tx.date}</span>
                    <div className="min-w-0">
                      <div className="text-gray-900 truncate">{tx.note || '—'}</div>
                      <div className="text-xs text-gray-400">
                        {tx.split_id ? <span className="text-indigo-400">split · </span> : null}
                        {tx.envelope_name}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className={`font-medium tabular-nums ${tx.type === 'debit' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {tx.type === 'debit' ? '-' : '+'}{fmt(tx.amount)}
                    </span>
                    {!reconciling && !tx.split_id && (
                      <button
                        onClick={() => setSplittingTxId(splittingTxId === tx.id ? null : tx.id)}
                        className="text-xs text-gray-400 hover:text-indigo-600"
                      >
                        Split
                      </button>
                    )}
                  </div>
                </div>
                {splittingTxId === tx.id && (
                  <div className="px-4 pb-3">
                    <SplitEditor
                      tx={tx}
                      envelopes={envelopes}
                      householdId={household.id}
                      onClose={() => setSplittingTxId(null)}
                      onSuccess={() => {
                        setSplittingTxId(null)
                        qc.invalidateQueries({ queryKey: ['account-transactions', household?.id, selectedId] })
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Layout>
    )
  }

  return (
    <Layout title="Accounts">
      {showForm && household && (
        <AddAccountForm householdId={household.id} onClose={() => setShowForm(false)} />
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700"
          >
            + Add account
          </button>
        )}
      </div>

      {loadingAccounts ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : accounts.length === 0 && !showForm ? (
        <div className="text-sm text-gray-400">
          No accounts yet. Add one manually or import an OFX/QFX or CSV file.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className="bg-white rounded-lg border border-gray-200 px-4 py-4 text-left hover:border-indigo-400 hover:shadow-sm transition-all"
            >
              <div className="font-medium text-gray-900">{accountLabel(a)}</div>
              {a.account_type && (
                <div className="text-xs text-gray-400 mt-1 capitalize">{a.account_type}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </Layout>
  )
}
