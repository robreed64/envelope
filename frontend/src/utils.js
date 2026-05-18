export const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}


export const today = () => new Date().toISOString().split('T')[0]

export const monthLabel = (date = new Date()) =>
  date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export const monthLabelStr = (monthStr) =>
  monthLabel(new Date(monthStr + 'T00:00:00'))

export const envelopeLabel = (e) =>
  e.group_name ? `${e.group_name} / ${e.name}` : e.name

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
  { group: 'Home',          name: 'Rent / Mortgage' },
  { group: 'Home',          name: 'Utilities' },
  { group: 'Home',          name: 'Internet' },
  { group: 'Home',          name: 'Phone' },
  { group: 'Food',          name: 'Groceries' },
  { group: 'Food',          name: 'Dining Out' },
  { group: 'Transport',     name: 'Gas' },
  { group: 'Transport',     name: 'Car Insurance' },
  { group: 'Health',        name: 'Health Insurance' },
  { group: 'Health',        name: 'Pharmacy' },
  { group: 'Health',        name: 'Gym' },
  { group: 'Personal',      name: 'Clothing' },
  { group: 'Personal',      name: 'Personal Care' },
  { group: 'Entertainment', name: 'Subscriptions' },
  { group: 'Entertainment', name: 'Hobbies' },
  { group: 'Savings',       name: 'Emergency Fund' },
  { group: 'Savings',       name: 'Vacation' },
  { group: 'Debt',          name: 'Debt Payoff' },
  { group: 'Kids',          name: 'Childcare' },
  { group: 'Kids',          name: 'School Supplies' },
  { group: 'Pets',          name: 'Pet Care' },
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
