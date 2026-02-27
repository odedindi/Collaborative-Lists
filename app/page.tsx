'use client'

import { AuthProvider, useAuth } from '@/lib/auth-context'
import { LoginScreen } from '@/components/login-screen'
import { OnboardingScreen } from '@/components/onboarding-screen'
import { AppShell } from '@/components/app-shell'

function AppContent() {
  const { auth } = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (auth.status === 'unauthenticated') {
    return <LoginScreen />
  }

  return <AppShell />
}

export default function Page() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
