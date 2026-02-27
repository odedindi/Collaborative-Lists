import { Env, JWTPayload, ListMeta, Share } from './types'
import {
  generateMagicLinkToken,
  verifyMagicLinkToken,
  createJWT,
  verifyJWT,
  sendMagicLinkEmail,
  isAllowedEmail,
  getCorsHeaders,
} from './auth'
export { ListDO } from './list-do'

// ============================================
// Main Worker — Routes + Auth + KV Management
// ============================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = request.headers.get('Origin') || undefined
    const cors = getCorsHeaders(origin)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // ---- Auth Routes (no JWT required) ----

    if (path === '/auth/magic-link' && request.method === 'POST') {
      return handleMagicLink(request, env, cors)
    }

    if (path === '/auth/verify' && request.method === 'GET') {
      return handleVerify(url, env, cors)
    }

    if (path === '/auth/complete' && request.method === 'POST') {
      return handleCompleteAuth(request, env, cors)
    }

    // ---- Protected Routes (JWT required) ----

    const user = await authenticateRequest(request, url, env)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // --- Lists ---
    if (path === '/lists' && request.method === 'GET') {
      return handleGetLists(user, env, cors)
    }

    if (path === '/lists' && request.method === 'POST') {
      return handleCreateList(request, user, env, cors)
    }

    // --- Single List Operations ---
    const listMatch = path.match(/^\/list\/([^/]+)$/)
    if (listMatch) {
      const listId = listMatch[1]
      if (request.method === 'GET') return handleGetList(listId, user, env, cors)
      if (request.method === 'DELETE') return handleDeleteList(listId, user, env, cors)
    }

    // Schema update
    const schemaMatch = path.match(/^\/list\/([^/]+)\/schema$/)
    if (schemaMatch && request.method === 'PATCH') {
      return handleUpdateSchema(schemaMatch[1], request, user, env, cors)
    }

    // Items
    const itemAddMatch = path.match(/^\/list\/([^/]+)\/item$/)
    if (itemAddMatch && request.method === 'POST') {
      return handleAddItem(itemAddMatch[1], request, user, env, cors)
    }

    const itemDeleteMatch = path.match(/^\/list\/([^/]+)\/item\/([^/]+)$/)
    if (itemDeleteMatch && request.method === 'DELETE') {
      return handleDeleteItem(itemDeleteMatch[1], itemDeleteMatch[2], user, env, cors)
    }

    const itemUpdateMatch = path.match(/^\/list\/([^/]+)\/item\/([^/]+)$/)
    if (itemUpdateMatch && request.method === 'PATCH') {
      return handleUpdateItem(itemUpdateMatch[1], itemUpdateMatch[2], request, user, env, cors)
    }

    // Clear done
    const clearDoneMatch = path.match(/^\/list\/([^/]+)\/clear-done$/)
    if (clearDoneMatch && request.method === 'POST') {
      return handleClearDone(clearDoneMatch[1], user, env, cors)
    }

    // --- Shares ---
    const sharesMatch = path.match(/^\/list\/([^/]+)\/shares$/)
    if (sharesMatch) {
      if (request.method === 'GET') return handleGetShares(sharesMatch[1], user, env, cors)
      if (request.method === 'POST') return handleAddShare(sharesMatch[1], request, user, env, cors)
    }

    const shareModMatch = path.match(/^\/list\/([^/]+)\/shares\/(.+)$/)
    if (shareModMatch) {
      if (request.method === 'PATCH') return handleUpdateShare(shareModMatch[1], shareModMatch[2], request, user, env, cors)
      if (request.method === 'DELETE') return handleRemoveShare(shareModMatch[1], shareModMatch[2], user, env, cors)
    }

    // --- WebSocket ---
    const wsMatch = path.match(/^\/list\/([^/]+)\/ws$/)
    if (wsMatch) {
      return handleWebSocket(wsMatch[1], request, user, env, cors)
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  },
}

// ============================================
// Auth Handlers
// ============================================

