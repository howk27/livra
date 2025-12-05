#!/usr/bin/env node

/**
 * Production Configuration Validation Script
 * 
 * This script validates that required environment variables are set
 * before building for production. It will fail the build if critical
 * configuration is missing.
 */

const fs = require('fs');
const path = require('path');

// Check if .env file exists
const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(process.cwd(), '.env.example');

let envVars = {};

// Try to read .env file if it exists
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

// Also check process.env (for EAS build secrets)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || envVars.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Validation
const errors = [];
const warnings = [];

// Check Supabase configuration
if (!supabaseUrl || supabaseUrl.includes('placeholder') || supabaseUrl === 'your-supabase-url') {
  errors.push('EXPO_PUBLIC_SUPABASE_URL is not configured or contains placeholder value');
}

if (!supabaseKey || supabaseKey.includes('placeholder') || supabaseKey === 'your-supabase-anon-key') {
  errors.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured or contains placeholder value');
}

if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
  errors.push('EXPO_PUBLIC_SUPABASE_URL must start with https://');
}

// Check EAS project ID (warning, not error - can be set later)
const appJsonPath = path.join(process.cwd(), 'app.json');
if (fs.existsSync(appJsonPath)) {
  try {
    let appJsonContent = fs.readFileSync(appJsonPath, 'utf8');
    // Remove _comment field if present (JSON doesn't support comments)
    // This regex handles all cases: with/without comma before, with/without comma after
    // Pattern: (optional comma + whitespace) "_comment": "value" (optional comma + whitespace)
    appJsonContent = appJsonContent.replace(/,?\s*"_comment"\s*:\s*"[^"]*"\s*,?\s*/g, '');
    // Clean up any double commas that might result
    appJsonContent = appJsonContent.replace(/,\s*,/g, ',');
    // Clean up comma before closing brace
    appJsonContent = appJsonContent.replace(/,\s*}/g, '}');
    // Clean up comma before closing bracket
    appJsonContent = appJsonContent.replace(/,\s*]/g, ']');
    const appJson = JSON.parse(appJsonContent);
    if (appJson.expo?.extra?.eas?.projectId === 'YOUR_EAS_PROJECT_ID' || 
        appJson.expo?.updates?.url?.includes('YOUR_EAS_PROJECT_ID')) {
      warnings.push('EAS Project ID is still set to placeholder. Update app.json before submitting to stores.');
    }
  } catch (parseError) {
    errors.push(`Failed to parse app.json: ${parseError.message}`);
  }
}

// Report results
if (warnings.length > 0) {
  console.warn('\n⚠️  Warnings:');
  warnings.forEach(warning => console.warn(`   - ${warning}`));
}

if (errors.length > 0) {
  console.error('\n❌ Production Build Validation Failed:');
  errors.forEach(error => console.error(`   - ${error}`));
  console.error('\nPlease configure the required environment variables before building for production.');
  console.error('See README.md for setup instructions.\n');
  process.exit(1);
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Production configuration validated successfully');
}

