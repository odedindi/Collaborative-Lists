import { Env, Item, Field, JWTPayload, PresenceUser, ListMeta, Share } from './types'
import { getCorsHeaders } from './auth'

// ============================================
// ListDO — Durable Object (one per list)
// ============================================

interface ConnectedClient {
  ws: WebSocket
  user: PresenceUser
  role: 'owner' | 'editor' | 'viewer'
}

export class ListDO {
  private state: DurableObjectState
  private env: Env
  private clients: Map<string, ConnectedClient> = new Map()
  private items: Map<string, Item> = new Map()
  private schema: Field[] = []
  private listMeta: ListMeta | null = null
  private yjsDocState: Uint8Array | null = null
  private initialized = false

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  private async initialize() {
    if (this.initialized) return

    // Load items from storage
    const storedItems = await this.state.storage.get<Record<string, Item>>('items')
    if (storedItems) {
      for (const [id, item] of Object.entries(storedItems)) {
        this.items.set(id, item)
      }
    }

    // Load schema
    const storedSchema = await this.state.storage.get<Field[]>('schema')
    if (storedSchema) this.schema = storedSchema

    // Load list meta
    const storedMeta = await this.state.storage.get<ListMeta>('meta')
    if (storedMeta) this.listMeta = storedMeta

    // Load Yjs doc state
    const storedYjs = await this.state.storage.get<number[]>('yjsDoc')
    if (storedYjs) this.yjsDocState = new Uint8Array(storedYjs)

    this.initialized = true
  }

  private async saveItems() {
    const obj: Record<string, Item> = {}
    for (const [id, item] of this.items) obj[id] = item
    await this.state.storage.put('items', obj)
  }

  private async saveSchema() {
    await this.state.storage.put('schema', this.schema)
  }

  private async saveMeta() {
    if (this.listMeta) {
      await this.state.storage.put('meta', this.listMeta)
      // Also update KV index
      await this.env.LISTS_INDEX.put(`list:${this.listMeta.id}`, JSON.stringify(this.listMeta))
    }
  }

  private async saveYjsDoc() {
    if (this.yjsDocState) {
      await this.state.storage.put('yjsDoc', Array.from(this.yjsDocState))
    }
  }

  private broadcastPresence() {
    const users: PresenceUser[] = []
    const seen = new Set<string>()
    for (const client of this.clients.values()) {
      if (!seen.has(client.user.email)) {
        users.push(client.user)
        seen.add(client.user.email)
      }
    }
    this.broadcast(JSON.stringify({ type: 'presence', users }))
  }

  private broadcast(message: string | ArrayBuffer, excludeKey?: string) {
    for (const [key, client] of this.clients) {
      if (key === excludeKey) continue
      try {
        client.ws.send(message)
      } catch {
        this.clients.delete(key)
      }
    }
  }

