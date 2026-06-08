import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import { getHouseholds } from '../api/households'
import { getPayeeAliases, getRawNotes, upsertPayeeAlias, deletePayeeAlias } from '../api/payees'

export default function Payees() {
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)   // { raw, draft } — edit existing alias
  const [adding, setAdding] = useState(null)      // { raw, draft } — alias an unaliased note
  const [newRaw, setNewRaw] = useState('')
  const [newAlias, setNewAlias] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data: households = [] } = useQuery({
    queryKey: ['households'],
    queryFn: () => getHouseholds().then((r) => r.data),
  })
  const household = households[0]

  const { data: aliases = [] } = useQuery({
    queryKey: ['payees', household?.id],
    queryFn: () => getPayeeAliases(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const { data: rawNotes = [] } = useQuery({
    queryKey: ['payee-notes', household?.id],
    queryFn: () => getRawNotes(household.id).then((r) => r.data),
    enabled: !!household,
  })

  const q = search.toLowerCase()
  const aliasedRaws = useMemo(() => new Set(aliases.map((a) => a.raw)), [aliases])

  const filteredAliases = useMemo(
    () => aliases.filter((a) => !q || a.raw.toLowerCase().includes(q) || a.alias.toLowerCase().includes(q)),
    [aliases, q],
  )

  const unaliasedNotes = useMemo(
    () => rawNotes.filter((n) => !aliasedRaws.has(n) && (!q || n.toLowerCase().includes(q))),
    [rawNotes, aliasedRaws, q],
  )

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payees', household.id] })
    qc.invalidateQueries({ queryKey: ['payee-notes', household.id] })
  }

  const upsertMutation = useMutation({
    mutationFn: ({ raw, alias }) => upsertPayeeAlias(household.id, raw, alias),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setAdding(null)
      setNewRaw('')
      setNewAlias('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (raw) => deletePayeeAlias(household.id, raw),
    onSuccess: () => { invalidate(); setConfirmDelete(null) },
  })

  const commitUpsert = (state) => {
    if (!state?.draft.trim()) return
    upsertMutation.mutate({ raw: state.raw, alias: state.draft.trim() })
  }

  const commitEdit = () => commitUpsert(editing)
  const commitAdd = () => commitUpsert(adding)

  const commitNew = () => {
    if (!newRaw.trim() || !newAlias.trim()) return
    upsertMutation.mutate({ raw: newRaw.trim(), alias: newAlias.trim() })
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payee Aliases</h1>
        <p className="text-gray-500 text-sm mt-1">
          Map raw bank descriptions to friendly display names
        </p>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search payees…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        {/* Existing aliases */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              Aliases
              {aliases.length > 0 && (
                <span className="ml-2 text-gray-400 font-normal">({filteredAliases.length})</span>
              )}
            </h2>
          </div>

          {filteredAliases.length === 0 && !newRaw ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              {aliases.length === 0 ? 'No aliases yet — add one below or click + on an unaliased payee.' : 'No matches.'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filteredAliases.map((a) => (
                <li key={a.raw} className="flex items-center gap-3 px-5 py-3 group">
                  <span className="flex-1 min-w-0 text-xs text-gray-400 truncate" title={a.raw}>
                    {a.raw}
                  </span>
                  <span className="text-gray-300 text-xs shrink-0">→</span>
                  {editing?.raw === a.raw ? (
                    <input
                      autoFocus
                      value={editing.draft}
                      onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      onBlur={commitEdit}
                      className="w-40 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <button
                      onClick={() => setEditing({ raw: a.raw, draft: a.alias })}
                      className="text-sm font-medium text-gray-800 hover:text-indigo-600 transition-colors w-40 text-left truncate"
                      title="Click to edit"
                    >
                      {a.alias}
                    </button>
                  )}
                  {confirmDelete === a.raw ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => deleteMutation.mutate(a.raw)}
                        className="text-xs bg-rose-500 text-white rounded px-2 py-0.5 hover:bg-rose-600"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(a.raw)}
                      className="text-gray-200 hover:text-rose-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100 text-sm"
                      title="Delete alias"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add new alias manually */}
          <div className="border-t border-gray-100 px-5 py-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Add alias manually</p>
            <div className="flex gap-2 items-center">
              <input
                value={newRaw}
                onChange={(e) => setNewRaw(e.target.value)}
                placeholder="Raw bank description"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                onKeyDown={(e) => { if (e.key === 'Enter') commitNew() }}
              />
              <span className="text-gray-300 text-sm shrink-0">→</span>
              <input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="Display name"
                className="w-40 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                onKeyDown={(e) => { if (e.key === 'Enter') commitNew() }}
              />
              <button
                onClick={commitNew}
                disabled={!newRaw.trim() || !newAlias.trim() || upsertMutation.isPending}
                className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </section>

        {/* Unaliased notes from transactions */}
        {(unaliasedNotes.length > 0 || (search && rawNotes.length > 0)) && (
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">
                From transactions
                <span className="ml-2 text-gray-400 font-normal">({unaliasedNotes.length} unaliased)</span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Distinct payee names from your imported transactions without an alias.
              </p>
            </div>

            {unaliasedNotes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">
                {search ? 'No unaliased matches.' : 'All transaction payees have aliases.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {unaliasedNotes.map((note) => (
                  <li key={note} className="flex items-center gap-3 px-5 py-2.5 group">
                    <span className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={note}>
                      {note}
                    </span>
                    {adding?.raw === note ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          autoFocus
                          value={adding.draft}
                          onChange={(e) => setAdding({ ...adding, draft: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitAdd()
                            if (e.key === 'Escape') setAdding(null)
                          }}
                          placeholder="Display name"
                          className="w-40 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <button
                          onClick={commitAdd}
                          disabled={!adding.draft.trim() || upsertMutation.isPending}
                          className="bg-indigo-600 text-white rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setAdding(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAdding({ raw: note, draft: '' })}
                        className="text-xs text-indigo-500 hover:text-indigo-700 font-medium shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        + Alias
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

      </div>
    </Layout>
  )
}
