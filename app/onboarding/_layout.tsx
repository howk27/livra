import { Stack } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { colors } from '../../theme/colors';

export default function OnboardingLayout() {
  const theme = useEffectiveTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors[theme].background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="commitment" />
      <Stack.Screen name="focus-area" />
      <Stack.Screen name="daily-identity" />
      <Stack.Screen name="recommendations" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
