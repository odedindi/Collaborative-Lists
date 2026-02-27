'use client'

import { useState, useEffect } from 'react'
import { fetchShares, addShare, updateShare, removeShare } from '@/lib/api'
import type { Share } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserPlus, X, Loader2, Mail, Eye, Pencil } from 'lucide-react'

interface ShareModalProps {
  listId: string
  onClose: () => void
}

export function ShareModal({ listId, onClose }: ShareModalProps) {
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadShares()
  }, [listId])

  async function loadShares() {
    try {
      const data = await fetchShares(listId)
      setShares(data)
    } catch {
      setError('Failed to load shares')
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setError('')
    setInviting(true)

    try {
      const result = await addShare(listId, inviteEmail.trim().toLowerCase(), inviteRole)
      setShares(result.shares)
      setInviteEmail('')
    } catch (err: any) {
      setError(err.message || 'Failed to invite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(email: string, role: 'viewer' | 'editor') {
    try {
      const result = await updateShare(listId, email, role)
      setShares(result.shares)
    } catch (err: any) {
      setError(err.message || 'Failed to update role')
    }
  }

  async function handleRemove(email: string) {
    try {
      const result = await removeShare(listId, email)
      setShares(result.shares)
    } catch (err: any) {
      setError(err.message || 'Failed to remove share')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">Share this list</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Invite people by email. They must be in the allowed users list.
          </DialogDescription>
        </DialogHeader>

        {/* Invite form */}
        <form onSubmit={handleInvite} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="person@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-9 pl-9 text-sm bg-background text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'editor' | 'viewer')}>
              <SelectTrigger className="h-9 w-24 text-xs bg-background text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={inviting || !inviteEmail} className="h-9 gap-1 bg-primary text-primary-foreground">
              {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>

        {/* Current shares */}
        <div className="flex flex-col gap-1">
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && shares.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No shares yet. Invite someone above.
            </p>
          )}

          {shares.map((share) => (
            <div
              key={share.email}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-secondary/50"
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: share.color || '#6366F1',
                  color: '#fff',
                }}
              >
                {share.name?.[0]?.toUpperCase() || share.email[0].toUpperCase()}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-foreground">
                  {share.name || share.email}
                </span>
                {share.name && (
                  <span className="text-xs text-muted-foreground">{share.email}</span>
                )}
              </div>
              <Select
                value={share.role}
                onValueChange={(v) => handleRoleChange(share.email, v as 'viewer' | 'editor')}
              >
                <SelectTrigger className="h-7 w-24 text-xs bg-background text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">
                    <div className="flex items-center gap-1.5">
                      <Pencil className="h-3 w-3" /> Editor
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-3 w-3" /> Viewer
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(share.email)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Remove share</span>
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
