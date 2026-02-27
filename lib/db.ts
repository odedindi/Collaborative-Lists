import Dexie, { type Table } from 'dexie'
import type { AuthSession, ListWithRole, Item } from './types'

// ============================================
// Local IndexedDB via Dexie.js
// ============================================

export interface LocalList {
  id: string
  name: string
  schema: any[]
  ownerEmail: string
  shares: any[]
  createdAt: number
  myRole: 'owner' | 'editor' | 'viewer'
}

export interface LocalItem {
  id: string
  listId: string
  fields: Record<string, any>
  checked: boolean
  updatedAt: number
  synced: boolean
}

export interface LocalAuth {
  key: string
  jwt: string
  email: string
  name: string
  color: string
}

class CollabListsDB extends Dexie {
  lists!: Table<LocalList, string>
  items!: Table<LocalItem, string>
  auth!: Table<LocalAuth, string>

  constructor() {
    super('collab-lists')
    this.version(1).stores({
      lists: 'id, ownerEmail, myRole',
      items: 'id, listId, synced, updatedAt',
      auth: 'key',
    })
  }
}

export const db = new CollabListsDB()

// Auth helpers
export async function getSession(): Promise<AuthSession | null> {
  const record = await db.auth.get('session')
  if (!record) return null
  return { jwt: record.jwt, email: record.email, name: record.name, color: record.color }
}

export async function setSession(session: AuthSession): Promise<void> {
  await db.auth.put({ key: 'session', ...session })
}

export async function clearSession(): Promise<void> {
  await db.auth.delete('session')
}

// List helpers
export async function getLocalLists(): Promise<LocalList[]> {
  return db.lists.toArray()
}

export async function setLocalLists(lists: ListWithRole[]): Promise<void> {
  await db.lists.clear()
  await db.lists.bulkPut(lists.map((l) => ({
    id: l.id,
    name: l.name,
    schema: l.schema,
    ownerEmail: l.ownerEmail,
    shares: l.shares,
    createdAt: l.createdAt,
    myRole: l.myRole,
  })))
}

export async function upsertLocalList(list: ListWithRole): Promise<void> {
  await db.lists.put({
    id: list.id,
    name: list.name,
    schema: list.schema,
    ownerEmail: list.ownerEmail,
    shares: list.shares,
    createdAt: list.createdAt,
    myRole: list.myRole,
  })
}

export async function removeLocalList(listId: string): Promise<void> {
  await db.lists.delete(listId)
  await db.items.where('listId').equals(listId).delete()
}

// Item helpers
export async function getLocalItems(listId: string): Promise<LocalItem[]> {
  return db.items.where('listId').equals(listId).toArray()
}

export async function upsertLocalItem(listId: string, item: Item, synced = true): Promise<void> {
  await db.items.put({
    id: item.id,
    listId,
    fields: item.fields,
    checked: item.checked,
    updatedAt: item.updatedAt,
    synced,
  })
}

export async function removeLocalItem(itemId: string): Promise<void> {
  await db.items.delete(itemId)
}

export async function getUnsyncedItems(listId: string): Promise<LocalItem[]> {
  return db.items.where({ listId, synced: 0 }).toArray()
}

export async function markItemSynced(itemId: string): Promise<void> {
  await db.items.update(itemId, { synced: true })
}
