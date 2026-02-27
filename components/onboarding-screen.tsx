'use client'

import { useState } from 'react'
import { completeAuth } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { AVATAR_COLORS, getRandomColor } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Check, Loader2 } from 'lucide-react'

interface OnboardingScreenProps {
  tempJwt: string
  email: string
}

export function OnboardingScreen({ tempJwt, email }: OnboardingScreenProps) {
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [color, setColor] = useState(getRandomColor())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await completeAuth(tempJwt, name, color)
      await login({ jwt: result.jwt, email: result.email, name: result.name, color: result.color })
    } catch (err: any) {
      setError(err.message || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-card"
            style={{ backgroundColor: color }}
          >
            <span className="text-xl font-bold">{name ? name[0].toUpperCase() : '?'}</span>
          </div>
          <CardTitle className="text-xl font-bold text-card-foreground">Welcome! Set up your profile</CardTitle>
          <CardDescription className="text-muted-foreground">
            {"Signed in as "}
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-foreground">Display name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g. Marco"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="pl-10 h-11 bg-background border-input text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Avatar color</label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="relative h-8 w-8 rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  >
                    {color === c && (
                      <Check className="absolute inset-0 m-auto h-4 w-4 text-card" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={loading || !name} className="h-11 gap-2 bg-primary text-primary-foreground">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continue
                  <Check className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
