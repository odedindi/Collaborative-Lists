'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getSession, setSession, clearSession } from './db'
import type { AuthSession } from './types'

// ============================================
// Auth Context — manages JWT session
// ============================================

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: AuthSession }

interface AuthContextValue {
  auth: AuthState
  login: (session: AuthSession) => Promise<void>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  const refreshAuth = useCallback(async () => {
    try {
      const session = await getSession()
      if (session && session.jwt && session.name) {
        setAuth({ status: 'authenticated', session })
      } else {
        setAuth({ status: 'unauthenticated' })
      }
    } catch {
      setAuth({ status: 'unauthenticated' })
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  const login = useCallback(async (session: AuthSession) => {
    await setSession(session)
    setAuth({ status: 'authenticated', session })
  }, [])

  const logout = useCallback(async () => {
    await clearSession()
    setAuth({ status: 'unauthenticated' })
  }, [])

  return (
    <AuthContext.Provider value={{ auth, login, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
