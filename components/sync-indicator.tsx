'use client'

import { Cloud, CloudOff, Loader2, Check } from 'lucide-react'
import type { SyncStatus } from '@/lib/use-list-sync'

export function SyncIndicator({ status }: { status: SyncStatus }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      {status === 'synced' && (
        <>
          <div className="relative">
            <Cloud className="h-4 w-4 text-success" />
            <Check className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-success" />
          </div>
          <span className="text-muted-foreground">Synced</span>
        </>
      )}
      {status === 'syncing' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-warning" />
          <span className="text-muted-foreground">Syncing</span>
        </>
      )}
      {status === 'offline' && (
        <>
          <CloudOff className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Offline</span>
        </>
      )}
    </div>
  )
}
