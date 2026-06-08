export const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}


export const today = () => new Date().toISOString().split('T')[0]

export const monthLabel = (date = new Date()) =>
  date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export const monthLabelStr = (monthStr) =>
  monthLabel(new Date(monthStr + 'T00:00:00'))

export const envelopeLabel = (e) => {
  const typeLabel = e.envelope_type ? ENVELOPE_TYPES[e.envelope_type]?.label : null
  return typeLabel ? `${typeLabel} / ${e.name}` : e.name
}

export const shortMonth = (isoStr) => {
  const d = new Date(isoStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export const nextMonthOf = (dateStr) => {
  const d = new Date((dateStr || today()) + 'T00:00:00')
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return {
    first: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
    label: next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

export const shiftMonth = (monthStr, delta) => {
  const d = new Date(monthStr + 'T00:00:00')
  const shifted = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-01`
}

export const fmt = (amount) => `$${parseFloat(amount).toFixed(2)}`

export const accountLabel = (a) => {
  if (a.display_name) return a.display_name
  const suffix = a.account_id ? ` ···${a.account_id.slice(-4)}` : ''
  return `${a.bank_name}${suffix}`
}

export const buildAliasMap = (aliases) =>
  Object.fromEntries(aliases.map((a) => [a.raw, a.alias]))

export const calcBudgetMetrics = (period) => {
  const allocated = parseFloat(period?.allocated ?? 0)
  const rollover = parseFloat(period?.rollover ?? 0)
  const spent = parseFloat(period?.spent ?? 0)
  const balance = parseFloat(period?.balance ?? 0)
  const available = allocated + rollover
  const pct = available > 0 ? Math.min((spent / available) * 100, 100) : 0
  const overBudget = balance < 0
  const barColor = pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500'
  return { allocated, rollover, spent, balance, available, pct, overBudget, barColor }
}

export const ENVELOPE_TEMPLATES = [
  { group: 'needs',     name: 'Rent / Mortgage' },
  { group: 'needs',     name: 'Utilities' },
  { group: 'needs',     name: 'Internet' },
  { group: 'needs',     name: 'Phone' },
  { group: 'needs',     name: 'Groceries' },
  { group: 'needs',     name: 'Gas' },
  { group: 'needs',     name: 'Car Insurance' },
  { group: 'needs',     name: 'Health Insurance' },
  { group: 'needs',     name: 'Pharmacy' },
  { group: 'needs',     name: 'Childcare' },
  { group: 'needs',     name: 'School Supplies' },
  { group: 'wants',     name: 'Dining Out' },
  { group: 'wants',     name: 'Gym' },
  { group: 'wants',     name: 'Clothing' },
  { group: 'wants',     name: 'Personal Care' },
  { group: 'wants',     name: 'Subscriptions' },
  { group: 'wants',     name: 'Hobbies' },
  { group: 'wants',     name: 'Pet Care' },
  { group: 'dreams',    name: 'Vacation' },
  { group: 'fix',       name: 'Debt Payoff' },
  { group: 'emergency', name: 'Emergency Fund' },
]

export const TEMPLATE_TYPE_SUGGESTIONS = {
  'Rent / Mortgage':  'needs',
  'Utilities':        'needs',
  'Internet':         'needs',
  'Phone':            'needs',
  'Groceries':        'needs',
  'Gas':              'needs',
  'Car Insurance':    'needs',
  'Health Insurance': 'needs',
  'Pharmacy':         'needs',
  'Childcare':        'needs',
  'School Supplies':  'needs',
  'Dining Out':       'wants',
  'Gym':              'wants',
  'Clothing':         'wants',
  'Personal Care':    'wants',
  'Subscriptions':    'wants',
  'Hobbies':          'wants',
  'Pet Care':         'wants',
  'Emergency Fund':   'emergency',
  'Vacation':         'dreams',
  'Debt Payoff':      'fix',
}

export const ENVELOPE_TYPES = {
  needs:     { label: 'Needs',     dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  wants:     { label: 'Wants',     dot: 'bg-violet-400', badge: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  dreams:    { label: 'Dreams',    dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  fix:       { label: 'Fix',       dot: 'bg-rose-400',   badge: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
  emergency: { label: 'Emergency', dot: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const txBadgeClass = (tx) => {
  if (tx.split_id) return 'bg-purple-50 text-purple-600'
  if (tx.transfer_id) return 'bg-indigo-50 text-indigo-600'
  return tx.type === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
}