  private broadcastToEditors(message: string | ArrayBuffer, excludeKey?: string) {
    for (const [key, client] of this.clients) {
      if (key === excludeKey) continue
      if (client.role === 'viewer') continue
      try {
        client.ws.send(message)
      } catch {
        this.clients.delete(key)
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize()

    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || undefined
    const cors = getCorsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request, cors)
    }

    const path = url.pathname

    // Initialize meta if passed
    if (request.method === 'POST' && path === '/init') {
      const meta: ListMeta = await request.json()
      this.listMeta = meta
      this.schema = meta.schema
      await this.saveMeta()
      await this.saveSchema()
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Get all items
    if (request.method === 'GET' && path === '/items') {
      const items = Array.from(this.items.values())
      return new Response(JSON.stringify({ schema: this.schema, items }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Add item
    if (request.method === 'POST' && path === '/item') {
      const item: Item = await request.json()
      this.items.set(item.id, item)
      await this.saveItems()
      this.broadcast(JSON.stringify({ type: 'item-added', item }))
      return new Response(JSON.stringify(item), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Update item
    if (request.method === 'PATCH' && path.startsWith('/item/')) {
      const itemId = path.split('/item/')[1]
      const existing = this.items.get(itemId)
      if (!existing) return new Response('Not found', { status: 404, headers: cors })
      const updates: Partial<Item> = await request.json()
      const updated = { ...existing, ...updates, updatedAt: Date.now() }
      this.items.set(itemId, updated)
      await this.saveItems()
      this.broadcast(JSON.stringify({ type: 'item-updated', item: updated }))
      return new Response(JSON.stringify(updated), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Delete item
    if (request.method === 'DELETE' && path.startsWith('/item/')) {
      const itemId = path.split('/item/')[1]
      this.items.delete(itemId)
      await this.saveItems()
      this.broadcast(JSON.stringify({ type: 'item-deleted', itemId }))
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Update schema
    if (request.method === 'PATCH' && path === '/schema') {
      const { schema }: { schema: Field[] } = await request.json()
      this.schema = schema
      if (this.listMeta) {
        this.listMeta.schema = schema
        await this.saveMeta()
      }
      await this.saveSchema()
      this.broadcast(JSON.stringify({ type: 'schema-changed', schema }))
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Clear done items
    if (request.method === 'POST' && path === '/clear-done') {
      const toDelete: string[] = []
      for (const [id, item] of this.items) {
        if (item.checked) toDelete.push(id)
      }
      for (const id of toDelete) {
        this.items.delete(id)
        this.broadcast(JSON.stringify({ type: 'item-deleted', itemId: id }))
      }
      await this.saveItems()
      return new Response(JSON.stringify({ ok: true, cleared: toDelete.length }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404, headers: cors })
  }

  private handleWebSocket(request: Request, cors: Record<string, string>): Response {
    const url = new URL(request.url)
    const userEmail = url.searchParams.get('email') || ''
    const userName = url.searchParams.get('name') || 'Anonymous'
    const userColor = url.searchParams.get('color') || '#3B82F6'
    const userRole = (url.searchParams.get('role') || 'viewer') as 'owner' | 'editor' | 'viewer'

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    const clientKey = `${userEmail}-${Date.now()}-${Math.random()}`

    this.state.acceptWebSocket(server)

    this.clients.set(clientKey, {
      ws: server,
      user: { email: userEmail, name: userName, color: userColor },
      role: userRole,
    })

    // Send current state
    server.send(JSON.stringify({
      type: 'items-changed',
      items: Array.from(this.items.values()),
    }))

    // Send current Yjs state if available
    if (this.yjsDocState && this.yjsDocState.length > 0) {
      server.send(JSON.stringify({
        type: 'crdt-sync',
        data: Array.from(this.yjsDocState),
      }))
    }

    // Broadcast presence update
    setTimeout(() => this.broadcastPresence(), 50)

    server.addEventListener('message', async (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          // Binary Yjs update
          if (userRole === 'viewer') return // Viewers can't send CRDT updates

          const update = new Uint8Array(event.data)
          // Merge with stored state
          if (this.yjsDocState) {
            // Simple concat — in production you'd use Y.mergeUpdates
            const merged = new Uint8Array(this.yjsDocState.length + update.length)
            merged.set(this.yjsDocState)
            merged.set(update, this.yjsDocState.length)
            this.yjsDocState = merged
          } else {
            this.yjsDocState = update
          }
          await this.saveYjsDoc()

          // Broadcast to all other clients
          for (const [key, c] of this.clients) {
            if (key === clientKey) continue
            try {
              c.ws.send(event.data)
            } catch {
              this.clients.delete(key)
            }
          }
          return
        }

        const msg = JSON.parse(event.data as string)

        if (msg.type === 'crdt-update') {
          if (userRole === 'viewer') {
            server.send(JSON.stringify({ type: 'error', message: 'View-only access' }))
            return
          }
          const update = new Uint8Array(msg.data)
          if (this.yjsDocState) {
            const merged = new Uint8Array(this.yjsDocState.length + update.length)
            merged.set(this.yjsDocState)
            merged.set(update, this.yjsDocState.length)
            this.yjsDocState = merged
          } else {
            this.yjsDocState = update
          }
          await this.saveYjsDoc()
          this.broadcast(JSON.stringify(msg), clientKey)
        }

        if (msg.type === 'item-toggle') {
          if (userRole === 'viewer') {
            server.send(JSON.stringify({ type: 'error', message: 'View-only access' }))
            return
          }
          const item = this.items.get(msg.itemId)
          if (item) {
            item.checked = msg.checked
            item.updatedAt = Date.now()
            this.items.set(msg.itemId, item)
            await this.saveItems()
            this.broadcast(JSON.stringify({ type: 'item-updated', item }))
          }
        }

        if (msg.type === 'item-update-fields') {
          if (userRole === 'viewer') {
            server.send(JSON.stringify({ type: 'error', message: 'View-only access' }))
            return
          }
          const item = this.items.get(msg.itemId)
          if (item) {
            item.fields = { ...item.fields, ...msg.fields }
            item.updatedAt = Date.now()
            this.items.set(msg.itemId, item)
            await this.saveItems()
            this.broadcast(JSON.stringify({ type: 'item-updated', item }), clientKey)
          }
        }
      } catch (e) {
        console.error('WS message error:', e)
      }
    })

    server.addEventListener('close', () => {
      this.clients.delete(clientKey)
      this.broadcastPresence()
    })

    server.addEventListener('error', () => {
      this.clients.delete(clientKey)
      this.broadcastPresence()
    })

    return new Response(null, { status: 101, webSocket: client })
  }
}
