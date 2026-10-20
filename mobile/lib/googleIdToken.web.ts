// Web Google sign-in via Google Identity Services (accounts.google.com/gsi).
// Yields the same ID token the native SDK does, so POST /auth/google and the
// backend's audience check (GOOGLE client IDs incl. the web client) are unchanged.
import { googleWebClientId, type GoogleTokens } from './googleClientId'

const GSI_SRC = 'https://accounts.google.com/gsi/client'
let gsiLoading: Promise<void> | null = null

function loadGsi(): Promise<void> {
  if ((window as any).google?.accounts?.id) return Promise.resolve()
  gsiLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gsiLoading = null
      reject(new Error('Could not load Google sign-in. Check your connection.'))
    }
    document.head.appendChild(script)
  })
  return gsiLoading
}

export async function getGoogleTokens(): Promise<GoogleTokens> {
  const clientId = await googleWebClientId()
  if (!clientId) throw new Error('Google sign-in is not configured for web')
  await loadGsi()
  const gsi = (window as any).google.accounts.id

  return new Promise<GoogleTokens>((resolve, reject) => {
    gsi.initialize({
      client_id: clientId,
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: true,
      callback: (res: { credential?: string }) =>
        res.credential
          ? resolve({ idToken: res.credential })
          : reject(new Error('Google sign-in failed: missing idToken')),
    })
    gsi.prompt((n: any) => {
      // Dismissed, skipped, or suppressed (e.g. third-party sign-in disabled):
      // surface as a cancel so AuthContext shows its normal message.
      if (
        n.isNotDisplayed?.() ||
        n.isSkippedMoment?.() ||
        n.isDismissedMoment?.()
      ) {
        if (
          n.isDismissedMoment?.() &&
          n.getDismissedReason?.() === 'credential_returned'
        )
          return
        reject(
          Object.assign(new Error('Google sign-in cancelled'), {
            code: 'SIGN_IN_CANCELLED',
          }),
        )
      }
    })
  })
}
