// lib/analytics/posthog.ts
// Thin PostHog wrapper. Safe to call with no API key configured (dev/CI):
// every function becomes a no-op instead of throwing or queuing network calls.
// Event taxonomy: snake_case object_action (see core/skills/analytics/SKILL.md).
import PostHog from 'posthog-react-native';
import type { PostHogEventProperties } from '@posthog/core';
import * as Updates from 'expo-updates';
import { env } from '../env';
import { logger } from '../utils/logger';

let client: PostHog | null = null;
let initAttempted = false;

export function isAnalyticsEnabled(): boolean {
  return !!env.posthogApiKey;
}

/**
 * The identity of the JS bundle this launch is running: which OTA update, on
 * which channel, or the binary's embedded bundle. Registered as super-properties
 * so EVERY event names the code that produced it.
 *
 * Why: on 2026-09-06 the Weekly Review diagnostics never ingested while the
 * screen demonstrably mounted 24 times, and nothing in the app could say which
 * bundle the device was running. That question has to be answerable from the
 * data, not inferred from publish timestamps.
 *
 * Best-effort by construction: these reads are native-backed and are stubs on
 * web, so a throw returns an empty identity rather than costing us the client.
 */
function updateIdentity(): PostHogEventProperties {
  try {
    return {
      updates_enabled: Updates.isEnabled,
      update_id: Updates.updateId,
      update_channel: Updates.channel,
      runtime_version: Updates.runtimeVersion,
      is_embedded_launch: Updates.isEmbeddedLaunch,
      // True when the previous update crashed and the app fell back. A silent
      // rollback looks exactly like "the OTA never arrived".
      is_emergency_launch: Updates.isEmergencyLaunch,
      update_created_at: Updates.createdAt?.toISOString() ?? null,
    };
  } catch (e) {
    logger.warn('[Analytics] update identity unavailable:', e);
    return {};
  }
}

/** Call once, near app start (see app/_layout.tsx). Idempotent. */
export function initAnalytics(): PostHog | null {
  if (initAttempted) return client;
  initAttempted = true;
  if (!env.posthogApiKey) {
    if (env.isDev) logger.warn('[Analytics] EXPO_PUBLIC_POSTHOG_KEY not set — analytics disabled.');
    return null;
  }
  try {
    client = new PostHog(env.posthogApiKey, {
      host: env.posthogHost,
      enableSessionReplay: false,
    });
    // Super-properties attached to every event, so a single PostHog project can
    // separate app vs web (`platform`) and prod vs preview vs dev (`environment`)
    // by filtering — no second project needed. Web registers platform:'web'.
    client.register({
      platform: 'app',
      environment: env.isProduction ? 'production' : env.isPreview ? 'preview' : 'development',
      ...updateIdentity(),
    });
  } catch (e) {
    logger.error('[Analytics] initAnalytics failed:', e);
    client = null;
  }
  return client;
}

export function capture(event: string, properties?: PostHogEventProperties): void {
  if (!client) return;
  try {
    client.capture(event, properties);
  } catch (e) {
    logger.warn('[Analytics] capture failed:', event, e);
  }
}

export function identify(userId: string, properties?: PostHogEventProperties): void {
  if (!client) return;
  try {
    client.identify(userId, properties);
  } catch (e) {
    logger.warn('[Analytics] identify failed:', e);
  }
}

/** Call on sign-out — clears the identified user, starts a fresh anonymous id. */
export function resetAnalytics(): void {
  if (!client) return;
  try {
    client.reset();
  } catch (e) {
    logger.warn('[Analytics] reset failed:', e);
  }
}

export function screenTrack(screenName: string, properties?: PostHogEventProperties): void {
  if (!client) return;
  try {
    client.screen(screenName, properties);
  } catch (e) {
    logger.warn('[Analytics] screen failed:', screenName, e);
  }
}

export function captureException(error: unknown, properties?: PostHogEventProperties): void {
  if (!client) return;
  try {
    client.captureException(error instanceof Error ? error : new Error(String(error)), properties);
  } catch (e) {
    logger.warn('[Analytics] captureException failed:', e);
  }
}

export function getAnalyticsClient(): PostHog | null {
  return client;
}
