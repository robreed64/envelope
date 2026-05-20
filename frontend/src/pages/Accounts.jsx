import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import { getHouseholds } from '../api/households'
import { getAccounts, getAccountTransactions } from '../api/accounts'
import { setTransactionCleared } from '../api/transactions'
import { fmt } from '../utils'

function accountLabel(a) {
  if (a.display_name) return a.display_name
  const suffix = a.account_id ? ` ···${a.account_id.slice(-4)}` : ''
  return `${a.bank_name}${suffix}`
}

function diff(cleared, target) {
  if (!target) return null
  return Math.round((parseFloat(target) - cleared) * 100) / 100
}

export default function Accounts() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [reconciling, setReconciling] = useState(false)
  const [statementBalance, setStatementBalance] = useState('')

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
  }

  if (selectedId && selected) {
    const totalSpent = transactions.filter((t) => t.type === 'debit').reduce((s, t) => s + parseFloat(t.amount), 0)
    const totalReceived = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + parseFloat(t.amount), 0)

    const clearedDebits = transactions.filter((t) => t.cleared && t.type === 'debit').reduce((s, t) => s + parseFloat(t.amount), 0)
    const clearedCredits = transactions.filter((t) => t.cleared && t.type === 'credit').reduce((s, t) => s + parseFloat(t.amount), 0)
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
          <div className="text-sm text-gray-400">No transactions for this account.</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {transactions.map((tx) => (
              <div
                key={tx.id}
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
                    <div className="text-xs text-gray-400">{tx.envelope_name}</div>
                  </div>
                </div>
                <span className={`font-medium tabular-nums ml-3 shrink-0 ${tx.type === 'debit' ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {tx.type === 'debit' ? '-' : '+'}{fmt(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Layout>
    )
  }

  return (
    <Layout title="Accounts">
      {loadingAccounts ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="text-sm text-gray-400">
          No accounts yet. Import an OFX/QFX file or a CSV to create one.
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
