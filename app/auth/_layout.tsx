import { Stack } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { colors } from '../../theme/colors';

export default function AuthLayout() {
  const theme = useEffectiveTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors[theme].background },
      }}
    >
      <Stack.Screen name="signin" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="reset-password-complete" />
      <Stack.Screen name="signing-out" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
