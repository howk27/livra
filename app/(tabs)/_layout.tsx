import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sun, List, Gear } from 'phosphor-react-native';
import { useEffectiveTheme } from '../../state/uiSlice';
import { spacing, themedColors, fontSize, fonts } from '../../theme/tokens';
import { useAuth } from '../../hooks/useAuth';
import { DrawerContext } from '../../components/ui/LivraHeader';

// ── Tab bar icon factories ────────────────────────────────────────────────────

type IconProps = { focused: boolean; color: string };

function FocusIcon({ focused, color }: IconProps) {
  return <Sun size={22} color={color} weight={focused ? 'fill' : 'regular'} />;
}
function GoalsIcon({ focused, color }: IconProps) {
  return <List size={22} color={color} weight={focused ? 'bold' : 'regular'} />;
}
function SettingsIcon({ focused, color }: IconProps) {
  return <Gear size={22} color={color} weight={focused ? 'fill' : 'regular'} />;
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
              fontSize: fontSize['2xs'],
              fontFamily: fonts.sans,
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
            name="goals"
            options={{
              title: 'Goals',
              tabBarIcon: ({ focused, color }) => (
                <GoalsIcon focused={focused} color={color as string} />
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
        </Tabs>
      </View>
    </DrawerContext.Provider>
  );
}
