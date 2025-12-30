/**
 * Avatar Storage Utilities
 * 
 * Handles uploading, downloading, and managing user avatar images
 * in Supabase Storage with the structure: profile-pictures/{user_id}/avatar.png
 */

import { supabase } from '../supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';

const BUCKET_NAME = 'profile-pictures';
const AVATAR_FILENAME = 'avatar.png';

/**
 * Get the storage path for a user's avatar
 */
export function getAvatarPath(userId: string): string {
  return `${userId}/${AVATAR_FILENAME}`;
}

/**
 * Upload an avatar image to Supabase Storage
 * 
 * @param userId - The user's UUID
 * @param imageUri - Local file URI from image picker
 * @returns The public URL or signed URL, or null if upload failed
 */
export async function uploadAvatar(
  userId: string,
  imageUri: string
): Promise<string | null> {
  try {
    // Verify file exists
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      logger.error('[Avatar Storage] File does not exist:', imageUri);
      return null;
    }

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    // Convert base64 to ArrayBuffer for Supabase
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Construct the path
    const avatarPath = getAvatarPath(userId);

    // Upload to Supabase storage (upsert: true replaces existing file)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(avatarPath, byteArray, {
        contentType: 'image/png',
        upsert: true, // Automatically replace existing avatar
      });

    if (uploadError) {
      logger.error('[Avatar Storage] Upload error:', uploadError);
      throw uploadError;
    }

    // Get the URL (public or signed)
    const url = await getAvatarUrl(userId);
    
    // Update profiles.avatar_url in database
    if (url) {
      await updateProfileAvatarUrl(userId, url);
    }

    return url;
  } catch (error: any) {
    logger.error('[Avatar Storage] Error uploading avatar:', error);
    throw error;
  }
}

/**
 * Get the avatar URL for a user
 * 
 * If bucket is public, returns public URL
 * If bucket is private, returns signed URL (expires in 1 hour)
 * 
 * @param userId - The user's UUID
 * @param expiresIn - Expiration time in seconds for signed URLs (default: 3600 = 1 hour)
 * @returns The avatar URL or null if not found
 */
export async function getAvatarUrl(
  userId: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    const avatarPath = getAvatarPath(userId);

    // Try to create a signed URL (works for both public and private buckets)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(avatarPath, expiresIn);

    if (signedUrlError) {
      // File doesn't exist or access denied
      if (signedUrlError.message?.includes('not found') || signedUrlError.message?.includes('Object not found')) {
        logger.log('[Avatar Storage] Avatar not found for user:', userId);
        return null;
      }
      logger.error('[Avatar Storage] Error getting signed URL:', signedUrlError);
      return null;
    }

    // If we have a signed URL, use it (works for both public and private buckets)
    if (signedUrlData?.signedUrl) {
      return signedUrlData.signedUrl;
    }

    return null;
  } catch (error: any) {
    logger.error('[Avatar Storage] Error getting avatar URL:', error);
    return null;
  }
}

/**
 * Delete a user's avatar
 * 
 * @param userId - The user's UUID
 * @returns true if successful, false otherwise
 */
export async function deleteAvatar(userId: string): Promise<boolean> {
  try {
    const avatarPath = getAvatarPath(userId);

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([avatarPath]);

    if (error) {
      logger.error('[Avatar Storage] Error deleting avatar:', error);
      return false;
    }

    // Clear avatar_url in profiles table
    await updateProfileAvatarUrl(userId, null);

    return true;
  } catch (error: any) {
    logger.error('[Avatar Storage] Error deleting avatar:', error);
    return false;
  }
}

/**
 * Update the avatar_url column in the profiles table
 * 
 * @param userId - The user's UUID
 * @param avatarUrl - The avatar URL or null to clear
 */
async function updateProfileAvatarUrl(
  userId: string,
  avatarUrl: string | null
): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (error) {
      logger.error('[Avatar Storage] Error updating profile avatar_url:', error);
      // Don't throw - this is not critical
    }
  } catch (error: any) {
    logger.error('[Avatar Storage] Error updating profile avatar_url:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Check if a user has an avatar
 * 
 * @param userId - The user's UUID
 * @returns true if avatar exists, false otherwise
 */
export async function hasAvatar(userId: string): Promise<boolean> {
  try {
    const url = await getAvatarUrl(userId);
    return url !== null;
  } catch (error) {
    logger.error('[Avatar Storage] Error checking avatar:', error);
    return false;
  }
}

/**
 * Refresh a signed URL if it's expired
 * 
 * @param userId - The user's UUID
 * @param currentUrl - The current URL (may be expired)
 * @param expiresIn - Expiration time in seconds for new signed URL
 * @returns New URL or null if refresh failed
 */
export async function refreshAvatarUrl(
  userId: string,
  currentUrl: string | null,
  expiresIn: number = 3600
): Promise<string | null> {
  // If no current URL, just get a new one
  if (!currentUrl) {
    return getAvatarUrl(userId, expiresIn);
  }

  // Check if URL is a signed URL (contains query params)
  const isSignedUrl = currentUrl.includes('?');
  
  // If it's a signed URL, refresh it
  if (isSignedUrl) {
    return getAvatarUrl(userId, expiresIn);
  }

  // If it's a public URL, return it as-is
  return currentUrl;
}

