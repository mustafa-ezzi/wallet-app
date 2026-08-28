import { useEffect, useRef } from 'react'
import { usePathname } from 'expo-router'
import { PostHogProvider, usePostHog } from 'posthog-react-native'
import { useAuth } from '@/src/context/AuthContext'
import {
  bindPostHog,
  captureScreen,
  identifyUser,
  POSTHOG_HOST,
  POSTHOG_KEY,
  posthogEnabled,
  resetAnalytics,
} from './analytics'

function PostHogBridge() {
  const posthog = usePostHog()

  useEffect(() => {
    bindPostHog(posthog)
    return () => bindPostHog(null)
  }, [posthog])

  return null
}

function ScreenTracker() {
  const pathname = usePathname()
  const prev = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || pathname === prev.current) return
    prev.current = pathname
    captureScreen(pathname)
  }, [pathname])

  return null
}

function AuthAnalytics() {
  const { user } = useAuth()
  const prevId = useRef<number | null>(null)

  useEffect(() => {
    if (user) {
      identifyUser(user)
      prevId.current = user.id
      return
    }
    if (prevId.current != null) {
      resetAnalytics()
      prevId.current = null
    }
  }, [user])

  return null
}

function PostHogInternals() {
  return (
    <>
      <PostHogBridge />
      <ScreenTracker />
      <AuthAnalytics />
    </>
  )
}

export function PostHogRoot({ children }: { children: React.ReactNode }) {
  if (!posthogEnabled) return <>{children}</>

  return (
    <PostHogProvider
      apiKey={POSTHOG_KEY}
      options={{
        host: POSTHOG_HOST,
        enableSessionReplay: false,
        captureAppLifecycleEvents: true,
        personProfiles: 'identified_only',
      }}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
        captureAppLifecycleEvents: true,
      }}
    >
      <PostHogInternals />
      {children}
    </PostHogProvider>
  )
}
