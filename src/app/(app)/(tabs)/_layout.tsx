import { Text } from 'react-native'
import { Tabs } from 'expo-router/js-tabs'
import { supabase } from '../../../lib/supabase'
import { useTheme } from '../../../lib/theme'
import { Button } from '../../../components/ui'

export default function TabsLayout() {
  const t = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.text },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
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
