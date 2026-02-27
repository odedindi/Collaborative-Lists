// ============================================
// Shared Types for Collaborative Lists App
// ============================================

export type Field = {
  id: string
  label: string
  type: 'text' | 'number' | 'checkbox' | 'select'
  options?: string[]
}

export type Item = {
  id: string
  fields: Record<string, any>
  checked: boolean
  updatedAt: number
}

export type Share = {
  email: string
  role: 'viewer' | 'editor'
  name?: string
  color?: string
}

export type ListMeta = {
  id: string
  name: string
  schema: Field[]
  createdAt: number
  ownerEmail: string
  shares: Share[]
}

export type ListWithRole = ListMeta & {
  myRole: 'owner' | 'editor' | 'viewer'
}

export type AuthSession = {
  jwt: string
  email: string
  name: string
  color: string
}

export type PresenceUser = {
  email: string
  name: string
  color: string
}

// WebSocket message types
export type WSMessage =
  | { type: 'crdt-update'; data: number[] }
  | { type: 'presence'; users: PresenceUser[] }
  | { type: 'items-changed'; items: Item[] }
  | { type: 'item-added'; item: Item }
  | { type: 'item-deleted'; itemId: string }
  | { type: 'item-updated'; item: Item }
  | { type: 'schema-changed'; schema: Field[] }
  | { type: 'error'; message: string }

// List templates
export const LIST_TEMPLATES: { name: string; schema: Field[] }[] = [
  {
    name: 'Grocery List',
    schema: [
      { id: 'name', label: 'Item', type: 'text' },
      { id: 'qty', label: 'Qty', type: 'number' },
      { id: 'category', label: 'Category', type: 'select', options: ['Produce', 'Dairy', 'Meat', 'Bakery', 'Frozen', 'Pantry', 'Beverages', 'Other'] },
    ],
  },
  {
    name: 'Packing List',
    schema: [
      { id: 'item', label: 'Item', type: 'text' },
      { id: 'category', label: 'Category', type: 'select', options: ['Clothes', 'Toiletries', 'Electronics', 'Documents', 'Misc'] },
    ],
  },
  {
    name: 'Gear List',
    schema: [
      { id: 'item', label: 'Item', type: 'text' },
      { id: 'weight', label: 'Weight (g)', type: 'number' },
      { id: 'essential', label: 'Essential', type: 'checkbox' },
    ],
  },
  {
    name: 'To-do',
    schema: [
      { id: 'task', label: 'Task', type: 'text' },
      { id: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'] },
    ],
  },
]

// Avatar colors
export const AVATAR_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F59E0B', '#6366F1', '#D946EF',
]

export function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

export function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}
