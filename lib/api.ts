import { getSession } from './db'
import type { ListWithRole, Item, Field, Share } from './types'

// ============================================
// API Client — communicates with CF Worker
// ============================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.jwt) {
    headers['Authorization'] = `Bearer ${session.jwt}`
  }
  return headers
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// Auth
export async function sendMagicLink(email: string): Promise<{ ok: boolean }> {
  return request('/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function verifyMagicLink(token: string, email: string): Promise<{
  ok: boolean
  jwt?: string
  tempJwt?: string
  email: string
  name?: string
  color?: string
  needsOnboarding: boolean
}> {
  const res = await fetch(`${API_URL}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Verification failed' }))
    throw new Error(body.error || 'Verification failed')
  }
  return res.json()
}

export async function completeAuth(tempJwt: string, name: string, color: string): Promise<{
  ok: boolean
  jwt: string
  email: string
  name: string
  color: string
}> {
  const res = await fetch(`${API_URL}/auth/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tempJwt}`,
    },
    body: JSON.stringify({ name, color }),
  })
  if (!res.ok) throw new Error('Auth completion failed')
  return res.json()
}

// Lists
export async function fetchLists(): Promise<ListWithRole[]> {
  return request('/lists')
}

export async function createList(name: string, schema: Field[]): Promise<ListWithRole> {
  return request('/lists', {
    method: 'POST',
    body: JSON.stringify({ name, schema }),
  })
}

export async function fetchList(id: string): Promise<ListWithRole & { items: Item[] }> {
  return request(`/list/${id}`)
}

export async function deleteList(id: string): Promise<{ ok: boolean }> {
  return request(`/list/${id}`, { method: 'DELETE' })
}

export async function updateSchema(id: string, schema: Field[]): Promise<{ ok: boolean }> {
  return request(`/list/${id}/schema`, {
    method: 'PATCH',
    body: JSON.stringify({ schema }),
  })
}

// Items
export async function addItem(listId: string, item: Item): Promise<Item> {
  return request(`/list/${listId}/item`, {
    method: 'POST',
    body: JSON.stringify(item),
  })
}

export async function deleteItem(listId: string, itemId: string): Promise<{ ok: boolean }> {
  return request(`/list/${listId}/item/${itemId}`, { method: 'DELETE' })
}

export async function updateItem(listId: string, itemId: string, updates: Partial<Item>): Promise<Item> {
  return request(`/list/${listId}/item/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function clearDoneItems(listId: string): Promise<{ ok: boolean; cleared: number }> {
  return request(`/list/${listId}/clear-done`, { method: 'POST' })
}

// Shares
export async function fetchShares(listId: string): Promise<Share[]> {
  return request(`/list/${listId}/shares`)
}

export async function addShare(listId: string, email: string, role: 'viewer' | 'editor'): Promise<{ ok: boolean; shares: Share[] }> {
  return request(`/list/${listId}/shares`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
}

export async function updateShare(listId: string, email: string, role: 'viewer' | 'editor'): Promise<{ ok: boolean; shares: Share[] }> {
  return request(`/list/${listId}/shares/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export async function removeShare(listId: string, email: string): Promise<{ ok: boolean; shares: Share[] }> {
  return request(`/list/${listId}/shares/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  })
}

// WebSocket URL builder
export function getWebSocketUrl(listId: string, jwt: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws')
  return `${wsBase}/list/${listId}/ws?token=${jwt}`
}
