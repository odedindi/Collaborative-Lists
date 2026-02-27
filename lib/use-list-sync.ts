'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getWebSocketUrl } from './api'
import { getSession, upsertLocalItem, removeLocalItem, getLocalItems } from './db'
import type { Item, PresenceUser, WSMessage, Field } from './types'

// ============================================
// Real-time sync hook — WebSocket + offline queue
// ============================================

export type SyncStatus = 'synced' | 'syncing' | 'offline'

interface UseListSyncOptions {
  listId: string
  onItemsChanged?: (items: Item[]) => void
  onItemAdded?: (item: Item) => void
  onItemUpdated?: (item: Item) => void
  onItemDeleted?: (itemId: string) => void
  onPresenceChanged?: (users: PresenceUser[]) => void
  onSchemaChanged?: (schema: Field[]) => void
}

export function useListSync({
  listId,
  onItemsChanged,
  onItemAdded,
  onItemUpdated,
  onItemDeleted,
  onPresenceChanged,
  onSchemaChanged,
}: UseListSyncOptions) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline')
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)

  const connect = useCallback(async () => {
    const session = await getSession()
    if (!session?.jwt) return

    const wsUrl = getWebSocketUrl(listId, session.jwt)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      setSyncStatus('syncing')

      ws.onopen = () => {
        if (mountedRef.current) setSyncStatus('synced')
      }

      ws.onmessage = (event) => {
        try {
          if (event.data instanceof Blob) {
            // Binary CRDT update — handled by Yjs provider separately
            return
          }

          const msg: WSMessage = JSON.parse(event.data)

          switch (msg.type) {
            case 'items-changed':
              onItemsChanged?.(msg.items)
              // Persist to local DB
              msg.items.forEach((item) => {
                upsertLocalItem(listId, item, true)
              })
              break
            case 'item-added':
              onItemAdded?.(msg.item)
              upsertLocalItem(listId, msg.item, true)
              break
            case 'item-updated':
              onItemUpdated?.(msg.item)
              upsertLocalItem(listId, msg.item, true)
              break
            case 'item-deleted':
              onItemDeleted?.(msg.itemId)
              removeLocalItem(msg.itemId)
              break
            case 'presence':
              setPresence(msg.users)
              onPresenceChanged?.(msg.users)
              break
            case 'schema-changed':
              onSchemaChanged?.(msg.schema)
              break
            case 'error':
              console.warn('[Sync] Server error:', msg.message)
              break
          }
        } catch (e) {
          console.error('[Sync] Message parse error:', e)
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        if (mountedRef.current) {
          setSyncStatus('offline')
          // Reconnect after 2 seconds
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connect()
          }, 2000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      if (mountedRef.current) setSyncStatus('offline')
    }
  }, [listId, onItemsChanged, onItemAdded, onItemUpdated, onItemDeleted, onPresenceChanged, onSchemaChanged])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendMessage = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  return {
    syncStatus,
    presence,
    sendMessage,
    sendBinary,
    ws: wsRef,
  }
}
