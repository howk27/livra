import { Stack } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { themedColors } from '../../theme/tokens';

export default function AuthLayout() {
  const theme = useEffectiveTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: themedColors(theme).linen },
      }}
    >
      <Stack.Screen name="signin" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="reset-password-complete" />
      <Stack.Screen name="signing-out" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
