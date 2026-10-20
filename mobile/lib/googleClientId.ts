// Shared by googleIdToken.ts (native) and googleIdToken.web.ts. Lives in its
// own file: on web, './googleIdToken' resolves to the .web.ts file itself.
export interface GoogleTokens {
  idToken: string
  accessToken?: string
}

export async function googleWebClientId(): Promise<string | undefined> {
  try {
    const Constants: any = await import('expo-constants').then(
      (m) => m.default || m,
    )
    return (
      Constants?.expoConfig?.extra?.googleWebClientId ||
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    )
  } catch {
    return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  }
}
