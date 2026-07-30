import { Redirect, Tabs } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/src/context/AuthContext'
import { MoneyUiProvider, useMoneyUi } from '@/src/context/MoneyUiContext'
import { AddMoneySheet } from '@/src/components/AddMoneySheet'
import { colors } from '@/src/theme/colors'

function TabIcon(props: { name: React.ComponentProps<typeof FontAwesome>['name']; color: string }) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />
}

function TabsShell() {
  const { user, loading } = useAuth()
  const { addOpen, openAdd, closeAdd, bumpRefresh } = useMoneyUi()
  const insets = useSafeAreaInsets()

  if (!loading && !user) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontWeight: '800', color: colors.primaryDark },
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 60 + Math.max(insets.bottom - 8, 0),
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <TabIcon name="home" color={String(color)} />,
          }}
        />
        <Tabs.Screen
          name="wallets"
          options={{
            title: 'Wallets',
            tabBarIcon: ({ color }) => <TabIcon name="credit-card" color={String(color)} />,
          }}
        />
        <Tabs.Screen
          name="bills"
          options={{
            title: 'Bills',
            tabBarIcon: ({ color }) => <TabIcon name="file-text-o" color={String(color)} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            tabBarIcon: ({ color }) => <TabIcon name="bar-chart" color={String(color)} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <TabIcon name="cog" color={String(color)} />,
          }}
        />
      </Tabs>

      {user ? (
        <Pressable
          onPress={openAdd}
          style={({ pressed }) => [
            styles.fab,
            { bottom: 70 + Math.max(insets.bottom - 8, 0) },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <Text style={styles.fabPlus}>+</Text>
        </Pressable>
      ) : null}

      <AddMoneySheet
        visible={addOpen}
        onClose={closeAdd}
        onSaved={bumpRefresh}
      />
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
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabPlus: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '700',
    marginTop: -2,
  },
})
