import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import Layout from '../components/Layout'
import { getHouseholds } from '../api/households'
import { getSpendingReport } from '../api/reports'
import { exportTransactionsCsv } from '../api/transactions'
import { fmt, shortMonth, today, triggerDownload, ENVELOPE_TYPES } from '../utils'

const RANGE_OPTIONS = [
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '12 months', value: 12 },
]

const TYPE_ORDER = ['needs', 'wants', 'dreams', 'fix', 'emergency']

const TYPE_COLORS = {
  needs:     '#60a5fa',
  wants:     '#a78bfa',
  dreams:    '#fbbf24',
  fix:       '#fb7185',
  emergency: '#94a3b8',
}

const VIEW_OPTIONS = [
  { label: 'By Envelope', value: 'envelope' },
  { label: 'By Account',  value: 'account'  },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="border border-gray-200 rounded-lg shadow-lg p-3 text-sm bg-white">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.filter((p) => p.value > 0).map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.fill }} />
            <span className="text-gray-600">{ENVELOPE_TYPES[p.name]?.label ?? 'Other'}</span>
          </span>
          <span className="font-medium text-gray-900">{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between font-semibold">
          <span className="text-gray-700">Total</span>
          <span className="text-gray-900">{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

const EnvelopeTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const allocated = payload.find((p) => p.dataKey === 'allocated')?.value ?? 0
  const spent = payload.find((p) => p.dataKey === 'spent')?.value ?? 0
  const over = allocated > 0 && spent > allocated
  return (
    <div className="border border-gray-200 rounded-lg shadow-lg p-3 text-sm bg-white">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      <div className="flex justify-between gap-6">
        <span className="text-gray-500">Allocated</span>
        <span className="font-medium text-gray-700">{fmt(allocated)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-gray-500">Spent</span>
        <span className={`font-medium ${over ? 'text-rose-600' : 'text-gray-700'}`}>{fmt(spent)}</span>
      </div>
      {over && (
        <div className="flex justify-between gap-6 border-t border-gray-100 mt-1 pt-1">
          <span className="text-rose-500">Over budget</span>
          <span className="font-medium text-rose-600">{fmt(spent - allocated)}</span>
        </div>
      )}
    </div>
  )
}

function EnvelopeHistoryChart({ row, months }) {
  const data = months.map((m) => {
    const cell = row.monthly.find((c) => c.month === m)
    return {
      month: shortMonth(m),
      allocated: cell ? parseFloat(cell.allocated) : 0,
      spent: cell ? parseFloat(cell.spent) : 0,
    }
  })
  return (
    <div className="pt-3 pb-1">
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={14} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={48} />
          <Tooltip content={<EnvelopeTooltip />} wrapperStyle={{ zIndex: 50 }} />
          <Bar dataKey="allocated" fill="#e0e7ff" radius={[2, 2, 0, 0]} />
          <Bar dataKey="spent" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.spent > entry.allocated && entry.allocated > 0 ? '#fb7185' : '#6366f1'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Reports() {
  const [range, setRange] = useState(6)
  const [view, setView] = useState('envelope')
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState(null)
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

  // Stacked bar chart grouped by envelope type
  const activeTypes = TYPE_ORDER.filter((t) =>
    (report?.rows ?? []).some((r) => r.envelope_type === t)
  )
  const hasUncategorized = (report?.rows ?? []).some((r) => !r.envelope_type)

  const typeChartData = (report?.months ?? []).map((m) => {
    const entry = { month: shortMonth(m) }
    for (const t of TYPE_ORDER) {
      entry[t] = (report?.rows ?? [])
        .filter((r) => r.envelope_type === t)
        .reduce((s, r) => {
          const cell = r.monthly.find((c) => c.month === m)
          return s + (cell ? parseFloat(cell.spent) : 0)
        }, 0)
    }
    if (hasUncategorized) {
      entry['other'] = (report?.rows ?? [])
        .filter((r) => !r.envelope_type)
        .reduce((s, r) => {
          const cell = r.monthly.find((c) => c.month === m)
          return s + (cell ? parseFloat(cell.spent) : 0)
        }, 0)
    }
    return entry
  })

  const sortedRows = [...(report?.rows ?? [])].sort((a, b) => parseFloat(b.total) - parseFloat(a.total))
  const grandTotal = sortedRows.reduce((s, r) => s + parseFloat(r.total), 0)

  const toggleEnvelope = (id) => setSelectedEnvelopeId((prev) => (prev === id ? null : id))

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

      {isLoading && <div className="text-center py-16 text-gray-400">Loading…</div>}

      {!isLoading && report && (
        <>
          {/* Monthly spending by type — stacked bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Monthly Spending by Type</h2>
              <div className="flex items-center gap-3">
                {[...activeTypes, ...(hasUncategorized ? ['other'] : [])].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: TYPE_COLORS[t] ?? '#d1d5db' }} />
                    {ENVELOPE_TYPES[t]?.label ?? 'Other'}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={typeChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={52} />
                <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 50 }} />
                {[...activeTypes, ...(hasUncategorized ? ['other'] : [])].map((t, i, arr) => (
                  <Bar
                    key={t}
                    dataKey={t}
                    stackId="a"
                    fill={TYPE_COLORS[t] ?? '#d1d5db'}
                    radius={i === arr.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By Envelope table with drill-down history */}
          {view === 'envelope' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Breakdown</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">Click a row to see history</span>
                  <span className="text-sm text-gray-400">Total: <span className="font-semibold text-gray-700">{fmt(grandTotal)}</span></span>
                </div>
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
                      <>
                        <tr
                          key={row.envelope_id}
                          onClick={() => toggleEnvelope(row.envelope_id)}
                          className={`cursor-pointer transition-colors ${selectedEnvelopeId === row.envelope_id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {row.envelope_type && (
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[row.envelope_type] }} />
                              )}
                              {row.envelope_name}
                            </div>
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
                        {selectedEnvelopeId === row.envelope_id && (
                          <tr key={`${row.envelope_id}-chart`} className="bg-indigo-50">
                            <td colSpan={report.months.length + 2} className="px-5">
                              <div className="flex items-center gap-2 pt-3 pb-1">
                                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">{row.envelope_name} — monthly history</span>
                                <span className="flex items-center gap-1 text-xs text-gray-400 ml-4">
                                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-indigo-200" /> Allocated
                                </span>
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-indigo-500" /> Spent
                                </span>
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-rose-400" /> Over budget
                                </span>
                              </div>
                              <EnvelopeHistoryChart row={row} months={report.months} />
                            </td>
                          </tr>
                        )}
                      </>
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

          {/* By Account */}
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
                              {row.envelope_type && (
                                <span className="w-2 h-2 rounded-full shrink-0 inline-block mr-1.5" style={{ background: TYPE_COLORS[row.envelope_type] }} />
                              )}
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
