// Native Google sign-in → ID token for POST /auth/google.
// Web uses googleIdToken.web.ts (the native SDK's web build is sponsor-only).
import { googleWebClientId, type GoogleTokens } from './googleClientId'

export async function getGoogleTokens(): Promise<GoogleTokens> {
  const { GoogleSignin } = await import(
    '@react-native-google-signin/google-signin'
  )
  // Configure from env — supports web/ios/android clientIds array per BetterAuth docs
  const webId = await googleWebClientId()
  if (webId) {
    GoogleSignin.configure({
      webClientId: webId,
      offlineAccess: true, // accessType offline per GoogleSocialLogin.md
      forceCodeForRefreshToken: true,
    })
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const res: any = await GoogleSignin.signIn()
  const idToken = res?.data?.idToken || res?.idToken
  if (!idToken) throw new Error('Google sign-in failed: missing idToken')
  return { idToken, accessToken: res?.data?.accessToken || undefined }
}
