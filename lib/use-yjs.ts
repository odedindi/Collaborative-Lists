'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as Y from 'yjs'
import { ListYjsProvider } from './yjs-provider'
import type { PresenceUser } from './types'

/**
 * React hook to use Yjs collaborative editing for a list.
 * Creates a Y.Doc with a Y.Map for each item's text fields.
 * Returns the provider, doc, and helper functions.
 */

export type YjsStatus = 'connected' | 'disconnected' | 'connecting'

interface UseYjsOptions {
  listId: string
  enabled?: boolean
}

export function useYjs({ listId, enabled = true }: UseYjsOptions) {
  const [status, setStatus] = useState<YjsStatus>('disconnected')
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const docRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<ListYjsProvider | null>(null)

  useEffect(() => {
    if (!enabled) return

    const doc = new Y.Doc()
    docRef.current = doc

    const provider = new ListYjsProvider(listId, doc)
    providerRef.current = provider

    provider.onStatusChange = (s) => setStatus(s)
    provider.onPresence = (users) => setPresence(users)

    return () => {
      provider.destroy()
      doc.destroy()
      docRef.current = null
      providerRef.current = null
    }
  }, [listId, enabled])

  /**
   * Get or create a Y.Text for a specific item field.
   * Path: items -> itemId -> fieldId
   */
  const getYText = useCallback((itemId: string, fieldId: string): Y.Text | null => {
    const doc = docRef.current
    if (!doc) return null

    const itemsMap = doc.getMap('items')
    let itemMap = itemsMap.get(itemId) as Y.Map<any> | undefined
    if (!itemMap) {
      itemMap = new Y.Map()
      itemsMap.set(itemId, itemMap)
    }

    let text = itemMap.get(fieldId) as Y.Text | undefined
    if (!text) {
      text = new Y.Text()
      itemMap.set(fieldId, text)
    }

    return text
  }, [])

  /**
   * Send a JSON message through the WebSocket
   */
  const sendJson = useCallback((msg: any) => {
    providerRef.current?.sendJson(msg)
  }, [])

  return {
    doc: docRef.current,
    status,
    presence,
    getYText,
    sendJson,
  }
}
