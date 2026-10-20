// Web counterpart of polyfills.ts (Metro picks this file on web).
// Browsers have crypto.getRandomValues natively, so no RNG polyfill here.
//
// react-native-web ships Alert.alert as a no-op, which silently swallows
// every error message and confirm prompt in the app (~130 call sites).
// Map it onto the browser's blocking dialogs instead.
import { Alert, type AlertButton } from 'react-native'

Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
  const text = [title, message].filter(Boolean).join('\n\n')
  const actions = buttons ?? []

  if (actions.length < 2) {
    window.alert(text)
    actions[0]?.onPress?.()
    return
  }

  // Two or more choices: OK runs the first non-cancel action (the
  // confirming one in every call site), Cancel runs the cancel action.
  const cancel = actions.find((b) => b.style === 'cancel')
  const confirm = actions.find((b) => b !== cancel) ?? actions[0]
  if (window.confirm(text)) confirm.onPress?.()
  else cancel?.onPress?.()
}
