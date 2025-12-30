/**
 * Single Source of Truth for IAP Product SKUs
 * 
 * All SKU strings must be imported from this file.
 * DO NOT hardcode SKU strings anywhere else in the codebase.
 */

export const MONTHLY_SKU = 'livra_plus_monthly';
export const YEARLY_SKU = 'livra_plus_yearly';
export const ALL_SUBS_SKUS = [MONTHLY_SKU, YEARLY_SKU] as const;

