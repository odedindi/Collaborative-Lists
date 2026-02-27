'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { fetchLists, createList } from '@/lib/api'
import { getLocalLists, setLocalLists, upsertLocalList, removeLocalList } from '@/lib/db'
import type { ListWithRole, Field } from '@/lib/types'
import { ListSidebar } from '@/components/list-sidebar'
import { ListView } from '@/components/list-view'
import { SchemaBuilder } from '@/components/schema-builder'
import { Button } from '@/components/ui/button'
import { ListChecks, Plus, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppShell() {
  const { auth } = useAuth()
  const [lists, setLists] = useState<ListWithRole[]>([])
  const [activeList, setActiveList] = useState<ListWithRole | null>(null)
  const [showNewList, setShowNewList] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadLists = useCallback(async () => {
    // Load local first
    const local = await getLocalLists()
    if (local.length > 0) {
      setLists(local as ListWithRole[])
      setLoading(false)
    }

    // Fetch from server
    try {
      const remote = await fetchLists()
      setLists(remote)
      await setLocalLists(remote)
    } catch {
      // Stay with local data
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (auth.status === 'authenticated') {
      loadLists()
    }
  }, [auth.status, loadLists])

  const handleSelectList = useCallback((list: ListWithRole) => {
    setActiveList(list)
    setShowNewList(false)
    setSidebarOpen(false)
  }, [])

  const handleNewList = useCallback(() => {
    setShowNewList(true)
    setActiveList(null)
    setSidebarOpen(false)
  }, [])

  const handleCreateList = useCallback(async (name: string, schema: Field[]) => {
    const created = await createList(name, schema)
    await upsertLocalList(created)
    setLists((prev) => [...prev, created])
    setActiveList(created)
    setShowNewList(false)
  }, [])

  const handleListDeleted = useCallback((listId: string) => {
    setLists((prev) => prev.filter((l) => l.id !== listId))
    if (activeList?.id === listId) setActiveList(null)
  }, [activeList])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-200 md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <ListSidebar
          lists={lists}
          activeListId={activeList?.id || null}
          onSelectList={handleSelectList}
          onNewList={handleNewList}
          onListDeleted={handleListDeleted}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8 p-0"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Lists</span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {showNewList ? (
            <SchemaBuilder
              onSubmit={handleCreateList}
              onCancel={() => setShowNewList(false)}
            />
          ) : activeList ? (
            <ListView
              key={activeList.id}
              listMeta={activeList}
              onBack={() => { setActiveList(null); setSidebarOpen(true) }}
              onListUpdated={loadLists}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary">
                <ListChecks className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Welcome to Collaborative Lists</h2>
              <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
                Create shared lists for groceries, packing, gear, to-dos, and more. Collaborate in real time with your people.
              </p>
              <Button onClick={handleNewList} className="gap-2 bg-primary text-primary-foreground">
                <Plus className="h-4 w-4" />
                Create your first list
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
