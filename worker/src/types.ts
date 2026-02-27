// Worker-side types

export interface Env {
  MAGIC_LINK_SECRET: string
  APP_SECRET: string
  ALLOWED_EMAILS: string
  LISTS_INDEX: KVNamespace
  SHOPPING_LIST: DurableObjectNamespace
  FRONTEND_URL: string
}

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

export type JWTPayload = {
  email: string
  name: string
  color: string
  exp: number
  iat: number
}

export type PresenceUser = {
  email: string
  name: string
  color: string
}
