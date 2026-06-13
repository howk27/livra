import { Redirect } from 'expo-router';

/**
 * Weekly snapshot. Deep links to /weekly-review forward to the Goals tab
 * (the Tracking tab was removed from the nav in the 2.0 redesign; the Queue
 * tab was renamed Goals in the Phase 3 IA restructure).
 */
export default function WeeklyReviewRedirectScreen() {
  return <Redirect href={'/(tabs)/goals' as any} />;
}
