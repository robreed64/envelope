import { createContext, useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() =>
    localStorage.getItem('access_token') ? { token: localStorage.getItem('access_token') } : null
  )
  const navigate = useNavigate()

  const login = async (email, password) => {
    const { data } = await authApi.login(email, password)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    setUser({ token: data.access_token })
    navigate('/')
  }

  const register = async (email, password) => {
    const { data } = await authApi.register(email, password)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    setUser({ token: data.access_token })
    navigate('/')
  }

  const logout = async () => {
    const refresh = localStorage.getItem('refresh_token')
    if (refresh) await authApi.logout(refresh).catch(() => {})
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
    navigate('/login')
  }

  const setToken = (access_token, refresh_token) => {
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('refresh_token', refresh_token)
    setUser({ token: access_token })
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, setToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
