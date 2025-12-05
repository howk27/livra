import { Stack } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';

export default function AuthLayout() {
  const theme = useEffectiveTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme === 'dark' ? '#111827' : '#EEEEEE' },
      }}
    >
      <Stack.Screen name="signin" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="reset-password-complete" />
      <Stack.Screen name="signing-out" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
