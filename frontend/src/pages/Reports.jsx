import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import Layout from '../components/Layout'
import { getHouseholds } from '../api/households'
import { getSpendingReport } from '../api/reports'
import { exportTransactionsCsv } from '../api/transactions'
import { fmt, shortMonth, today, triggerDownload } from '../utils'

const RANGE_OPTIONS = [
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '12 months', value: 12 },
]

const BAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="border border-gray-200 rounded-lg shadow-lg p-3 text-sm" style={{ background: '#fff' }}>
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.fill }} />
            <span className="text-gray-600">{p.name}</span>
          </span>
          <span className="font-medium text-gray-900">{fmt(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between font-semibold">
        <span className="text-gray-700">Total</span>
        <span className="text-gray-900">{fmt(total)}</span>
      </div>
    </div>
  )
}

const VIEW_OPTIONS = [
  { label: 'By Envelope', value: 'envelope' },
  { label: 'By Account', value: 'account' },
]

export default function Reports() {
  const [range, setRange] = useState(6)
  const [view, setView] = useState('envelope')
  const [exportStart, setExportStart] = useState(`${new Date().getFullYear()}-01-01`)
  const [exportEnd, setExportEnd] = useState(today())
  const [exporting, setExporting] = useState(false)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports-spending', household?.id, range],
    queryFn: () => getSpendingReport(household.id, range).then((r) => r.data),
    enabled: !!household,
  })

  const handleExport = async () => {
    if (!household) return
    setExporting(true)
    try {
      const res = await exportTransactionsCsv(household.id, { start: exportStart, end: exportEnd })
      triggerDownload(res.data, `transactions-${exportStart}-to-${exportEnd}.csv`)
    } finally {
      setExporting(false)
    }
  }

  // Build unique groups/envelopes for chart bars
  const envelopeKeys = report?.rows.map((r) => r.envelope_name) ?? []

  // Build chart data: one entry per month
  const chartData = (report?.months ?? []).map((m) => {
    const entry = { month: shortMonth(m) }
    for (const row of report?.rows ?? []) {
      const cell = row.monthly.find((c) => c.month === m)
      entry[row.envelope_name] = cell ? parseFloat(cell.spent) : 0
    }
    return entry
  })

  // Sort rows by total descending for table
  const sortedRows = [...(report?.rows ?? [])].sort((a, b) => parseFloat(b.total) - parseFloat(a.total))

  const grandTotal = sortedRows.reduce((s, r) => s + parseFloat(r.total), 0)

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spending Reports</h1>
          <p className="text-gray-500 text-sm">Spending by envelope over time</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setView(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  range === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-500">Export transactions</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={exportStart}
            onChange={(e) => setExportStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={exportEnd}
            onChange={(e) => setExportEnd(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !household}
          className="bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Exporting…' : '↓ CSV'}
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      )}

      {!isLoading && report && (
        <>
          {/* Bar chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Monthly Spending by Envelope</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 50 }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                {envelopeKeys.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={BAR_COLORS[i % BAR_COLORS.length]} radius={i === envelopeKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown table */}
          {view === 'envelope' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Breakdown</h2>
                <span className="text-sm text-gray-400">Total: <span className="font-semibold text-gray-700">{fmt(grandTotal)}</span></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide w-40">Envelope</th>
                      {report.months.map((m) => (
                        <th key={m} className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                          {shortMonth(m)}
                        </th>
                      ))}
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedRows.map((row) => (
                      <tr key={row.envelope_id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                          {row.group_name && <span className="text-gray-400 text-xs mr-1">{row.group_name} /</span>}
                          <span style={{ color: BAR_COLORS[envelopeKeys.indexOf(row.envelope_name) % BAR_COLORS.length] }}>■</span>
                          {' '}{row.envelope_name}
                        </td>
                        {row.monthly.map((cell) => {
                          const over = parseFloat(cell.allocated) > 0 && parseFloat(cell.spent) > parseFloat(cell.allocated)
                          const hasData = parseFloat(cell.spent) > 0
                          return (
                            <td key={cell.month} className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                              {hasData ? (
                                <span className={over ? 'text-rose-600 font-medium' : 'text-gray-700'}>{fmt(cell.spent)}</span>
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmt(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td className="px-5 py-3 font-semibold text-gray-700">Total</td>
                      {report.months.map((m) => {
                        const monthTotal = (report.rows ?? []).reduce((s, row) => {
                          const cell = row.monthly.find((c) => c.month === m)
                          return s + (cell ? parseFloat(cell.spent) : 0)
                        }, 0)
                        return (
                          <td key={m} className="px-3 py-3 text-right font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                            {fmt(monthTotal)}
                          </td>
                        )
                      })}
                      <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">{fmt(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {view === 'account' && (
            <div className="space-y-4">
              {(report.account_groups ?? []).length === 0 && (
                <div className="text-sm text-gray-400 text-center py-8">
                  No accounts assigned yet. Open an envelope and set "Funded by" to group spending here.
                </div>
              )}
              {(report.account_groups ?? []).map((group) => (
                <div key={group.account_id ?? 'unassigned'} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-700">
                      {group.account_name ?? <span className="text-gray-400 italic">Unassigned</span>}
                    </h2>
                    <span className="text-sm text-gray-400">Total: <span className="font-semibold text-gray-700">{fmt(group.total)}</span></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-50">
                          <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide w-40">Envelope</th>
                          {report.months.map((m) => (
                            <th key={m} className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                              {shortMonth(m)}
                            </th>
                          ))}
                          <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.rows.map((row) => (
                          <tr key={row.envelope_id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                              {row.group_name && <span className="text-gray-400 text-xs mr-1">{row.group_name} /</span>}
                              {row.envelope_name}
                            </td>
                            {row.monthly.map((cell) => {
                              const over = parseFloat(cell.allocated) > 0 && parseFloat(cell.spent) > parseFloat(cell.allocated)
                              const hasData = parseFloat(cell.spent) > 0
                              return (
                                <td key={cell.month} className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                                  {hasData ? (
                                    <span className={over ? 'text-rose-600 font-medium' : 'text-gray-700'}>{fmt(cell.spent)}</span>
                                  ) : (
                                    <span className="text-gray-200">—</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmt(row.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-100 bg-gray-50">
                          <td className="px-5 py-3 font-semibold text-gray-700">{group.account_name ?? 'Unassigned'} total</td>
                          {group.monthly_totals.map((t, i) => (
                            <td key={i} className="px-3 py-3 text-right font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                              {fmt(t)}
                            </td>
                          ))}
                          <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">{fmt(group.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!isLoading && report?.rows.length === 0 && (
        <div className="text-center py-16 text-gray-400">No spending data for this period.</div>
      )}
    </Layout>
  )
}
