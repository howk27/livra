import React, { createContext, useContext, useState } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { View, StyleSheet, Text, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useEffectiveTheme } from '../../state/uiSlice';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';

// Context to share FAB state from home screen
type FABContextType = {
  isEditMode: boolean;
  setIsEditMode: (value: boolean) => void;
};

const FABContext = createContext<FABContextType | null>(null);

export const useFABContext = () => {
  const context = useContext(FABContext);
  if (!context) {
    return { isEditMode: false, setIsEditMode: () => {} };
  }
  return context;
};

// Custom background for tab bar per spec
const TabBarBackground = () => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  // Per spec: BG bg.surface, 1px top border border.soft
  // Corners: top-rounded 16 on Android, flat on iOS
  // Shadow: iOS 0 2 6 0 rgba(0,0,0,0.06) · Android elevation: 2
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: themeColors.surface,
          borderTopWidth: 1,
          borderTopColor: themeColors.border,
          borderTopLeftRadius: Platform.OS === 'android' ? borderRadius.xl : 0,
          borderTopRightRadius: Platform.OS === 'android' ? borderRadius.xl : 0,
          zIndex: 1, // Lower z-index to allow FAB to appear above
          ...(Platform.OS === 'ios'
            ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 6,
              }
            : {
                elevation: 0, // Lower elevation to allow FAB to appear above
              }),
        },
      ]}
    />
  );
};

// Helper function to create tab bar icon per spec
const createTabBarIcon = (iconName: { focused: string; unfocused: string }, themeColors: any) => {
  return ({ color, focused }: { color: string; focused: boolean }) => {
    const iconColor = focused ? themeColors.text : themeColors.textSecondary + 'B3'; // 70% opacity
    return <Ionicons name={(focused ? iconName.focused : iconName.unfocused) as any} size={24} color={iconColor} />;
  };
};

// Helper function to create tab bar label per spec
const createTabBarLabel = (title: string, themeColors: any) => {
  return ({ color, focused }: { color: string; focused: boolean }) => {
    const labelColor = focused ? themeColors.text : themeColors.textSecondary + '99'; // 60% opacity
    return (
      <Text style={{ color: labelColor, fontSize: fontSize.xs, fontWeight: fontWeight.medium, letterSpacing: 2 }}>
        {title}
      </Text>
    );
  };
};

// FAB Component rendered at layout level to appear above tab bar
const FloatingActionButton = () => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { isEditMode } = useFABContext();

  // Only show FAB on home screen
  // Check if pathname includes 'home' (handles various pathname formats)
  const isHomeScreen = pathname?.includes('home') || pathname?.endsWith('/(tabs)/home') || pathname === '/(tabs)/home' || (!pathname?.includes('stats') && !pathname?.includes('settings'));

  if (!isHomeScreen) {
    return null;
  }

  const handleCreateCounter = () => {
    router.push('/counter/new');
  };

  return (
    <View pointerEvents="box-none" style={fabStyles.fabContainer}>
      <TouchableOpacity
        style={[
          fabStyles.fab,
          {
            backgroundColor: themeColors.accent.primary,
            opacity: isEditMode ? 0.4 : 1,
            bottom: insets.bottom + 64 - 28,
            right: spacing.lg,
          },
        ]}
        onPress={async () => {
          if (isEditMode) {
            return;
          }
          if (Platform.OS !== 'web') {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          handleCreateCounter();
        }}
        activeOpacity={0.92}
        disabled={isEditMode}
      >
        <Ionicons name="add" size={24} color={themeColors.text} />
      </TouchableOpacity>
    </View>
  );
};

const fabStyles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    pointerEvents: 'box-none',
    elevation: Platform.OS === 'android' ? 10 : 0,
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }
      : {
          elevation: 10,
        }),
  },
});

export default function TabLayout() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const insets = useSafeAreaInsets();
  const [isEditMode, setIsEditMode] = useState(false);

  return (
    <FABContext.Provider value={{ isEditMode, setIsEditMode }}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true, // Show labels per spec
            tabBarActiveTintColor: themeColors.text, // text.primary per spec
            tabBarInactiveTintColor: themeColors.textSecondary, // text.muted per spec
            tabBarStyle: {
              height: 64 + insets.bottom, // Per spec: 64 + safe area bottom
              backgroundColor: 'transparent',
              borderTopWidth: 0, // Handled by TabBarBackground
              paddingTop: spacing.sm, // 12px paddingVertical per spec
              paddingBottom: insets.bottom + spacing.sm, // Safe area bottom + padding
              paddingHorizontal: spacing.xl, // Group icons closer together, leaving space for centered FAB
              position: 'absolute',
              bottom: 0, // Position at bottom
              left: 0,
              right: 0,
              elevation: 0, // Handled by TabBarBackground
              zIndex: 1, // Lower z-index to allow FAB to appear above
            },
            tabBarBackground: () => <TabBarBackground />,
            tabBarLabelStyle: {
              fontSize: fontSize.xs, // 11px per spec
              fontWeight: fontWeight.medium, // 500 per spec
              letterSpacing: 2, // +2 tracking per spec
              marginTop: -spacing.xs,
            },
            tabBarIconStyle: {
              marginTop: spacing.xs,
            },
            tabBarItemStyle: {
              paddingVertical: spacing.sm, // 12px paddingVertical per spec
              minHeight: 44, // Hit target ≥ 44×44 per spec
            },
            headerTintColor: themeColors.text,
          }}
        >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Marks',
          tabBarIcon: createTabBarIcon({ focused: 'home', unfocused: 'home-outline' }, themeColors),
          tabBarLabel: createTabBarLabel('Marks', themeColors),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: createTabBarIcon({ focused: 'stats-chart', unfocused: 'stats-chart-outline' }, themeColors),
          tabBarLabel: createTabBarLabel('Stats', themeColors),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Profile',
          tabBarIcon: createTabBarIcon({ focused: 'person', unfocused: 'person-outline' }, themeColors),
          tabBarLabel: createTabBarLabel('Profile', themeColors),
        }}
      />
        </Tabs>
        <FloatingActionButton />
      </View>
    </FABContext.Provider>
  );
}

