import { Redirect } from 'expo-router';

/**
 * Weekly snapshot. Deep links to /weekly-review forward to the Queue tab
 * (the Tracking tab was removed from the nav in the 2.0 redesign).
 */
export default function WeeklyReviewRedirectScreen() {
  return <Redirect href={'/(tabs)/queue' as any} />;
}
