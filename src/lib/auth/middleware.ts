import { createMiddleware } from '@tanstack/react-start'

// Resolves the signed-in user from the session cookie on every server
// function (see src/lib/auth/session.server.ts). Data queries are then scoped
// by that user id through business_users.auth_user_id.

export interface AuthContext {
  userId: string
  email: string
}

export const requireAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { lookupSession } = await import('@/lib/auth/session.server')
  const user = await lookupSession()
  if (!user) {
    throw new Error('Unauthorized: sign in to continue.')
  }
  const context: AuthContext = { userId: user.id, email: user.email }
  return next({ context })
})

