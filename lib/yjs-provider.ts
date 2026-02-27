'use client'

import * as Y from 'yjs'
import { getWebSocketUrl } from './api'
import { getSession } from './db'
import type { PresenceUser } from './types'

/**
 * Custom Yjs WebSocket provider that:
 * - Connects to the Cloudflare Worker ListDO WebSocket endpoint
 * - Sends and receives binary Yjs updates (crdt-update messages)
 * - Also handles JSON presence/broadcast messages on the same socket
 * - Persists the Yjs doc state to IndexedDB
 */

const RECONNECT_INTERVAL = 2000

export class ListYjsProvider {
  doc: Y.Doc
  listId: string
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private jwt: string | null = null

  // Callbacks for JSON messages
  onPresence?: (users: PresenceUser[]) => void
  onJsonMessage?: (msg: any) => void
  onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void

  constructor(listId: string, doc: Y.Doc) {
    this.listId = listId
    this.doc = doc

    // Listen for local updates and send them to the server
    this.doc.on('update', this.handleDocUpdate)

    // Try to load saved state from IndexedDB
    this.loadFromIndexedDB()

    // Connect
    this.connect()
  }

  private handleDocUpdate = (update: Uint8Array, origin: any) => {
    // Only send updates originating from local user, not from remote
    if (origin === 'remote') return
    this.sendBinary(update)
  }

  private async loadFromIndexedDB() {
    try {
      const dbName = `yjs-${this.listId}`
      const request = indexedDB.open(dbName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('updates')) {
          db.createObjectStore('updates')
        }
      }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('updates', 'readonly')
        const store = tx.objectStore('updates')
        const getReq = store.get('state')
        getReq.onsuccess = () => {
          if (getReq.result) {
            Y.applyUpdate(this.doc, new Uint8Array(getReq.result), 'indexeddb')
          }
        }
      }
    } catch {
      // IndexedDB not available or error — proceed without saved state
    }
  }

  saveToIndexedDB() {
    try {
      const state = Y.encodeStateAsUpdate(this.doc)
      const dbName = `yjs-${this.listId}`
      const request = indexedDB.open(dbName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('updates')) {
          db.createObjectStore('updates')
        }
      }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('updates', 'readwrite')
        const store = tx.objectStore('updates')
        store.put(state.buffer, 'state')
      }
    } catch {
      // Ignore save errors
    }
  }

  async connect() {
    if (this.destroyed) return
    this.onStatusChange?.('connecting')

    const session = await getSession()
    if (!session?.jwt) return
    this.jwt = session.jwt

    const wsUrl = getWebSocketUrl(this.listId, session.jwt)

    try {
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      this.ws = ws

      ws.onopen = () => {
        if (this.destroyed) { ws.close(); return }
        this.onStatusChange?.('connected')

        // Send full state vector so the server can send us what we're missing
        const sv = Y.encodeStateVector(this.doc)
        // Prefix with a type byte: 0x01 = sync-step-1 (state vector)
        const msg = new Uint8Array(sv.length + 1)
        msg[0] = 0x01
        msg.set(sv, 1)
        ws.send(msg.buffer)
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Binary Yjs message
          const data = new Uint8Array(event.data)
          if (data.length === 0) return

          const messageType = data[0]
          const payload = data.slice(1)

          if (messageType === 0x02) {
            // sync-step-2 or update from server
            Y.applyUpdate(this.doc, payload, 'remote')
            this.saveToIndexedDB()
          } else if (messageType === 0x01) {
            // Server requesting our state based on their state vector
            const update = Y.encodeStateAsUpdate(this.doc, payload)
            const msg = new Uint8Array(update.length + 1)
            msg[0] = 0x02
            msg.set(update, 1)
            ws.send(msg.buffer)
          }
        } else {
          // JSON message — presence, items, etc.
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'presence') {
              this.onPresence?.(msg.users)
            }
            this.onJsonMessage?.(msg)
          } catch {
            // Ignore parse errors
          }
        }
      }

      ws.onclose = () => {
        this.ws = null
        this.onStatusChange?.('disconnected')
        if (!this.destroyed) {
          this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_INTERVAL)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      this.onStatusChange?.('disconnected')
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_INTERVAL)
      }
    }
  }

  sendBinary(update: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Prefix with type byte: 0x02 = update
      const msg = new Uint8Array(update.length + 1)
      msg[0] = 0x02
      msg.set(update, 1)
      this.ws.send(msg.buffer)
    }
  }

  sendJson(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  destroy() {
    this.destroyed = true
    this.doc.off('update', this.handleDocUpdate)
    this.saveToIndexedDB()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}
