import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Layout from '../components/Layout'
import { getHouseholds } from '../api/households'
import { getAccounts, getAccountTransactions } from '../api/accounts'
import { fmt } from '../utils'

function accountLabel(a) {
  if (a.display_name) return a.display_name
  const suffix = a.account_id ? ` ···${a.account_id.slice(-4)}` : ''
  return `${a.bank_name}${suffix}`
}

export default function Accounts() {
  const [selectedId, setSelectedId] = useState(null)

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

  const selected = accounts.find((a) => a.id === selectedId)

  if (selectedId && selected) {
    const totalSpent = transactions.filter((t) => t.type === 'debit').reduce((s, t) => s + parseFloat(t.amount), 0)
    const totalReceived = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + parseFloat(t.amount), 0)

    return (
      <Layout title={accountLabel(selected)}>
        <button
          onClick={() => setSelectedId(null)}
          className="text-sm text-indigo-600 hover:underline mb-5 block"
        >
          ← All accounts
        </button>

        <div className="flex flex-wrap gap-3 mb-6">
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

        {loadingTx ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="text-sm text-gray-400">No transactions for this account.</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 w-24 shrink-0 tabular-nums">{tx.date}</span>
                  <div>
                    <div className="text-gray-900">{tx.note || '—'}</div>
                    <div className="text-xs text-gray-400">{tx.envelope_name}</div>
                  </div>
                </div>
                <span className={`font-medium tabular-nums ${tx.type === 'debit' ? 'text-rose-600' : 'text-emerald-600'}`}>
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
