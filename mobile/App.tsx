import { useCallback, useEffect, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react'
import { ActivityIndicator, AppState, BackHandler, Image, Linking, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView as NativeWebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview'
import { APP_URL, APP_VERSION, isAppUrl } from './src/config'
import { getStatus, requestPermission, startTracking, stopTracking, subscribeToLocation } from './src/location'
import { saveSharedFile } from './src/files'

const BRAND = '#F26522'

/**
 * The library declares its props as `WebViewProps & undefined`, which current
 * TypeScript reads as "accepts nothing". Same component, usable types.
 */
type WebHandle = { goBack(): void; reload(): void; injectJavaScript(script: string): void }
const WebView = NativeWebView as unknown as ForwardRefExoticComponent<WebViewProps & RefAttributes<WebHandle>>

/**
 * Runs before any TCNP script, so the screens know they are inside the app,
 * and tells the page how much of the bottom of the screen belongs to the phone
 * (gesture bar or home indicator). The page runs to the very bottom edge and
 * pads its own tab bar by this amount, so the bar's colour reaches the edge
 * and its buttons sit just above the phone's own controls. Padding the whole
 * page here instead left a blank strip under the tab bar.
 */
const insetScript = (bottom: number) => {
  const value = Math.max(0, Math.round(bottom))
  return `(function(){try{var n=window.__TCNP_NATIVE__=window.__TCNP_NATIVE__||{};n.platform=${JSON.stringify(Platform.OS)};n.version=${JSON.stringify(APP_VERSION)};n.insets={top:0,bottom:${value}};var d=document.documentElement;if(d){d.setAttribute('data-tcnp-native','');d.style.setProperty('--native-safe-top','0px');d.style.setProperty('--native-safe-bottom','${value}px')}}catch(e){}})();true;`
}

/** A colour reported by the page is only used if it is plainly a colour. */
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\))$/

/**
 * Settings that only mean something on iPhone, and are passed only there.
 *
 * On Android the library hands every setting to the native view untouched.
 * `decelerationRate="normal"` is a word on iPhone (the library turns it into
 * a number) but the native view expects a number, so on Android the word
 * reached it as-is and the app closed the moment the screen was drawn.
 */
const IOS_ONLY: Partial<WebViewProps> = Platform.OS === 'ios' ? {
  allowsInlineMediaPlayback: true,
  allowsBackForwardNavigationGestures: true,
  pullToRefreshEnabled: false,
  bounces: false,
  contentInsetAdjustmentBehavior: 'never',
  decelerationRate: 'normal',
} : {}

type BridgeMessage = { type?: unknown; id?: unknown; token?: unknown; ingestUrl?: unknown; dark?: unknown; background?: unknown; name?: unknown; mime?: unknown; data?: unknown }

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  )
}

