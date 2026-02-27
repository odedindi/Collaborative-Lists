'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { fetchList, addItem, deleteItem, updateItem, clearDoneItems } from '@/lib/api'
import { upsertLocalItem, removeLocalItem, getLocalItems } from '@/lib/db'
import { useListSync, type SyncStatus } from '@/lib/use-list-sync'
import { useAuth } from '@/lib/auth-context'
import type { Item, Field, PresenceUser, ListWithRole } from '@/lib/types'
import { generateId } from '@/lib/types'
import { ListItemCard } from '@/components/list-item-card'
import { PresenceBar } from '@/components/presence-bar'
import { SyncIndicator } from '@/components/sync-indicator'
import { ShareModal } from '@/components/share-modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  Trash2,
  Share2,
  ArrowLeft,
  Eye,
  Pencil,
  Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ListViewProps {
  listMeta: ListWithRole
  onBack: () => void
  onListUpdated?: () => void
}

export function ListView({ listMeta, onBack, onListUpdated }: ListViewProps) {
  const { auth } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [schema, setSchema] = useState<Field[]>(listMeta.schema)
  const [showShareModal, setShowShareModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const isViewer = listMeta.myRole === 'viewer'
  const isOwner = listMeta.myRole === 'owner'
  const currentEmail = auth.status === 'authenticated' ? auth.session.email : ''

  // Real-time sync
  const {
    syncStatus,
    presence,
    sendMessage,
  } = useListSync({
    listId: listMeta.id,
    onItemsChanged: useCallback((newItems: Item[]) => {
      setItems(newItems)
    }, []),
    onItemAdded: useCallback((item: Item) => {
      setItems((prev) => {
        if (prev.some((p) => p.id === item.id)) return prev
        return [...prev, item]
      })
    }, []),
    onItemUpdated: useCallback((item: Item) => {
      setItems((prev) => prev.map((p) => (p.id === item.id ? item : p)))
    }, []),
    onItemDeleted: useCallback((itemId: string) => {
      setItems((prev) => prev.filter((p) => p.id !== itemId))
    }, []),
    onSchemaChanged: useCallback((newSchema: Field[]) => {
      setSchema(newSchema)
    }, []),
  })

  // Initial load from local DB then fetch from server
  useEffect(() => {
    let cancelled = false
    async function load() {
      // Load local first
      const local = await getLocalItems(listMeta.id)
      if (!cancelled && local.length > 0) {
        setItems(local.map((li) => ({
          id: li.id,
          fields: li.fields,
          checked: li.checked,
          updatedAt: li.updatedAt,
        })))
        setLoading(false)
      }

      // Then fetch from server
      try {
        const data = await fetchList(listMeta.id)
        if (!cancelled) {
          setItems(data.items || [])
          setSchema(data.schema || listMeta.schema)
          setLoading(false)
          // Persist to local
          for (const item of data.items || []) {
            await upsertLocalItem(listMeta.id, item, true)
          }
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [listMeta.id, listMeta.schema])

  // Split items into active and done
  const { activeItems, doneItems } = useMemo(() => {
    const active: Item[] = []
    const done: Item[] = []
    for (const item of items) {
      if (item.checked) done.push(item)
      else active.push(item)
    }
    return { activeItems: active, doneItems: done }
  }, [items])

  const handleAddItem = useCallback(async () => {
    const newItem: Item = {
      id: generateId(),
      fields: Object.fromEntries(schema.map((f) => [f.id, f.type === 'checkbox' ? false : f.type === 'number' ? null : ''])),
      checked: false,
      updatedAt: Date.now(),
    }
    setItems((prev) => [...prev, newItem])
    await upsertLocalItem(listMeta.id, newItem, false)
    try {
      await addItem(listMeta.id, newItem)
      await upsertLocalItem(listMeta.id, newItem, true)
    } catch {
      // Keep in local DB with synced: false
    }
  }, [schema, listMeta.id])

  const handleToggle = useCallback(async (itemId: string, checked: boolean) => {
    setItems((prev) => prev.map((p) => p.id === itemId ? { ...p, checked, updatedAt: Date.now() } : p))
    sendMessage({ type: 'item-toggle', itemId, checked })
    try {
      await updateItem(listMeta.id, itemId, { checked })
    } catch { /* offline — will sync later */ }
  }, [listMeta.id, sendMessage])

  const handleFieldChange = useCallback(async (itemId: string, fieldId: string, value: any) => {
    setItems((prev) => prev.map((p) => {
      if (p.id !== itemId) return p
      return { ...p, fields: { ...p.fields, [fieldId]: value }, updatedAt: Date.now() }
    }))
    sendMessage({ type: 'item-update-fields', itemId, fields: { [fieldId]: value } })
    try {
      const item = items.find((i) => i.id === itemId)
      if (item) {
        await updateItem(listMeta.id, itemId, { fields: { ...item.fields, [fieldId]: value } })
      }
    } catch { /* offline */ }
  }, [listMeta.id, items, sendMessage])

  const handleDeleteItem = useCallback(async (itemId: string) => {
    setItems((prev) => prev.filter((p) => p.id !== itemId))
    await removeLocalItem(itemId)
    try {
      await deleteItem(listMeta.id, itemId)
    } catch { /* offline */ }
  }, [listMeta.id])

  const handleClearDone = useCallback(async () => {
    const doneIds = items.filter((i) => i.checked).map((i) => i.id)
    setItems((prev) => prev.filter((p) => !p.checked))
    for (const id of doneIds) await removeLocalItem(id)
    try {
      await clearDoneItems(listMeta.id)
    } catch { /* offline */ }
  }, [listMeta.id, items])

  const roleBadge = (
    <Badge
      variant={isViewer ? 'secondary' : isOwner ? 'default' : 'outline'}
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wider',
        isViewer && 'bg-secondary text-secondary-foreground',
        isOwner && 'bg-primary text-primary-foreground',
        !isViewer && !isOwner && 'border-accent text-accent'
      )}
    >
      {isViewer && <><Eye className="mr-1 h-3 w-3" /> View only</>}
      {isOwner && <><Crown className="mr-1 h-3 w-3" /> Owner</>}
      {listMeta.myRole === 'editor' && <><Pencil className="mr-1 h-3 w-3" /> Editor</>}
    </Badge>
  )

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-8 w-8 p-0 text-muted-foreground md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-card-foreground">{listMeta.name}</h1>
            {roleBadge}
          </div>
          <div className="flex items-center gap-3">
            <PresenceBar users={presence} currentEmail={currentEmail} />
            <SyncIndicator status={syncStatus} />
          </div>
        </div>
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShareModal(true)}
            className="h-8 gap-1.5 text-xs"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
        )}
      </header>

      {/* Items */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-4">
          {loading && items.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading...
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Plus className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-foreground">No items yet</p>
              <p className="text-xs text-muted-foreground">
                {isViewer ? 'Items will appear here when added' : 'Tap the + button to add your first item'}
              </p>
            </div>
          )}

          {activeItems.map((item) => (
            <ListItemCard
              key={item.id}
              item={item}
              schema={schema}
              isViewer={isViewer}
              onToggle={handleToggle}
              onFieldChange={handleFieldChange}
              onDelete={handleDeleteItem}
            />
          ))}

          {doneItems.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Done ({doneItems.length})
                </span>
                {!isViewer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearDone}
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear done
                  </Button>
                )}
              </div>
              {doneItems.map((item) => (
                <ListItemCard
                  key={item.id}
                  item={item}
                  schema={schema}
                  isViewer={isViewer}
                  onToggle={handleToggle}
                  onFieldChange={handleFieldChange}
                  onDelete={handleDeleteItem}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* FAB to add items */}
      {!isViewer && (
        <div className="sticky bottom-0 flex justify-end p-4 pb-6">
          <Button
            onClick={handleAddItem}
            className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <Plus className="h-6 w-6" />
            <span className="sr-only">Add item</span>
          </Button>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          listId={listMeta.id}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  )
}
