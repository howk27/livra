import React, { createContext, useContext, useState, useCallback } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  House,
  CheckCircle,
  Gear,
  Plus,
  X,
  CalendarCheck,
  Flag,
  ListBullets,
} from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useEffectiveTheme } from '../../state/uiSlice';
import { spacing, borderRadius } from '../../theme/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useEffect } from 'react';

// ── FAB Context ──────────────────────────────────────────────────────────────

type FABContextType = {
  isEditMode: boolean;
  setIsEditMode: (value: boolean) => void;
};

const FABContext = createContext<FABContextType>({
  isEditMode: false,
  setIsEditMode: () => {},
});

export const useFABContext = () => useContext(FABContext);

// ── Tab bar icon factories ────────────────────────────────────────────────────

type IconProps = { focused: boolean; color: string };

function HomeIcon({ focused, color }: IconProps) {
  return <House size={22} color={color} weight={focused ? 'fill' : 'regular'} />;
}
function MarksIcon({ focused, color }: IconProps) {
  return <CheckCircle size={22} color={color} weight={focused ? 'fill' : 'regular'} />;
}
function SettingsIcon({ focused, color }: IconProps) {
  return <Gear size={22} color={color} weight={focused ? 'fill' : 'regular'} />;
}
function QueueIcon({ focused, color }: IconProps) {
  return <ListBullets size={22} color={color} weight={focused ? 'fill' : 'regular'} />;
}

// ── Expandable FAB ────────────────────────────────────────────────────────────

const SPRING_CONFIG = { damping: 18, stiffness: 260, mass: 0.9 };

const FloatingActionButton = () => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  const rotation = useSharedValue(0);
  const option1Y = useSharedValue(0);
  const option1Opacity = useSharedValue(0);
  const option2Y = useSharedValue(0);
  const option2Opacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const TAB_BAR_HEIGHT = 64 + insets.bottom;
  const FAB_BOTTOM = TAB_BAR_HEIGHT + 16;

  const expand = useCallback(() => {
    rotation.value = withSpring(1, SPRING_CONFIG);
    option1Y.value = withSpring(-68, SPRING_CONFIG);
    option1Opacity.value = withTiming(1, { duration: 160 });
    option2Y.value = withSpring(-132, SPRING_CONFIG);
    option2Opacity.value = withTiming(1, { duration: 200 });
    backdropOpacity.value = withTiming(1, { duration: 200 });
  }, [rotation, option1Y, option1Opacity, option2Y, option2Opacity, backdropOpacity]);

  const collapse = useCallback(() => {
    rotation.value = withSpring(0, SPRING_CONFIG);
    option1Y.value = withSpring(0, SPRING_CONFIG);
    option1Opacity.value = withTiming(0, { duration: 120 });
    option2Y.value = withSpring(0, SPRING_CONFIG);
    option2Opacity.value = withTiming(0, { duration: 80 });
    backdropOpacity.value = withTiming(0, { duration: 150 });
  }, [rotation, option1Y, option1Opacity, option2Y, option2Opacity, backdropOpacity]);

  const toggle = useCallback(async () => {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (expanded) {
      collapse();
      setExpanded(false);
    } else {
      expand();
      setExpanded(true);
    }
  }, [expanded, expand, collapse]);

  const handleCheckin = useCallback(() => {
    collapse();
    setExpanded(false);
    setTimeout(() => router.push('/checkin'), 160);
  }, [collapse, router]);

  const handleAddGoal = useCallback(() => {
    collapse();
    setExpanded(false);
    setTimeout(() => router.push('/goal/queue'), 160);
  }, [collapse, router]);

  const fabAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 45}deg` }],
  }));

  const opt1AnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: option1Y.value }],
    opacity: option1Opacity.value,
  }));
  const opt2AnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: option2Y.value }],
    opacity: option2Opacity.value,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.45,
    pointerEvents: expanded ? 'auto' : 'none',
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { zIndex: 9000 }]}
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      </Animated.View>

      {/* Option 2 — Add Goal (top) */}
      <Animated.View
        style={[
          styles.fabOption,
          {
            right: 20,
            bottom: FAB_BOTTOM,
            backgroundColor: themeColors.surfaceVariant,
          },
          opt2AnimStyle,
        ]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.fabOptionInner}
          onPress={handleAddGoal}
          activeOpacity={0.8}
        >
          <Flag size={20} color={themeColors.text} weight="regular" />
        </TouchableOpacity>
      </Animated.View>

      {/* Option 1 — Check In (bottom) */}
      <Animated.View
        style={[
          styles.fabOption,
          {
            right: 20,
            bottom: FAB_BOTTOM,
            backgroundColor: themeColors.surfaceVariant,
          },
          opt1AnimStyle,
        ]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.fabOptionInner}
          onPress={handleCheckin}
          activeOpacity={0.8}
        >
          <CalendarCheck size={20} color={themeColors.text} weight="regular" />
        </TouchableOpacity>
      </Animated.View>

      {/* FAB */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            right: 20,
            bottom: FAB_BOTTOM,
            backgroundColor: '#FEB729',
          },
        ]}
        onPress={toggle}
        activeOpacity={0.9}
      >
        <Animated.View style={fabAnimStyle}>
          {expanded ? (
            <X size={22} color="#111111" weight="bold" />
          ) : (
            <Plus size={22} color="#111111" weight="bold" />
          )}
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

// ── Tab Layout ────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const insets = useSafeAreaInsets();
  const [isEditMode, setIsEditMode] = useState(false);
  const router = useRouter();
  const { initialized, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!initialized || loading) return;
    if (!isAuthenticated) {
      router.replace('/auth/signin');
    }
  }, [initialized, loading, isAuthenticated, router]);

  const ACCENT = '#FEB729';
  const INACTIVE = themeColors.textTertiary;

  return (
    <FABContext.Provider value={{ isEditMode, setIsEditMode }}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarActiveTintColor: ACCENT,
            tabBarInactiveTintColor: INACTIVE,
            tabBarStyle: {
              height: 64 + insets.bottom,
              backgroundColor: themeColors.surface,
              borderTopWidth: 0.5,
              borderTopColor: themeColors.border,
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
              fontFamily: 'Inter',
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
            name="home"
            options={{
              title: 'Home',
              tabBarIcon: ({ focused, color }) => (
                <HomeIcon focused={focused} color={color as string} />
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
            name="marks"
            options={{
              title: 'Marks',
              tabBarIcon: ({ focused, color }) => (
                <MarksIcon focused={focused} color={color as string} />
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

          {/* Hidden routes — accessible programmatically, not from tab bar */}
          <Tabs.Screen name="stats" options={{ href: null }} />
          <Tabs.Screen name="tracking" options={{ href: null }} />
          <Tabs.Screen name="profile" options={{ href: null }} />
        </Tabs>

        <FloatingActionButton />
      </View>
    </FABContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 8000,
  },
  fabOption: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    zIndex: 9001,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 8 },
    }),
  },
  fabOptionInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9002,
    ...Platform.select({
      ios: {
        shadowColor: '#FEB729',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 10 },
    }),
  },
});
