import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { getInvite, acceptInvite } from '../api/households'
import * as authApi from '../api/auth'

export default function Join() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user, setToken } = useAuth()

  const [mode, setMode] = useState('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInvite(token).then((r) => r.data),
  })

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: () => navigate('/'),
  })

  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    try {
      const fn = mode === 'login' ? authApi.login : authApi.register
      const { data } = await fn(email, password)
      setToken(data.access_token, data.refresh_token)
    } catch (err) {
      setAuthError(err.response?.data?.detail ?? 'Something went wrong')
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <span className="text-gray-900 font-bold text-lg tracking-tight">Envelope Budget</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
          {isLoading && (
            <div className="text-center text-gray-400 py-8">Loading invite…</div>
          )}

          {isError && (
            <div className="text-center">
              <p className="text-rose-600 font-medium mb-2">Invite not found</p>
              <p className="text-gray-500 text-sm">This link may have expired or been revoked.</p>
              <button onClick={() => navigate('/')} className="mt-4 text-indigo-600 text-sm hover:underline">
                Go to dashboard
              </button>
            </div>
          )}

          {invite && (invite.is_expired || invite.is_accepted) && (
            <div className="text-center">
              <p className="text-rose-600 font-medium mb-2">
                {invite.is_accepted ? 'Invite already used' : 'Invite expired'}
              </p>
              <p className="text-gray-500 text-sm">Ask the household owner for a new invite link.</p>
              <button onClick={() => navigate('/')} className="mt-4 text-indigo-600 text-sm hover:underline">
                Go to dashboard
              </button>
            </div>
          )}

          {invite && !invite.is_expired && !invite.is_accepted && (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 text-xl flex items-center justify-center mx-auto mb-3">
                  🏠
                </div>
                <h1 className="text-xl font-bold text-gray-900">You're invited</h1>
                <p className="text-gray-500 text-sm mt-1">
                  Join <span className="font-medium text-gray-700">{invite.household_name}</span> as a{' '}
                  <span className="font-medium text-gray-700 capitalize">{invite.role}</span>
                </p>
                {invite.invited_email && (
                  <p className="text-xs text-gray-400 mt-1">For {invite.invited_email}</p>
                )}
              </div>

              {user ? (
                <div className="space-y-3">
                  {acceptMutation.isError && (
                    <p className="text-rose-600 text-sm text-center">
                      {acceptMutation.error?.response?.data?.detail ?? 'Could not accept invite'}
                    </p>
                  )}
                  <button
                    onClick={() => acceptMutation.mutate()}
                    disabled={acceptMutation.isPending}
                    className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {acceptMutation.isPending ? 'Joining…' : `Join ${invite.household_name}`}
                  </button>
                  <button onClick={() => navigate('/')} className="w-full text-center text-sm text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>
                    {authError && <p className="text-rose-600 text-sm">{authError}</p>}
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {authLoading ? 'Loading…' : mode === 'login' ? 'Sign in & join' : 'Register & join'}
                    </button>
                  </form>
                  <p className="text-center text-sm text-gray-500 mt-5">
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    <button
                      onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setAuthError('') }}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      {mode === 'login' ? 'Register' : 'Sign in'}
                    </button>
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
