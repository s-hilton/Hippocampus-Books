import { Text } from '../../../components/Text'
import { Tabs } from 'expo-router/js-tabs'
import { supabase } from '../../../lib/supabase'
import { fontFamily, useTheme } from '../../../lib/theme'
import { Button } from '../../../components/ui'

export default function TabsLayout() {
  const t = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.accent, fontFamily, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontFamily },
        headerRight: () => <Button variant="link" title="Sign out" onPress={() => supabase.auth.signOut()} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Search', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔍</Text> }}
      />
      <Tabs.Screen
        name="pile"
        options={{ title: 'My Pile', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📚</Text> }}
      />
    </Tabs>
  )
}
