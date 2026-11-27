import { useCallback, useEffect, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react'
import { ActivityIndicator, AppState, BackHandler, Image, Linking, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView as NativeWebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview'
import { APP_URL, APP_VERSION, isAppUrl } from './src/config'
import { getStatus, requestPermission, startTracking, stopTracking, subscribeToLocation } from './src/location'

const BRAND = '#F26522'

/**
 * The library declares its props as `WebViewProps & undefined`, which current
 * TypeScript reads as "accepts nothing". Same component, usable types.
 */
type WebHandle = { goBack(): void; reload(): void; injectJavaScript(script: string): void }
const WebView = NativeWebView as unknown as ForwardRefExoticComponent<WebViewProps & RefAttributes<WebHandle>>

/** Runs before any TCNP script, so the screens know they are inside the app. */
const BOOTSTRAP = `window.__TCNP_NATIVE__ = ${JSON.stringify({ platform: Platform.OS, version: APP_VERSION })}; true;`

type BridgeMessage = { type?: unknown; id?: unknown; token?: unknown; ingestUrl?: unknown }

export default function App() {
  const dark = useColorScheme() === 'dark'
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

  // Android back button: go back inside TCNP before leaving the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false
      web.current?.goBack()
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

  const background = dark ? '#0d1017' : '#ffffff'
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.fill, { backgroundColor: background }]} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {!failed && (
          <WebView
            key={attempt}
            ref={web}
            source={{ uri: APP_URL }}
            style={[styles.fill, { backgroundColor: background }]}
            applicationNameForUserAgent={`TCNPApp/${APP_VERSION}`}
            injectedJavaScriptBeforeContentLoaded={BOOTSTRAP}
            onMessage={event => { void onMessage(event) }}
            onNavigationStateChange={onNavigation}
            onShouldStartLoadWithRequest={shouldLoad}
            onLoadEnd={() => { setLoaded(true); void pushStatus() }}
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
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            pullToRefreshEnabled={false}
            overScrollMode="never"
            bounces={false}
            textZoom={100}
            contentInsetAdjustmentBehavior="never"
            decelerationRate="normal"
            webviewDebuggingEnabled={__DEV__}
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
    </SafeAreaProvider>
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
