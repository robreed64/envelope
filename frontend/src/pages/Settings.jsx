import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../api/client'
import Layout from '../components/Layout'
import { getHouseholds, updateHousehold, getMembers, updateMemberRole, removeMember, createInvite, listInvites, revokeInvite } from '../api/households'

const SEASONS = [
  {
    value: 'recover',
    label: 'Recover',
    description: 'You have non-mortgage debt you are actively paying down. Priority: eliminate debt, cover essentials.',
    color: 'border-rose-200 bg-rose-50',
    active: 'border-rose-400 bg-rose-50 ring-2 ring-rose-300',
    dot: 'bg-rose-400',
  },
  {
    value: 'fund',
    label: 'Fund',
    description: 'Debt is cleared. You are building savings toward a big future goal — retirement, a home, a dream.',
    color: 'border-amber-200 bg-amber-50',
    active: 'border-amber-400 bg-amber-50 ring-2 ring-amber-300',
    dot: 'bg-amber-400',
  },
  {
    value: 'activate',
    label: 'Activate',
    description: 'You are spending freely on experiences and living in the present. Time > money right now.',
    color: 'border-emerald-200 bg-emerald-50',
    active: 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300',
    dot: 'bg-emerald-400',
  },
  {
    value: 'balance',
    label: 'Balance',
    description: 'You are doing both — saving for the future while enjoying life today. The best of both worlds.',
    color: 'border-indigo-200 bg-indigo-50',
    active: 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-300',
    dot: 'bg-indigo-400',
  },
]

const TIER_RANGES = [
  { label: 'Under $50,000', max: 50000 },
  { label: '$50,001 – $150,000', max: 150000 },
  { label: '$150,001 – $300,000', max: 300000 },
  { label: '$300,001 – $500,000', max: 500000 },
  { label: '$500,001 – $1,000,000', max: 1000000 },
  { label: 'Over $1,000,000', max: Infinity },
]

function getTierLabel(annualIncome) {
  if (!annualIncome) return null
  const n = parseFloat(annualIncome)
  return TIER_RANGES.find((t) => n <= t.max)?.label ?? TIER_RANGES[5].label
}

