import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useIAP } from '../hooks/useIAP';

const PRO_FEATURES = [
  { icon: '∞', title: 'Unlimited Marks', description: 'Create as many marks as you need' },
  { icon: '📊', title: 'PDF & CSV Export', description: 'Export your data anytime' },
  { icon: '🎨', title: 'Premium Themes', description: 'Access all accent colors and themes' },
  { icon: '🎯', title: 'Icon Pack', description: 'More emojis and custom icons' },
  { icon: '🔔', title: 'Multiple Reminders', description: 'Set reminders for each mark' },
  { icon: '☁️', title: 'Cloud Backup', description: 'Automatic sync across all devices' },
];

export default function PaywallScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  const { products, purchasing, purchasePro, restorePurchases, error } = useIAP();

  const price = products.length > 0 ? products[0].localizedPrice : '$4.99';

  const handlePurchase = async () => {
    await purchasePro();
    if (!error) {
      router.back();
    }
  };

  const handleRestore = async () => {
    await restorePurchases();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.closeButton, { color: themeColors.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.proIcon}>⭐</Text>
          <Text style={[styles.title, { color: themeColors.text }]}>Upgrade to Livra+</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Unlock unlimited tracking potential
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresList}>
          {PRO_FEATURES.map((feature, index) => (
            <View
              key={index}
              style={[styles.featureItem, { backgroundColor: themeColors.surface }]}
            >
              <View
                style={[styles.featureIcon, { backgroundColor: themeColors.primary + '20' }]}
              >
                <Text style={[styles.featureIconText, { color: themeColors.primary }]}>
                  {feature.icon}
                </Text>
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: themeColors.text }]}>
                  {feature.title}
                </Text>
                <Text style={[styles.featureDescription, { color: themeColors.textSecondary }]}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Price Card */}
        <View style={[styles.priceCard, { backgroundColor: themeColors.surface }, shadow.lg]}>
          <Text style={[styles.priceLabel, { color: themeColors.textSecondary }]}>
            One-time purchase
          </Text>
          <Text style={[styles.price, { color: themeColors.text }]}>{price}</Text>
          <Text style={[styles.priceNote, { color: themeColors.textTertiary }]}>
            Pay once, own forever • No subscription
          </Text>
        </View>

        {/* Purchase Button */}
        <TouchableOpacity
          style={[
            styles.purchaseButton,
            { backgroundColor: themeColors.primary },
            shadow.lg,
            purchasing && styles.disabledButton,
          ]}
          onPress={handlePurchase}
          disabled={purchasing}
          activeOpacity={0.8}
        >
          {purchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.purchaseButtonText}>Unlock Livra+</Text>
          )}
        </TouchableOpacity>

        {error && (
          <Text style={[styles.errorText, { color: themeColors.error }]}>{error}</Text>
        )}

        {/* Restore Button */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={purchasing}
        >
          <Text style={[styles.restoreButtonText, { color: themeColors.textSecondary }]}>
            Restore Purchases
          </Text>
        </TouchableOpacity>

        {/* FAQ */}
        <View style={styles.faq}>
          <Text style={[styles.faqTitle, { color: themeColors.text }]}>
            Frequently Asked Questions
          </Text>
          
          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: themeColors.text }]}>
              Will this work offline?
            </Text>
            <Text style={[styles.faqAnswer, { color: themeColors.textSecondary }]}>
              Yes! All features work offline. Cloud sync is optional and requires sign-in.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: themeColors.text }]}>
              Is this a subscription?
            </Text>
            <Text style={[styles.faqAnswer, { color: themeColors.textSecondary }]}>
              No. This is a one-time purchase. Pay once and keep Pro features forever.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
  },
  header: {
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  closeButton: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  proIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
  },
  featuresList: {
    marginBottom: spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureIconText: {
    fontSize: fontSize['2xl'],
  },
  featureText: {
    flex: 1,
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: fontSize.sm,
  },
  priceCard: {
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  priceLabel: {
    fontSize: fontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  price: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  priceNote: {
    fontSize: fontSize.sm,
  },
  purchaseButton: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  restoreButton: {
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  restoreButtonText: {
    fontSize: fontSize.base,
  },
  faq: {
    marginTop: spacing.lg,
  },
  faqTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  faqItem: {
    marginBottom: spacing.md,
  },
  faqQuestion: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  faqAnswer: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});

