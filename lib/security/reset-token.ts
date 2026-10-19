import { createHash, randomBytes } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

// The raw reset token never leaves the requester's browser except inside this httpOnly
// cookie. The database only stores its SHA-256 digest, so neither an API response, an
// admin screen nor a database read can hand someone else's token to an attacker.
export const RESET_COOKIE_NAME = 'tcnp_reset'
export const RESET_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

const RESET_COOKIE_PATH = '/api/auth/reset-password'

export function generateResetToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function readResetToken(request: NextRequest): string | null {
  const token = request.cookies.get(RESET_COOKIE_NAME)?.value?.trim()
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export function setResetCookie(response: NextResponse, token: string): void {
  response.cookies.set(RESET_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: RESET_COOKIE_PATH,
    maxAge: RESET_TOKEN_TTL_MS / 1000,
  })
}

export function clearResetCookie(response: NextResponse): void {
  response.cookies.set(RESET_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: RESET_COOKIE_PATH,
    maxAge: 0,
  })
}
