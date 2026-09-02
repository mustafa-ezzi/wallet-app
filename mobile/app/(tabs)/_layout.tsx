import { Redirect, Tabs, router } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/src/context/AuthContext'
import { BouncingFab } from '@/src/components/BouncingFab'
import { FloatingIslandTabBar } from '@/src/components/FloatingIslandTabBar'
import { OfflineBanner } from '@/src/offline'
import { AmountUnlockSheet } from '@/src/privacy/AmountUnlockSheet'
import { BudgetsWhatsNewDialog } from '@/src/components/BudgetsWhatsNewDialog'
import { RatingPrompt } from '@/src/rating'
import { useColors } from '@/src/theme/ThemeContext'

function TabsShell() {
  const { user, loading } = useAuth()
  const insets = useSafeAreaInsets()
  const colors = useColors()

  if (!loading && !user) {
    return <Redirect href="/(auth)/login" />
  }
  if (!loading && user && user.onboarding_complete === false) {
    return <Redirect href="/(onboarding)/about-you" />
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <OfflineBanner />
      <Tabs
        tabBar={(props) => <FloatingIslandTabBar {...(props as unknown as React.ComponentProps<typeof FloatingIslandTabBar>)} />}
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontWeight: '800', color: colors.primaryDark, fontSize: 16 },
          headerShadowVisible: false,
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => router.push('/(tabs)/reports')}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <FontAwesome name="bar-chart" size={16} color={colors.primaryDark} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/(tabs)/settings')}
                hitSlop={8}
                style={[styles.headerBtn, { marginRight: 10 }]}
              >
                <FontAwesome name="cog" size={16} color={colors.primaryDark} />
              </Pressable>
            </View>
          ),
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="wallets" options={{ title: 'Wallets' }} />
        <Tabs.Screen name="income" options={{ title: 'Income' }} />
        <Tabs.Screen name="bills" options={{ title: 'Bills' }} />
        <Tabs.Screen name="budgets" options={{ title: 'Budgets' }} />
        <Tabs.Screen name="household" options={{ title: 'Family' }} />
        <Tabs.Screen
          name="reports"
          options={{ title: 'Reports', href: null, headerShown: true }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', href: null, headerShown: true }}
        />
      </Tabs>

      {user ? (
        <BouncingFab
          onPress={() => router.push('/add-transaction')}
          color={colors.primary}
          bottom={78 + Math.max(insets.bottom - 8, 0)}
        />
      ) : null}

      <AmountUnlockSheet />
      {user ? <BudgetsWhatsNewDialog /> : null}
      {user ? <RatingPrompt /> : null}
    </View>
  )
}

export default function TabsLayout() {
  return <TabsShell />
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerBtn: { padding: 6 },
})
