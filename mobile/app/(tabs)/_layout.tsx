import { Redirect, Tabs, router } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/src/context/AuthContext'
import { MoneyUiProvider, useMoneyUi } from '@/src/context/MoneyUiContext'
import { AddMoneySheet } from '@/src/components/AddMoneySheet'
import { BouncingFab } from '@/src/components/BouncingFab'
import { FloatingIslandTabBar } from '@/src/components/FloatingIslandTabBar'
import { OfflineBanner } from '@/src/offline'
import { AmountUnlockSheet } from '@/src/privacy/AmountUnlockSheet'
import { useColors } from '@/src/theme/ThemeContext'

function TabsShell() {
  const { user, loading } = useAuth()
  const { addOpen, openAdd, closeAdd, bumpRefresh } = useMoneyUi()
  const insets = useSafeAreaInsets()
  const colors = useColors()

  if (!loading && !user) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <OfflineBanner />
      <Tabs
        tabBar={(props) => <FloatingIslandTabBar {...(props as unknown as React.ComponentProps<typeof FloatingIslandTabBar>)} />}
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontWeight: '800', color: colors.primaryDark },
          headerShadowVisible: false,
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => router.push('/(tabs)/household')}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <FontAwesome name="users" size={18} color={colors.primaryDark} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/(tabs)/settings')}
                hitSlop={8}
                style={[styles.headerBtn, { marginRight: 12 }]}
              >
                <FontAwesome name="cog" size={18} color={colors.primaryDark} />
              </Pressable>
            </View>
          ),
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="wallets" options={{ title: 'Wallets' }} />
        <Tabs.Screen name="income" options={{ title: 'Income' }} />
        <Tabs.Screen name="bills" options={{ title: 'Bills' }} />
        <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
        <Tabs.Screen
          name="household"
          options={{ title: 'Family', href: null, headerShown: true }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', href: null, headerShown: true }}
        />
      </Tabs>

      {user ? (
        <BouncingFab
          onPress={openAdd}
          color={colors.primary}
          bottom={88 + Math.max(insets.bottom - 8, 0)}
        />
      ) : null}

      <AddMoneySheet visible={addOpen} onClose={closeAdd} onSaved={bumpRefresh} />
      <AmountUnlockSheet />
    </View>
  )
}

export default function TabsLayout() {
  return (
    <MoneyUiProvider>
      <TabsShell />
    </MoneyUiProvider>
  )
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { padding: 8 },
})
