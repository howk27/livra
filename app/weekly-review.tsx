import { Redirect } from 'expo-router';

/**
 * Weekly snapshot lives on the Tracking tab. Deep links to /weekly-review forward there.
 */
export default function WeeklyReviewRedirectScreen() {
  return <Redirect href="/(tabs)/tracking" />;
}