async function authenticateRequest(request: Request, url: URL, env: Env): Promise<JWTPayload | null> {
  // Check Authorization header first
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    return verifyJWT(token, env.APP_SECRET)
  }
  // Check query param (for WebSocket)
  const tokenParam = url.searchParams.get('token')
  if (tokenParam) {
    return verifyJWT(tokenParam, env.APP_SECRET)
  }
  return null
}

async function handleMagicLink(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const { email } = await request.json() as { email: string }

  if (!email || !isAllowedEmail(email, env.ALLOWED_EMAILS)) {
    return new Response(JSON.stringify({ error: 'Email not allowed' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const token = await generateMagicLinkToken(email.toLowerCase(), env.MAGIC_LINK_SECRET)
  const frontendUrl = env.FRONTEND_URL || 'https://your-app.pages.dev'
  const magicLink = `${frontendUrl}/auth/verify?token=${token}&email=${encodeURIComponent(email.toLowerCase())}`

  await sendMagicLinkEmail(email.toLowerCase(), magicLink)

  return new Response(JSON.stringify({ ok: true, message: 'Magic link sent' }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function handleVerify(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const token = url.searchParams.get('token')
  const email = url.searchParams.get('email')

  if (!token || !email) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const result = await verifyMagicLinkToken(token, env.MAGIC_LINK_SECRET)
  if (!result || result.email !== email.toLowerCase()) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Check if user has an existing profile
  const profile = await env.LISTS_INDEX.get(`user:${email.toLowerCase()}`)
  if (profile) {
    const parsed = JSON.parse(profile) as { name: string; color: string }
    const jwt = await createJWT(
      { email: email.toLowerCase(), name: parsed.name, color: parsed.color, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 },
      env.APP_SECRET
    )
    return new Response(JSON.stringify({ ok: true, jwt, email: email.toLowerCase(), name: parsed.name, color: parsed.color, needsOnboarding: false }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // New user — needs onboarding
  // Issue a temporary token to complete onboarding
  const tempJwt = await createJWT(
    { email: email.toLowerCase(), name: '', color: '', exp: Math.floor(Date.now() / 1000) + 10 * 60 },
    env.APP_SECRET
  )

  return new Response(JSON.stringify({ ok: true, tempJwt, email: email.toLowerCase(), needsOnboarding: true }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function handleCompleteAuth(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const tempPayload = await verifyJWT(authHeader.slice(7), env.APP_SECRET)
  if (!tempPayload) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const { name, color } = await request.json() as { name: string; color: string }

  // Store user profile
  await env.LISTS_INDEX.put(`user:${tempPayload.email}`, JSON.stringify({ name, color }))

  // Issue full JWT
  const jwt = await createJWT(
    { email: tempPayload.email, name, color, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 },
    env.APP_SECRET
  )

  return new Response(JSON.stringify({ ok: true, jwt, email: tempPayload.email, name, color }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ============================================
// List Handlers
// ============================================

async function getListMeta(listId: string, env: Env): Promise<ListMeta | null> {
  const raw = await env.LISTS_INDEX.get(`list:${listId}`)
  return raw ? JSON.parse(raw) : null
}

function getUserRole(user: JWTPayload, list: ListMeta): 'owner' | 'editor' | 'viewer' | null {
  if (list.ownerEmail === user.email) return 'owner'
  const share = list.shares.find((s) => s.email === user.email)
  if (share) return share.role
  return null
}

async function handleGetLists(user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  // Get user's list index
  const userListsRaw = await env.LISTS_INDEX.get(`user-lists:${user.email}`)
  const userListIds: string[] = userListsRaw ? JSON.parse(userListsRaw) : []

  const lists = []
  for (const listId of userListIds) {
    const meta = await getListMeta(listId, env)
    if (meta) {
      const role = getUserRole(user, meta)
      if (role) {
        lists.push({ ...meta, myRole: role })
      }
    }
  }

  return new Response(JSON.stringify(lists), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function handleCreateList(request: Request, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const { name, schema } = await request.json() as { name: string; schema: any[] }
  const id = crypto.randomUUID()
  const meta: ListMeta = {
    id,
    name,
    schema,
    createdAt: Date.now(),
    ownerEmail: user.email,
    shares: [],
  }

  // Store in KV
  await env.LISTS_INDEX.put(`list:${id}`, JSON.stringify(meta))

  // Add to user's list index
  await addListToUserIndex(user.email, id, env)

  // Initialize the DO
  const doId = env.SHOPPING_LIST.idFromName(id)
  const stub = env.SHOPPING_LIST.get(doId)
  await stub.fetch(new Request('https://do/init', {
    method: 'POST',
    body: JSON.stringify(meta),
  }))

  return new Response(JSON.stringify({ ...meta, myRole: 'owner' }), {
    status: 201,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function handleGetList(listId: string, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const role = getUserRole(user, meta)
  if (!role) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  // Get items from DO
  const doId = env.SHOPPING_LIST.idFromName(listId)
  const stub = env.SHOPPING_LIST.get(doId)
  const resp = await stub.fetch(new Request('https://do/items'))
  const data = await resp.json()

  return new Response(JSON.stringify({ ...meta, ...data, myRole: role }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function handleDeleteList(listId: string, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (meta.ownerEmail !== user.email) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  await env.LISTS_INDEX.delete(`list:${listId}`)
  await removeListFromUserIndex(user.email, listId, env)

  // Remove from shared users' indices too
  for (const share of meta.shares) {
    await removeListFromUserIndex(share.email, listId, env)
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handleUpdateSchema(listId: string, request: Request, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const role = getUserRole(user, meta)
  if (!role || role === 'viewer') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const { schema } = await request.json() as { schema: any[] }

  // Update in DO
  const doId = env.SHOPPING_LIST.idFromName(listId)
  const stub = env.SHOPPING_LIST.get(doId)
  await stub.fetch(new Request('https://do/schema', {
    method: 'PATCH',
    body: JSON.stringify({ schema }),
  }))

  // Update meta in KV
  meta.schema = schema
  await env.LISTS_INDEX.put(`list:${listId}`, JSON.stringify(meta))

  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handleAddItem(listId: string, request: Request, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const role = getUserRole(user, meta)
  if (!role || role === 'viewer') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const item = await request.json()
  const doId = env.SHOPPING_LIST.idFromName(listId)
  const stub = env.SHOPPING_LIST.get(doId)
  const resp = await stub.fetch(new Request('https://do/item', {
    method: 'POST',
    body: JSON.stringify(item),
  }))

  const result = await resp.json()
  return new Response(JSON.stringify(result), {
    status: 201,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function handleDeleteItem(listId: string, itemId: string, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const role = getUserRole(user, meta)
  if (!role || role === 'viewer') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const doId = env.SHOPPING_LIST.idFromName(listId)
  const stub = env.SHOPPING_LIST.get(doId)
  await stub.fetch(new Request(`https://do/item/${itemId}`, { method: 'DELETE' }))

  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handleUpdateItem(listId: string, itemId: string, request: Request, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const role = getUserRole(user, meta)
  if (!role || role === 'viewer') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const updates = await request.json()
  const doId = env.SHOPPING_LIST.idFromName(listId)
  const stub = env.SHOPPING_LIST.get(doId)
  const resp = await stub.fetch(new Request(`https://do/item/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }))

  const result = await resp.json()
  return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handleClearDone(listId: string, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const role = getUserRole(user, meta)
  if (!role || role === 'viewer') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const doId = env.SHOPPING_LIST.idFromName(listId)
  const stub = env.SHOPPING_LIST.get(doId)
  const resp = await stub.fetch(new Request('https://do/clear-done', { method: 'POST' }))
  const result = await resp.json()

  return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

// ============================================
// Share Handlers
// ============================================

async function handleGetShares(listId: string, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (meta.ownerEmail !== user.email) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  // Enrich shares with user names
  const enriched = await Promise.all(meta.shares.map(async (s) => {
    const profile = await env.LISTS_INDEX.get(`user:${s.email}`)
    if (profile) {
      const p = JSON.parse(profile)
      return { ...s, name: p.name, color: p.color }
    }
    return s
  }))

  return new Response(JSON.stringify(enriched), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handleAddShare(listId: string, request: Request, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (meta.ownerEmail !== user.email) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const { email, role } = await request.json() as { email: string; role: 'viewer' | 'editor' }

  if (!isAllowedEmail(email, env.ALLOWED_EMAILS)) {
    return new Response(JSON.stringify({ error: 'Email not in allowed list' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  if (email.toLowerCase() === user.email) {
    return new Response(JSON.stringify({ error: 'Cannot share with yourself' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // Check if already shared
  if (meta.shares.some((s) => s.email === email.toLowerCase())) {
    return new Response(JSON.stringify({ error: 'Already shared with this user' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  meta.shares.push({ email: email.toLowerCase(), role })
  await env.LISTS_INDEX.put(`list:${listId}`, JSON.stringify(meta))
  await addListToUserIndex(email.toLowerCase(), listId, env)

  return new Response(JSON.stringify({ ok: true, shares: meta.shares }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handleUpdateShare(listId: string, targetEmail: string, request: Request, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (meta.ownerEmail !== user.email) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const { role } = await request.json() as { role: 'viewer' | 'editor' }
  const decodedEmail = decodeURIComponent(targetEmail).toLowerCase()

  const share = meta.shares.find((s) => s.email === decodedEmail)
  if (!share) return new Response(JSON.stringify({ error: 'Share not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  share.role = role
  await env.LISTS_INDEX.put(`list:${listId}`, JSON.stringify(meta))

  return new Response(JSON.stringify({ ok: true, shares: meta.shares }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handleRemoveShare(listId: string, targetEmail: string, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (meta.ownerEmail !== user.email) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  const decodedEmail = decodeURIComponent(targetEmail).toLowerCase()
  meta.shares = meta.shares.filter((s) => s.email !== decodedEmail)
  await env.LISTS_INDEX.put(`list:${listId}`, JSON.stringify(meta))
  await removeListFromUserIndex(decodedEmail, listId, env)

  return new Response(JSON.stringify({ ok: true, shares: meta.shares }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

// ============================================
// WebSocket Handler
// ============================================

async function handleWebSocket(listId: string, request: Request, user: JWTPayload, env: Env, cors: Record<string, string>): Promise<Response> {
  const meta = await getListMeta(listId, env)
  if (!meta) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const role = getUserRole(user, meta)
  if (!role) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

  // Forward to DO with user info
  const doId = env.SHOPPING_LIST.idFromName(listId)
  const stub = env.SHOPPING_LIST.get(doId)

  const wsUrl = new URL(request.url)
  wsUrl.searchParams.set('email', user.email)
  wsUrl.searchParams.set('name', user.name)
  wsUrl.searchParams.set('color', user.color)
  wsUrl.searchParams.set('role', role)

  return stub.fetch(new Request(wsUrl.toString(), {
    headers: request.headers,
  }))
}

// ============================================
// KV Index Helpers
// ============================================

async function addListToUserIndex(email: string, listId: string, env: Env) {
  const raw = await env.LISTS_INDEX.get(`user-lists:${email}`)
  const ids: string[] = raw ? JSON.parse(raw) : []
  if (!ids.includes(listId)) {
    ids.push(listId)
    await env.LISTS_INDEX.put(`user-lists:${email}`, JSON.stringify(ids))
  }
}

async function removeListFromUserIndex(email: string, listId: string, env: Env) {
  const raw = await env.LISTS_INDEX.get(`user-lists:${email}`)
  if (!raw) return
  const ids: string[] = JSON.parse(raw)
  const filtered = ids.filter((id) => id !== listId)
  await env.LISTS_INDEX.put(`user-lists:${email}`, JSON.stringify(filtered))
}
