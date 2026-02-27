'use client'

import { useState } from 'react'
import type { ListWithRole } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { deleteList } from '@/lib/api'
import { removeLocalList } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  ListChecks,
  Users,
  Crown,
  Pencil,
  Eye,
  MoreHorizontal,
  Trash2,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ListSidebarProps {
  lists: ListWithRole[]
  activeListId: string | null
  onSelectList: (list: ListWithRole) => void
  onNewList: () => void
  onListDeleted: (listId: string) => void
}

export function ListSidebar({
  lists,
  activeListId,
  onSelectList,
  onNewList,
  onListDeleted,
}: ListSidebarProps) {
  const { auth, logout } = useAuth()
  const [deleting, setDeleting] = useState<string | null>(null)

  const ownedLists = lists.filter((l) => l.myRole === 'owner')
  const sharedLists = lists.filter((l) => l.myRole !== 'owner')

  const userName = auth.status === 'authenticated' ? auth.session.name : ''
  const userColor = auth.status === 'authenticated' ? auth.session.color : '#3B82F6'
  const userEmail = auth.status === 'authenticated' ? auth.session.email : ''

  async function handleDelete(listId: string) {
    setDeleting(listId)
    try {
      await deleteList(listId)
      await removeLocalList(listId)
      onListDeleted(listId)
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  const roleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-3 w-3 text-primary" />
      case 'editor': return <Pencil className="h-3 w-3 text-accent" />
      case 'viewer': return <Eye className="h-3 w-3 text-muted-foreground" />
      default: return null
    }
  }

  function renderListItem(list: ListWithRole) {
    const active = list.id === activeListId
    return (
      <div
        key={list.id}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-sidebar-foreground hover:bg-sidebar-accent'
        )}
        onClick={() => onSelectList(list)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onSelectList(list) }}
      >
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          active ? 'bg-primary text-primary-foreground' : 'bg-sidebar-accent text-sidebar-accent-foreground'
        )}>
          <ListChecks className="h-4 w-4" />
        </div>
        <div className="flex flex-1 flex-col">
          <span className={cn('text-sm font-medium leading-tight', active && 'text-primary')}>
            {list.name}
          </span>
          <div className="flex items-center gap-1">
            {roleIcon(list.myRole)}
            {list.myRole !== 'owner' && (
              <span className="text-[10px] text-muted-foreground">
                {list.ownerEmail}
              </span>
            )}
          </div>
        </div>
        {list.shares.length > 0 && (
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {list.myRole === 'owner' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">List options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(list.id)
                }}
                disabled={deleting === list.id}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      {/* User header */}
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
          style={{ backgroundColor: userColor, color: '#fff' }}
        >
          {userName?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground">{userName}</span>
          <span className="text-xs text-muted-foreground">{userEmail}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Log out</span>
        </Button>
      </div>

      {/* New list button */}
      <div className="px-3 py-3">
        <Button
          onClick={onNewList}
          className="w-full gap-2 bg-primary text-primary-foreground"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New list
        </Button>
      </div>

      {/* Lists */}
      <ScrollArea className="flex-1 px-2">
        {ownedLists.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 px-3 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                My lists
              </span>
            </div>
            {ownedLists.map(renderListItem)}
          </div>
        )}

        {sharedLists.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 px-3 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Shared with me
              </span>
            </div>
            {sharedLists.map(renderListItem)}
          </div>
        )}

        {lists.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ListChecks className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No lists yet</p>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
