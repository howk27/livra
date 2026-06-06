import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useEffectiveTheme } from '../../state/uiSlice';
import { spacing, themedColors } from '../../theme/tokens';
import { useAuth } from '../../hooks/useAuth';
import { DrawerContext } from '../../components/ui/LivraHeader';

// ── Tab bar icon factories ────────────────────────────────────────────────────

type IconProps = { focused: boolean; color: string };

function FocusIcon({ focused, color }: IconProps) {
  return <Feather name="sun" size={22} color={color} style={focused ? { opacity: 1 } : { opacity: 0.7 }} />;
}
function QueueIcon({ focused, color }: IconProps) {
  return <Feather name="list" size={22} color={color} style={focused ? { opacity: 1 } : { opacity: 0.7 }} />;
}
function SettingsIcon({ focused, color }: IconProps) {
  return <Feather name="settings" size={22} color={color} style={focused ? { opacity: 1 } : { opacity: 0.7 }} />;
}

// ── Tab Layout ────────────────────────────────────────────────────────────────

const NOOP_DRAWER = { open: () => {}, close: () => {} };

export default function TabLayout() {
  const theme = useEffectiveTheme();
  const tc = themedColors(theme);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initialized, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!initialized || loading) return;
    if (!isAuthenticated) {
      router.replace('/auth/signin');
    }
  }, [initialized, loading, isAuthenticated, router]);

  const ACTIVE = tc.forest;
  const INACTIVE = tc.inkMuted;

  return (
    <DrawerContext.Provider value={NOOP_DRAWER}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarActiveTintColor: ACTIVE,
            tabBarInactiveTintColor: INACTIVE,
            tabBarStyle: {
              height: 64 + insets.bottom,
              backgroundColor: tc.surface,
              borderTopWidth: 0.5,
              borderTopColor: tc.borderLight,
              paddingTop: spacing.sm,
              paddingBottom: insets.bottom + spacing.xs,
              paddingHorizontal: spacing.xl,
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              elevation: 0,
              zIndex: 1,
            },
            tabBarLabelStyle: {
              fontSize: 10,
              fontFamily: 'DMSans_400Regular',
              marginTop: 2,
              letterSpacing: 0,
            },
            tabBarItemStyle: {
              paddingVertical: spacing.xs,
              minHeight: 44,
            },
          }}
        >
          <Tabs.Screen
            name="focus"
            options={{
              title: 'Focus',
              tabBarIcon: ({ focused, color }) => (
                <FocusIcon focused={focused} color={color as string} />
              ),
            }}
          />
          <Tabs.Screen
            name="queue"
            options={{
              title: 'Queue',
              tabBarIcon: ({ focused, color }) => (
                <QueueIcon focused={focused} color={color as string} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ focused, color }) => (
                <SettingsIcon focused={focused} color={color as string} />
              ),
            }}
          />

          {/* Hidden routes — accessible programmatically */}
          <Tabs.Screen name="marks" options={{ href: null }} />
          <Tabs.Screen name="stats" options={{ href: null }} />
          <Tabs.Screen name="tracking" options={{ href: null }} />
          <Tabs.Screen name="profile" options={{ href: null }} />
        </Tabs>
      </View>
    </DrawerContext.Provider>
  );
}
