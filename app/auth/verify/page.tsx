'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { verifyMagicLink } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { OnboardingScreen } from '@/components/onboarding-screen'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Suspense } from 'react'

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { login } = useAuth()
  const [status, setStatus] = useState<'loading' | 'onboarding' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const [tempJwt, setTempJwt] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const emailParam = searchParams.get('email')

    if (!token || !emailParam) {
      setStatus('error')
      setError('Missing verification parameters')
      return
    }

    verify(token, emailParam)
  }, [searchParams])

  async function verify(token: string, emailParam: string) {
    try {
      const result = await verifyMagicLink(token, emailParam)

      if (result.needsOnboarding) {
        setTempJwt(result.tempJwt!)
        setEmail(result.email)
        setStatus('onboarding')
      } else {
        await login({
          jwt: result.jwt!,
          email: result.email,
          name: result.name!,
          color: result.color!,
        })
        setStatus('success')
        setTimeout(() => router.push('/'), 1000)
      }
    } catch (err: any) {
      setStatus('error')
      setError(err.message || 'Verification failed')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md border-border">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <CardTitle className="text-lg text-card-foreground">Verifying your link...</CardTitle>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'onboarding') {
    return <OnboardingScreen tempJwt={tempJwt} email={email} />
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md border-border">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-lg text-card-foreground">{"You're signed in!"}</CardTitle>
            <p className="text-sm text-muted-foreground">Redirecting...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md border-border">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-lg text-card-foreground">Verification failed</CardTitle>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <AuthProvider>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }>
        <VerifyContent />
      </Suspense>
    </AuthProvider>
  )
}