export default function Settings() {
  const qc = useQueryClient()

  const { data: households = [], isLoading } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const [name, setName] = useState('')
  const [season, setSeason] = useState('')
  const [annualIncome, setAnnualIncome] = useState('')
  const [saved, setSaved] = useState(false)
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteEmail, setInviteEmail] = useState('')
  const [copiedToken, setCopiedToken] = useState(null)
  const [expandedInvite, setExpandedInvite] = useState(null)

  const { data: appConfig } = useQuery({
    queryKey: ['config'],
    queryFn: () => client.get('/config').then((r) => r.data),
    staleTime: Infinity,
  })
  const [confirmRemove, setConfirmRemove] = useState(null)

  useEffect(() => {
    if (household) {
      setName(household.name ?? '')
      setSeason(household.season ?? '')
      setAnnualIncome(household.annual_income ? String(parseFloat(household.annual_income)) : '')
    }
  }, [household])

  const saveMutation = useMutation({
    mutationFn: (data) => updateHousehold(household.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['households'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members', household?.id],
    queryFn: () => getMembers(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', household?.id],
    queryFn: () => listInvites(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }) => updateMemberRole(household.id, memberId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', household.id] }),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId) => removeMember(household.id, memberId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members', household.id] }); setConfirmRemove(null) },
  })

  const createInviteMutation = useMutation({
    mutationFn: () => createInvite(household.id, { role: inviteRole, invited_email: inviteEmail.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invites', household.id] }); setInviteEmail('') },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId) => revokeInvite(household.id, inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', household.id] }),
  })

  const inviteUrl = (token) => `${appConfig?.base_url || window.location.origin}/join/${token}`

  const copyInviteLink = (token, url) => {
    navigator.clipboard.writeText(url ?? inviteUrl(token))
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const handleSave = () => {
    saveMutation.mutate({
      name: name.trim() || undefined,
      season: season || null,
      annual_income: annualIncome ? parseFloat(annualIncome) : null,
    })
  }

  if (isLoading) {
    return <Layout><div className="py-24 text-center text-gray-400">Loading…</div></Layout>
  }

  if (!household) {
    return <Layout><div className="py-24 text-center text-gray-400">No household found.</div></Layout>
  }

  const tierLabel = getTierLabel(annualIncome)

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Household preferences and Money Target configuration</p>
      </div>

      <div className="space-y-6 max-w-2xl">

        {/* Household name */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Household</h2>
          <div className="flex gap-3 items-center">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Household name"
            />
          </div>
        </section>

        {/* Annual income */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Annual take-home income</h2>
          <p className="text-xs text-gray-400 mb-3">
            Your total net household income after taxes. Used to determine your Money Target tier.
          </p>
          <div className="flex gap-3 items-center">
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={annualIncome}
                onChange={(e) => setAnnualIncome(e.target.value)}
                placeholder="e.g. 85000"
                className="border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-44"
              />
            </div>
            {tierLabel && (
              <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-3 py-1">
                Tier: {tierLabel}
              </span>
            )}
          </div>
        </section>

        {/* Financial season */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Financial season</h2>
          <p className="text-xs text-gray-400 mb-4">
            Your current season determines your Money Target allocation percentages.
            Seasons can change — review quarterly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SEASONS.map((s) => {
              const isActive = season === s.value
              return (
                <button
                  key={s.value}
                  onClick={() => setSeason(s.value)}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    isActive ? s.active : `${s.color} hover:border-gray-300`
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                    <span className="font-semibold text-sm text-gray-800">{s.label}</span>
                    {isActive && (
                      <span className="ml-auto text-xs font-medium text-gray-500">Selected</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.description}</p>
                </button>
              )
            })}
          </div>
          {!season && (
            <p className="text-xs text-amber-600 mt-3">
              Not sure? Start with <strong>Recover</strong> — the system reveals your season as you go.
            </p>
          )}
        </section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save settings'}
          </button>
          {saved && (
            <span className="text-sm text-emerald-600 font-medium">Saved</span>
          )}
        </div>

        {/* Members */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Members</h2>

          <div className="space-y-2 mb-5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center shrink-0 uppercase">
                    {m.email[0]}
                  </span>
                  <span className="text-sm text-gray-800 truncate">{m.email}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.role === 'owner' ? (
                    <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2.5 py-0.5 font-medium">Owner</span>
                  ) : (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => updateRoleMutation.mutate({ memberId: m.id, role: e.target.value })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      {confirmRemove === m.id ? (
                        <>
                          <button
                            onClick={() => removeMemberMutation.mutate(m.id)}
                            className="text-xs bg-rose-500 text-white rounded px-2 py-1 hover:bg-rose-600"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(m.id)}
                          className="text-xs text-gray-300 hover:text-rose-500 transition-colors"
                          title="Remove member"
                        >
                          ✕
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pending invite links */}
          {invites.length > 0 && (
            <div className="mb-5 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending invite links</p>
              {invites.map((inv) => {
                const url = inviteUrl(inv.token)
                const isExpanded = expandedInvite === inv.id
                return (
                  <div key={inv.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-gray-600 truncate">
                        {inv.invited_email ? (
                          <><span className="font-medium">{inv.invited_email}</span> · </>
                        ) : null}
                        <span className="capitalize">{inv.role}</span>
                        {' · '}
                        <span className="text-gray-400">
                          expires {new Date(inv.expires_at).toLocaleDateString()}
                        </span>
                      </span>
                      <button
                        onClick={() => setExpandedInvite(isExpanded ? null : inv.id)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors whitespace-nowrap"
                      >
                        {isExpanded ? 'Hide link' : 'Show link'}
                      </button>
                      <button
                        onClick={() => revokeInviteMutation.mutate(inv.id)}
                        className="text-gray-300 hover:text-rose-500 transition-colors ml-1"
                        title="Revoke invite"
                      >
                        ✕
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="flex gap-2 items-center">
                        <input
                          className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          defaultValue={url}
                          id={`invite-url-${inv.id}`}
                          onFocus={(e) => e.target.select()}
                          readOnly={false}
                        />
                        <button
                          onClick={() => {
                            const el = document.getElementById(`invite-url-${inv.id}`)
                            copyInviteLink(inv.token, el?.value)
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
                        >
                          {copiedToken === inv.token ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Generate new invite */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Generate invite link</p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="Email (optional)"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                onClick={() => createInviteMutation.mutate()}
                disabled={createInviteMutation.isPending}
                className="bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {createInviteMutation.isPending ? 'Creating…' : 'Create link'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Links expire after 7 days. Share the link — no email needed.</p>
          </div>
        </section>

      </div>
    </Layout>
  )
}
