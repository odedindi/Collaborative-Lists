import { Env, JWTPayload } from './types'

// ============================================
// Auth Utilities: Magic Links + JWT
// ============================================

const encoder = new TextEncoder()

async function getHmacKey(secret: string, usage: 'sign' | 'verify' = 'sign'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  )
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  return atob(padded)
}

// ---- Magic Link Token ----

export async function generateMagicLinkToken(email: string, secret: string): Promise<string> {
  const expiry = Date.now() + 15 * 60 * 1000 // 15 minutes
  const payload = `${email}:${expiry}`
  const key = await getHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const sigB64 = arrayBufferToBase64Url(sig)
  return base64UrlEncode(JSON.stringify({ email, expiry, sig: sigB64 }))
}

export async function verifyMagicLinkToken(token: string, secret: string): Promise<{ email: string } | null> {
  try {
    const decoded = JSON.parse(base64UrlDecode(token))
    const { email, expiry, sig } = decoded

    if (Date.now() > expiry) return null

    const payload = `${email}:${expiry}`
    const key = await getHmacKey(secret, 'verify')
    const sigBuffer = base64UrlToArrayBuffer(sig)
    const valid = await crypto.subtle.verify('HMAC', key, sigBuffer, encoder.encode(payload))

    return valid ? { email } : null
  } catch {
    return null
  }
}

// ---- JWT ----

export async function createJWT(payload: Omit<JWTPayload, 'iat'>, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }))
  const data = `${header}.${body}`
  const key = await getHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return `${data}.${arrayBufferToBase64Url(sig)}`
}

export async function verifyJWT(jwt: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null

    const [header, body, sigStr] = parts
    const data = `${header}.${body}`
    const key = await getHmacKey(secret, 'verify')
    const sigBuffer = base64UrlToArrayBuffer(sigStr)
    const valid = await crypto.subtle.verify('HMAC', key, sigBuffer, encoder.encode(data))

    if (!valid) return null

    const payload: JWTPayload = JSON.parse(base64UrlDecode(body))

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}

// ---- Email via MailChannels ----

export async function sendMagicLinkEmail(email: string, magicLink: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email }],
          },
        ],
        from: {
          email: 'noreply@collab-lists.app',
          name: 'Collaborative Lists',
        },
        subject: 'Your magic link to sign in',
        content: [
          {
            type: 'text/html',
            value: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #1a1a1a; margin-bottom: 16px;">Sign in to Collaborative Lists</h2>
                <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
                  Click the button below to sign in. This link expires in 15 minutes.
                </p>
                <a href="${magicLink}" style="display: inline-block; padding: 12px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
                  Sign in
                </a>
                <p style="color: #999; font-size: 13px; margin-top: 32px; line-height: 1.5;">
                  If you didn't request this email, you can safely ignore it.
                </p>
              </div>
            `,
          },
        ],
      }),
    })
    return response.ok || response.status === 202
  } catch {
    return false
  }
}

// ---- Helpers ----

export function isAllowedEmail(email: string, allowedEmails: string): boolean {
  const allowed = allowedEmails.split(',').map((e) => e.trim().toLowerCase())
  return allowed.includes(email.toLowerCase())
}

export function getCorsHeaders(origin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}
