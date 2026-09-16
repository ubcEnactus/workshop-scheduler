/**
 * Auth.js infers secure cookies from each request everywhere else. The preview
 * action creates a session directly, so its HTTPS-only cookie is explicit and
 * the Auth.js preview configuration imports this same value.
 */
export const previewAuthSessionCookie = {
  name: '__Secure-authjs.session-token',
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/' as const,
    secure: true,
  },
}