function Shell() {
  const systemDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  // The page reports its own theme; until it does, follow the phone's setting.
  const [chrome, setChrome] = useState<{ dark: boolean; background: string } | null>(null)
  const dark = chrome?.dark ?? systemDark
  const web = useRef<WebHandle>(null)
  const canGoBack = useRef(false)
  const currentUrl = useRef(APP_URL)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  /** App to web: see lib/native-shell.ts in the web app. */
  const send = useCallback((message: Record<string, unknown>) => {
    // Double-encoded so the payload arrives as one inert string, whatever it contains.
    web.current?.injectJavaScript(`window.__tcnpNativeReceive && window.__tcnpNativeReceive(${JSON.stringify(JSON.stringify(message))}); true;`)
  }, [])

  const pushStatus = useCallback(async () => {
    try { send({ type: 'location:status', status: await getStatus() }) } catch { /* next change reports again */ }
  }, [send])

  // Tell the screens whenever a position is sent or tracking changes, and when
  // the officer comes back to the app (permission may have changed in Settings).
  useEffect(() => {
    const unsubscribe = subscribeToLocation(() => { void pushStatus() })
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void pushStatus() })
    return () => { unsubscribe(); appState.remove() }
  }, [pushStatus])

  // Keep the page's bottom spacing right when the phone's bars change
  // (rotation, switching between gesture and button navigation).
  useEffect(() => {
    web.current?.injectJavaScript(insetScript(insets.bottom))
  }, [insets.bottom])

  // Android back button: go back inside TCNP before leaving the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // The page decides what Back means: close the open sheet or menu first,
      // then go back a screen. Only when there is nowhere left to go does it
      // ask the app to close. A page too old to know this falls back to
      // plain history.
      const can = canGoBack.current ? 'true' : 'false'
      web.current?.injectJavaScript(`(function(){try{if(typeof window.__tcnpNativeBack==='function'){window.__tcnpNativeBack(${can})}else if(${can}){history.back()}else{window.ReactNativeWebView.postMessage('{"type":"app:exit"}')}}catch(e){}})();true;`)
      return true
    })
    return () => subscription.remove()
  }, [])

  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    // Only TCNP's own pages may talk to the app.
    if (!isAppUrl(event.nativeEvent.url)) return
    let message: BridgeMessage
    try { message = JSON.parse(event.nativeEvent.data) } catch { return }
    if (!message || typeof message.type !== 'string') return
    if (message.type === 'ui:chrome') {
      if (typeof message.background === 'string' && SAFE_COLOR.test(message.background)) {
        setChrome({ dark: message.dark === true, background: message.background })
      }
      return
    }
    if (message.type === 'app:exit') { BackHandler.exitApp(); return }
    const id = typeof message.id === 'string' ? message.id : undefined
    const answer = (payload: Record<string, unknown>) => { if (id) send({ id, ...payload }) }
    try {
      switch (message.type) {
        case 'location:status':
          answer({ status: await getStatus() })
          break
        case 'location:request-permission':
          answer({ permission: await requestPermission() })
          void pushStatus()
          break
        case 'location:start':
          if (typeof message.token !== 'string' || typeof message.ingestUrl !== 'string') throw new Error('Incomplete request.')
          answer({ status: await startTracking(message.token, message.ingestUrl) })
          break
        case 'file:save':
          await saveSharedFile(message.name, message.mime, message.data)
          answer({ saved: true })
          break
        case 'location:stop':
          await stopTracking()
          answer({ status: await getStatus() })
          break
        default:
          answer({ error: 'This version of the TCNP app does not support that yet. Please update the app.' })
      }
    } catch (error) {
      answer({ error: error instanceof Error ? error.message : 'The TCNP app could not complete that.' })
    }
  }, [pushStatus, send])

  const onNavigation = useCallback((state: WebViewNavigation) => {
    canGoBack.current = state.canGoBack
    if (state.url) currentUrl.current = state.url
  }, [])

  // TCNP pages stay in the app; phone, mail, maps and outside links open where they belong.
  const shouldLoad = useCallback((request: { url: string; isTopFrame?: boolean }) => {
    const { url } = request
    if (request.isTopFrame === false || url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) return true
    if (isAppUrl(url)) return true
    void Linking.openURL(url).catch(() => undefined)
    return false
  }, [])

  const retry = useCallback(() => {
    setFailed(null)
    setLoaded(false)
    setAttempt(value => value + 1)
  }, [])

  const background = chrome?.background ?? (dark ? '#0d1017' : '#ffffff')
  return (
      <SafeAreaView style={[styles.fill, { backgroundColor: background }]} edges={['top', 'left', 'right']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {!failed && (
          <WebView
            key={attempt}
            ref={web}
            source={{ uri: APP_URL }}
            style={[styles.fill, { backgroundColor: background }]}
            applicationNameForUserAgent={`TCNPApp/${APP_VERSION}`}
            injectedJavaScriptBeforeContentLoaded={insetScript(insets.bottom)}
            onMessage={event => { void onMessage(event) }}
            onNavigationStateChange={onNavigation}
            onShouldStartLoadWithRequest={shouldLoad}
            onLoadEnd={() => { web.current?.injectJavaScript(insetScript(insets.bottom)); setLoaded(true); void pushStatus() }}
            onError={event => setFailed(event.nativeEvent.description || 'No connection')}
            onHttpError={event => { if (event.nativeEvent.statusCode >= 500 && isAppUrl(event.nativeEvent.url) && !loaded) setFailed(`Server error ${event.nativeEvent.statusCode}`) }}
            // The system can end the page's process to free memory; bring it back.
            onContentProcessDidTerminate={() => web.current?.reload()}
            onRenderProcessGone={() => web.current?.reload()}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            cacheEnabled
            geolocationEnabled
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            overScrollMode="never"
            textZoom={100}
            webviewDebuggingEnabled={__DEV__}
            {...IOS_ONLY}
          />
        )}
        {!loaded && !failed && (
          <View style={[styles.overlay, { backgroundColor: background }]} pointerEvents="none">
            <Image source={require('./assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
            <ActivityIndicator color={BRAND} size="large" style={styles.spinner} />
          </View>
        )}
        {failed && (
          <View style={[styles.overlay, { backgroundColor: background }]}>
            <Image source={require('./assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
            <Text style={[styles.title, { color: dark ? '#f8fafc' : '#0f172a' }]}>Can’t reach TCNP</Text>
            <Text style={[styles.body, { color: dark ? '#94a3b8' : '#475569' }]}>
              Check your internet connection and try again. If location sharing is on, your location is still being sent in the background.
            </Text>
            <Pressable onPress={retry} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: 132, height: 132 },
  spinner: { marginTop: 28 },
  title: { marginTop: 24, fontSize: 20, fontWeight: '700' },
  body: { marginTop: 8, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { marginTop: 24, minHeight: 48, paddingHorizontal: 28, borderRadius: 24, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
})
