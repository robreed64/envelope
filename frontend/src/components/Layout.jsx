import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { getHouseholds } from '../api/households'
import { getMe } from '../api/user'
import SearchModal from './SearchModal'
import NotificationBell from './NotificationBell'
import SetupWizard from './SetupWizard'
import HelpPanel from './HelpPanel'

export default function Layout({ title, children }) {
  const { logout } = useAuth()
  const { pathname } = useLocation()
  const qc = useQueryClient()
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
  })

  const { data: envelopes = [] } = useQuery({
    queryKey: ['envelopes', household?.id],
    queryFn: () => import('../api/envelopes').then((m) => m.getEnvelopes(household.id)).then((r) => r.data),
    enabled: !!household,
  })

  // Auto-open wizard for new users with no envelopes
  useEffect(() => {
    if (me && !me.wizard_completed && !me.wizard_skipped && household && envelopes.length === 0) {
      setWizardOpen(true)
    }
  }, [me, household, envelopes.length])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      const tag = document.activeElement?.tagName
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        setHelpOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const navLink = (to, label) => {
    const active = pathname === to
    return (
      <Link
        to={to}
        className={`text-sm transition-colors ${
          active ? 'text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        {label}
      </Link>
    )
  }

  const householdId = household?.id

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-gray-900 font-bold text-lg tracking-tight">
            Envelope Budget
          </Link>
          <div className="hidden sm:flex items-center gap-5">
            {navLink('/', 'Dashboard')}
            {navLink('/income', 'Income')}
            {navLink('/recurring', 'Recurring')}
            {navLink('/reports', 'Reports')}
            {navLink('/import', 'Import')}
            {navLink('/accounts', 'Accounts')}
            {navLink('/payees', 'Payees')}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
              title="Search transactions (⌘K)"
            >
              <span className="text-base leading-none">⌕</span>
              <kbd className="hidden sm:inline text-xs bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
            {householdId && <NotificationBell householdId={householdId} />}
            {navLink('/data', 'Data')}
            {navLink('/settings', 'Settings')}
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign out
            </button>
            <button
              onClick={() => setHelpOpen((v) => !v)}
              className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 hover:bg-violet-200 hover:text-violet-800 text-sm font-bold transition-colors flex items-center justify-center ring-1 ring-violet-200"
              title="Help (?)"
            >
              ?
            </button>
          </div>
          <button
            className="sm:hidden flex flex-col gap-1 p-1"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <span className="block w-5 h-0.5 bg-gray-600" />
            <span className="block w-5 h-0.5 bg-gray-600" />
            <span className="block w-5 h-0.5 bg-gray-600" />
          </button>
        </div>
        {mobileOpen && (
          <div className="sm:hidden border-t border-gray-100 py-2 flex flex-col gap-1 px-4">
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/', 'Dashboard')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/income', 'Income')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/recurring', 'Recurring')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/reports', 'Reports')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/import', 'Import')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/accounts', 'Accounts')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/payees', 'Payees')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/data', 'Data')}</div>
            <div className="py-2" onClick={() => setMobileOpen(false)}>{navLink('/settings', 'Settings')}</div>
            <button
              onClick={() => { setSearchOpen(true); setMobileOpen(false) }}
              className="py-2 text-left text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Search
            </button>
            {householdId && (
              <div className="py-2">
                <NotificationBell householdId={householdId} />
              </div>
            )}
            <button
              onClick={() => { setHelpOpen(true); setMobileOpen(false) }}
              className="py-2 text-left text-sm text-violet-600 font-medium hover:text-violet-800 transition-colors"
            >
              Help (?)
            </button>
            <button
              onClick={logout}
              className="py-2 text-left text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {title && <h1 className="text-2xl font-bold text-gray-900 mb-5">{title}</h1>}
        {children}
      </main>

      {searchOpen && householdId && (
        <SearchModal householdId={householdId} onClose={() => setSearchOpen(false)} />
      )}

      {wizardOpen && householdId && (
        <SetupWizard
          householdId={householdId}
          onClose={() => { setWizardOpen(false); qc.invalidateQueries({ queryKey: ['me'] }) }}
        />
      )}

      {helpOpen && (
        <HelpPanel
          onClose={() => setHelpOpen(false)}
          onOpenWizard={() => setWizardOpen(true)}
        />
      )}
    </div>
  )
}
