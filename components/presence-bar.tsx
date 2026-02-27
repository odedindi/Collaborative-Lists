'use client'

import type { PresenceUser } from '@/lib/types'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface PresenceBarProps {
  users: PresenceUser[]
  currentEmail: string
}

export function PresenceBar({ users, currentEmail }: PresenceBarProps) {
  const others = users.filter((u) => u.email !== currentEmail)

  if (others.length === 0) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1">
        {others.map((user) => (
          <Tooltip key={user.email}>
            <TooltipTrigger asChild>
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-card"
                style={{ backgroundColor: user.color, color: '#fff' }}
              >
                {user.name?.[0]?.toUpperCase() || '?'}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
              <p className="text-xs">{user.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        <span className="ml-1 text-xs text-muted-foreground">
          {others.length === 1 ? '1 other here' : `${others.length} others here`}
        </span>
      </div>
    </TooltipProvider>
  )
}
