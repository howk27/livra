import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, G, Text as SvgText, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { spacing, fontSize, borderRadius, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { GradientBackground } from '../../components/GradientBackground';
import { LoadingScreen } from '../../components/LoadingScreen';
import { useAuth } from '../../hooks/useAuth';
import { AppText } from '../../components/Typography';
import { formatDate, isToday, isYesterday } from '../../lib/date';
import { subDays, format } from 'date-fns';
import { InfoModal } from '../../components/InfoModal';
import { Mark, MarkEvent } from '../../types';
import { SUGGESTED_MARKS_BY_CATEGORY } from '../../lib/suggestedCounters';
import { computeStreak } from '../../hooks/useStreaks';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { logger } from '../../lib/utils/logger';

const APP_BRAND_LOGO_LIGHT = require('../../assets/branding/Logo NoBG.png');
const APP_BRAND_LOGO_DARK = require('../../assets/branding/Logo NoBG dark.png');


// Daily Completion Ring constants
const RING_RADIUS = 72;
const RING_STROKE = 18; // Medium-thick ring for better visibility
const RING_SIZE = RING_RADIUS * 2 + RING_STROKE;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Ring color constants - soft accent palette
const RING_FILLED_COLOR = '#53C9A5'; // soft mint green
const RING_UNFILLED_COLOR = '#2C4C47'; // low-contrast dark teal

// Category color mapping - soft muted palette
const CATEGORY_COLORS: Record<string, string> = {
  'Fitness': '#53C9A5', // soft mint green
  'Wellness': '#B689FF', // soft violet
  'Learning & Growth': '#6FA9FF', // soft sky blue
  'Productivity': '#FFAA64', // soft warm orange
  'Habit Breaking': '#FF6B6B', // soft coral red
  'Uncategorized': '#9CA3AF', // Gray for uncategorized
};

// Pie chart constants - Sized larger for better visibility
const PIE_SIZE = 400; // Increased size for better visibility
const SLICE_GAP = 0; // No gap between slices
const GAP_ANGLE_DEGREES = 0; // No gaps between slices
const ROTATION_OFFSET = 15; // Rotation offset in degrees to rotate the pie chart (clockwise)
// CRITICAL: Use exact visible radius for all slices - no gaps between slices
// This ensures all slices have identical visible fill area
const PIE_RADIUS = 160; // Increased radius for larger pie chart
const PIE_CENTER = PIE_SIZE / 2; // EXACT center - same for ALL slices (200)
// CRITICAL: All slices MUST use PIE_RADIUS (160) and PIE_CENTER (200) exactly - no variations

// Leader line configuration
const ALLOWED_LEADER_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

const normalizeAngle = (angle: number) => {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const quantizeLeaderAngle = (angle: number) => {
  const normalized = normalizeAngle(angle);
  let closest = ALLOWED_LEADER_ANGLES[0];
  let minDiff = Number.MAX_VALUE;
  for (const permitted of ALLOWED_LEADER_ANGLES) {
    const rawDiff = Math.abs(normalized - permitted);
    const diff = Math.min(rawDiff, 360 - rawDiff);
    if (diff < minDiff) {
      closest = permitted;
      minDiff = diff;
    }
  }
  return closest;
};

const getTextAnchorForDirection = (dx: number) => {
  if (Math.abs(dx) < 0.2) return 'middle';
  return dx > 0 ? 'start' : 'end';
};

const estimateLabelBox = (text: string, fontSize: number) => {
  const safeLength = Math.max(text.length, 2);
  const width = fontSize * safeLength * 0.65;
  const height = fontSize * 1.35;
  return { width, height };
};

// Helper function to convert polar coordinates to cartesian
// Uses exact calculations - all slices use same center and radius constants
// CRITICAL: All slices must use identical centerX, centerY, and radius for perfect alignment
const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  // Use exact angle conversion - no rounding until final calculation
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  // Use exact calculations - all slices use identical centerX, centerY, and radius
  // This ensures all edge points are at the exact same distance from center
  // Calculate using exact values to prevent any floating point differences
  const x = centerX + radius * Math.cos(angleInRadians);
  const y = centerY + radius * Math.sin(angleInRadians);
  return { x, y };
};

// Helper function to create pie chart path - all slices meet at exact same center point
// CRITICAL: All slices MUST use identical center and radius values for perfect alignment
const createPieSlice = (startAngle: number, endAngle: number, radius: number, center: number): string => {
  // CRITICAL: Use exact same center and radius for ALL slices - no variations
  // This ensures all slices meet at the exact same center point with identical radius
  // Use exact constants - no rounding or formatting that could introduce differences
  const exactCenter = center; // PIE_CENTER constant (160) - same for ALL slices
  const exactRadius = radius; // PIE_RADIUS constant (130) - same for ALL slices
  
  // Calculate angle span - ensure it's positive and within valid range
  let angleSpan = endAngle - startAngle;
  // Normalize angle span to be between 0 and 360
  if (angleSpan < 0) angleSpan += 360;
  if (angleSpan > 360) angleSpan = 360;
  
  // CRITICAL: Calculate edge points using exact same radius and center for all slices
  // All slices MUST reach the exact same distance from center - ensures identical length
  // Use exact same calculation method for all slices - no variations
  // Note: We use endAngle for start point and startAngle for end point to draw clockwise
  // This ensures the arc is drawn in the correct direction
  const start = polarToCartesian(exactCenter, exactCenter, exactRadius, endAngle);
  const end = polarToCartesian(exactCenter, exactCenter, exactRadius, startAngle);
  
  // Calculate large arc flag correctly - use angleSpan, not the difference
  // For angles > 180 degrees, we need the large arc
  const largeArcFlag = angleSpan > 180 ? '1' : '0';
  
  // Path construction: All slices follow IDENTICAL pattern
  // 1. Start at exact center (PIE_CENTER, PIE_CENTER) - same for ALL slices
  // 2. Line to edge at exact radius (PIE_RADIUS) - same distance for ALL slices
  // 3. Arc along edge at exact radius (PIE_RADIUS) - same radius for ALL slices
  // 4. Explicitly line back to exact center - ensures perfect center alignment
  // CRITICAL: The arc must use the exact same radius values for rx and ry to ensure circular arcs
  // CRITICAL: Explicitly return to center with L command before Z to ensure all slices meet at exact same point
  // This guarantees all slices form a perfect circle radiating from one exact center point
  // All numeric values are used directly to ensure SVG uses exact values
  return [
    'M', exactCenter, exactCenter,  // Move to exact center (SAME for ALL slices)
    'L', start.x, start.y,  // Line to start of arc (at exact radius - SAME for ALL)
    'A', exactRadius, exactRadius, 0, largeArcFlag, 0, end.x, end.y,  // Arc (exact radius rx=ry - SAME for ALL)
    'L', exactCenter, exactCenter,  // Explicitly line back to exact center (ensures perfect alignment)
    'Z',  // Close path (redundant but ensures closure)
  ].join(' ');
};


// Helper function to safely format date
const safeFormatDate = (date: Date | string): string | null => {
  try {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    return formatDate(d);
  } catch {
    return null;
  }
};

// Helper function to safely format date for display
const safeFormatDateDisplay = (date: Date | string | null | undefined): string => {
  try {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) return 'N/A';
    return format(d, 'MMM d, yyyy');
  } catch {
    return 'N/A';
  }
};

// Helper function to match Mark to category
const getMarkCategory = (mark: Mark): string => {
  try {
    if (!mark || !mark.name) return 'Uncategorized';
    const markName = mark.name.toLowerCase().trim();
    
    // First, try exact match
    for (const category of SUGGESTED_MARKS_BY_CATEGORY) {
      for (const suggestedMark of category.marks) {
        if (suggestedMark.name.toLowerCase().trim() === markName) {
          return category.title;
        }
      }
    }
    
    // Then, try keyword matching for better categorization
    // Define category keywords
    const categoryKeywords: Record<string, string[]> = {
      'Fitness': ['workout', 'exercise', 'gym', 'run', 'jog', 'cardio', 'strength', 'yoga', 'pilates', 'swim', 'bike', 'cycling', 'walk', 'fitness', 'training', 'sport', 'sports', 'pushup', 'situp', 'squat', 'lift', 'weight'],
      'Wellness': ['meditate', 'meditation', 'mindfulness', 'sleep', 'rest', 'relax', 'wellness', 'health', 'self-care', 'therapy', 'journal', 'gratitude', 'breath', 'breathing', 'stretch', 'massage', 'spa', 'bath'],
      'Learning & Growth': ['read', 'book', 'learn', 'study', 'course', 'class', 'lesson', 'practice', 'skill', 'language', 'coding', 'programming', 'tutorial', 'podcast', 'education', 'knowledge'],
      'Productivity': ['task', 'todo', 'work', 'project', 'focus', 'pomodoro', 'deep work', 'meeting', 'email', 'code', 'write', 'create', 'build', 'develop', 'complete', 'finish'],
      'Habit Breaking': ['quit', 'stop', 'no', 'avoid', 'reduce', 'limit', 'break', 'smoking', 'drinking', 'social media', 'screen time', 'procrastinate'],
    };
    
    // Check for keyword matches
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (markName.includes(keyword)) {
          return category;
        }
      }
    }
    
    return 'Uncategorized';
  } catch {
    return 'Uncategorized';
  }
};

// Helper function to shorten category names for better readability
const shortenCategoryName = (category: string): string => {
  const abbreviations: Record<string, string> = {
    'Fitness': 'Fitness',
    'Wellness': 'Wellness',
    'Learning & Growth': 'Learning',
    'Productivity': 'Productivity',
    'Habit Breaking': 'Habit',
    'Uncategorized': 'Other',
  };
  
  return abbreviations[category] || (category.length > 10 ? category.substring(0, 10) + '...' : category);
};

// Daily Marks Count Ring Component
const DailyMarksRing: React.FC<{
  count: number;
  activeMarksCount: number; // Number of active marks for daily goal calculation
  theme: 'light' | 'dark';
  themeColors: typeof colors.light;
  onInfoPress?: () => void;
}> = React.memo(({ count, activeMarksCount, theme, themeColors, onInfoPress }) => {
  // Calculate percentage based on active marks as daily goal
  // Only count marks that are currently active (not deleted)
  // If no active marks, show 0% (avoid division by zero)
  // The count represents unique marks incremented today, so goal is number of active marks
  // IMPORTANT: This count persists even after manual resets - it only resets daily
  const dailyGoal = activeMarksCount || 1; // Use 1 as fallback to avoid division by zero
  const percentage = Math.min((count / dailyGoal) * 100, 100);
  const [animatedProgress, setAnimatedProgress] = useState(percentage / 100);

  // Update progress when percentage changes
  // Only update if the percentage actually changed to prevent unnecessary resets
  useEffect(() => {
    const newProgress = percentage / 100;
    // Only update if the value actually changed (avoid resetting on same value)
    setAnimatedProgress((prevProgress) => {
      if (Math.abs(newProgress - prevProgress) > 0.001) {
        return newProgress;
      }
      return prevProgress;
    });
  }, [percentage]);

  // Disable all animations to prevent crashes
  const animatedContainerStyle = { transform: [{ scale: 1 }] };

  const strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  const strokeDashoffset = CIRCUMFERENCE * (1 - animatedProgress);

  // Create gradient colors based on theme - use theme primary and accent colors
  const gradientStart = themeColors.primary;
  const gradientEnd = themeColors.accent.secondary;
  const gradientId = `ringGradient-${theme}`;
  
  // For circular stroke gradient, use coordinates that create a visible gradient along the arc
  // The gradient will follow the stroke path from start to end
  const centerX = RING_SIZE / 2;
  const centerY = RING_SIZE / 2;
  
  // Create a diagonal gradient that will be visible along the circular path
  // This creates a gradient that transitions as the stroke progresses
  const gradientX1 = centerX - RING_RADIUS;
  const gradientY1 = centerY - RING_RADIUS;
  const gradientX2 = centerX + RING_RADIUS;
  const gradientY2 = centerY + RING_RADIUS;

  return (
    <View style={styles.ringWrapper}>
      {onInfoPress && (
        <View style={styles.ringHeader}>
          <AppText variant="subtitle" style={[styles.ringHeaderTitle, { color: themeColors.textSecondary }]}>
            Marks Today
          </AppText>
          <TouchableOpacity style={styles.infoButton} onPress={onInfoPress}>
            <Ionicons name="information-circle-outline" size={18} color={themeColors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}
      <View style={[styles.ringContainer, animatedContainerStyle]}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
        <Defs>
          <LinearGradient 
            id={gradientId} 
            x1={gradientX1} 
            y1={gradientY1} 
            x2={gradientX2} 
            y2={gradientY2}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor={gradientStart} stopOpacity="1" />
            <Stop offset="100%" stopColor={gradientEnd} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {/* Background ring (unfilled portion) */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={RING_UNFILLED_COLOR}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {/* Progress ring (filled portion) with gradient */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={`url(#${gradientId})`}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringContent}>
        <AppText
          variant="display"
          style={[styles.ringNumber, { color: themeColors.text, fontWeight: fontWeight.bold }]}
        >
          {count}/{activeMarksCount || 0}
        </AppText>
        <AppText variant="caption" style={[styles.ringLabel, { color: themeColors.textSecondary }]}>
          MARKS TODAY
        </AppText>
      </View>
      </View>
    </View>
  );
});

// Category Breakdown Component
const CategoryBreakdown: React.FC<{
  events: MarkEvent[];
  marks: Mark[];
  theme: 'light' | 'dark';
  themeColors: typeof colors.light;
  onInfoPress: () => void;
}> = React.memo(({ events, marks, theme, themeColors, onInfoPress }) => {
  // Use ref to store previous data to prevent flickering
  const previousDataRef = useRef<Array<{ category: string; count: number; percentage: number }>>([]);
  // Track the most recent event ID to detect when new events are added
  const lastEventIdRef = useRef<string | null>(null);
  
  // Create a stable dependency key based on recent event IDs and marks
  const dependencyKey = useMemo(() => {
    if (!events || !Array.isArray(events) || events.length === 0) {
      return 'no-events';
    }
    // Use the first 10 most recent event IDs as a dependency key
    // This ensures recalculation when new events are added, even if total length stays the same
    const recentEventIds = events
      .slice(0, 10)
      .map(e => e?.id)
      .filter(Boolean)
      .join(',');
    const marksKey = marks?.map(m => m?.id).filter(Boolean).join(',') || 'no-marks';
    return `${recentEventIds}-${marksKey}`;
  }, [events, marks]);
  
  const categoryData = useMemo(() => {
    // Prevent calculation if arrays are empty or invalid
    if (!events || !marks || !Array.isArray(events) || !Array.isArray(marks)) {
      return [];
    }
    
    try {
      // Create stable references
      const safeEvents = Array.isArray(events) ? events : [];
      const safeMarks = Array.isArray(marks) ? marks : [];
      
      // Early return if no marks (can't categorize without marks)
      if (safeMarks.length === 0) {
        return [];
      }
      
      // Build mark to category mapping first (for all active marks)
      const markCategoryMap = new Map<string, string>();
      const activeMarkIds = new Set<string>();
      
      safeMarks.forEach((mark) => {
        if (mark && !mark.deleted_at) {
          try {
            activeMarkIds.add(mark.id);
            markCategoryMap.set(mark.id, getMarkCategory(mark));
          } catch (error) {
            logger.error('Error categorizing mark:', mark.id, error);
            markCategoryMap.set(mark.id, 'Uncategorized');
          }
        }
      });

      let last30Days: Date;
      try {
        last30Days = subDays(new Date(), 30);
      } catch {
        return [];
      }

      // Filter and sort events by date (most recent first), then filter by last 30 days
      const validEvents = safeEvents
        .filter((e) => {
          try {
            if (!e || e.deleted_at || e.event_type !== 'increment' || !e.occurred_at || !e.mark_id) return false;
            if (!activeMarkIds.has(e.mark_id)) return false; // Only include events for active marks
            const eventDate = new Date(e.occurred_at);
            return !isNaN(eventDate.getTime()) && eventDate >= last30Days;
          } catch {
            return false;
          }
        })
        .sort((a, b) => {
          // Sort by date descending (most recent first)
          try {
            const dateA = new Date(a.occurred_at).getTime();
            const dateB = new Date(b.occurred_at).getTime();
            return dateB - dateA;
          } catch {
            return 0;
          }
        });

      // If no recent events, calculate based on counter totals instead
      if (validEvents.length === 0) {
        // Fallback: use counter totals for categorization
        const categoryTotals: Record<string, number> = {};
        safeMarks.forEach((mark) => {
          if (mark && !mark.deleted_at && mark.total > 0) {
            const category = markCategoryMap.get(mark.id) || 'Uncategorized';
            categoryTotals[category] = (categoryTotals[category] || 0) + mark.total;
          }
        });
        
        const total = Object.values(categoryTotals).reduce((sum, count) => sum + count, 0);
        if (total === 0) {
          return [];
        }
        
        // Only include categories with data (count > 0)
        const result = Object.entries(categoryTotals)
          .filter(([_, count]) => count > 0) // Filter out zero counts
          .map(([category, count]) => ({
            category,
            count,
            percentage: (count / total) * 100,
          }))
          .sort((a, b) => b.percentage - a.percentage);
        
        return result;
      }

      // Count events by category using event amounts (not just count)
      const categoryCounts: Record<string, number> = {};
      validEvents.forEach((event) => {
        if (event && event.mark_id) {
          const category = markCategoryMap.get(event.mark_id) || 'Uncategorized';
          // Use event.amount instead of counting each event as 1
          const amount = typeof event.amount === 'number' && event.amount > 0 ? event.amount : 1;
          categoryCounts[category] = (categoryCounts[category] || 0) + amount;
        }
      });

      const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
      if (total === 0) {
        return [];
      }
      
      // Only include categories with data (count > 0)
      const result = Object.entries(categoryCounts)
        .filter(([_, count]) => count > 0) // Filter out zero counts
        .map(([category, count]) => ({
          category,
          count,
          percentage: (count / total) * 100,
        }))
        .sort((a, b) => b.percentage - a.percentage);
      
      return result;
    } catch (error) {
      logger.error('Error calculating category data:', error);
      return [];
    }
  }, [events, marks]);


  if (categoryData.length === 0) {
    return (
      <View style={[styles.categoryCard, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
        <View style={styles.categoryHeader}>
          <AppText variant="subtitle" style={[styles.categoryTitle, { color: themeColors.textSecondary }]}>
            Category Breakdown
          </AppText>
          <TouchableOpacity style={styles.infoButton} onPress={onInfoPress}>
            <Ionicons name="information-circle-outline" size={18} color={themeColors.textTertiary} />
          </TouchableOpacity>
        </View>
        <AppText variant="body" style={[styles.emptyText, { color: themeColors.textSecondary }]}>
          No category data available
        </AppText>
      </View>
    );
  }

  // Calculate angles for pie chart - adjust for gaps between slices
  // CRITICAL: All slices must start from exact same center point (PIE_CENTER, PIE_CENTER)
  const totalPercentage = categoryData.reduce((sum, item) => sum + item.percentage, 0);
  
  // Normalize percentages to ensure they sum to exactly 100%
  const normalizedData = categoryData.map((item) => ({
    ...item,
    normalizedPercentage: totalPercentage > 0 ? (item.percentage / totalPercentage) * 100 : 0,
  }));
  
  // Calculate angles for pie chart - no gaps between slices
  // Start with rotation offset to move slices to the right
  let currentAngle = ROTATION_OFFSET;
  
  const pieData = normalizedData.map((item, index) => {
    const startAngle = currentAngle;
    // Calculate angle span from normalized percentage - full 360 degrees available
    // This ensures slice sizes remain proportional
    const angleSpan = (item.normalizedPercentage / 100) * 360;
    const endAngle = startAngle + angleSpan;
    currentAngle = endAngle; // Update for next slice
    const midAngle = (startAngle + endAngle) / 2;
    
    return {
      ...item,
      startAngle,
      endAngle,
      midAngle,
      color: CATEGORY_COLORS[item.category] || themeColors.textTertiary,
      shortName: shortenCategoryName(item.category),
    };
  });
  
  // CRITICAL: Ensure perfect 360-degree closure - no gaps
  if (pieData.length > 0) {
    const lastItem = pieData[pieData.length - 1];
    // Ensure last slice ends at exactly 360 + rotation offset to close the circle
    const expectedEnd = ROTATION_OFFSET + 360;
    if (Math.abs(lastItem.endAngle - expectedEnd) > 0.01) {
      lastItem.endAngle = expectedEnd;
      lastItem.midAngle = (lastItem.startAngle + lastItem.endAngle) / 2;
    }
  }

  // Calculate all chart dimensions - TimeTree style: clean, balanced, modern
  const chartDimensions = useMemo(() => {
    const fontSize = 20; // Increased size for better readability
    // Short, clean leader lines matching TimeTree style
    const maxLabelExtension = PIE_RADIUS * 0.4; // Short, consistent lines
    return {
      fontSize,
      labelFontWeight: '600' as const,
      viewBoxPadding: 70, // Adequate padding for labels
      labelLineGap: 4, // Labels sit immediately at line end (TimeTree style)
      lineStrokeWidth: 2,
      lineOpacity: 0.75,
      anchorDotRadius: 3, // Small anchor dot at slice edge
      minPercentageThreshold: 1,
      minLabelSpacing: 14, // Minimum spacing between labels
      minLineLength: PIE_RADIUS * 0.2,
      maxLineLength: maxLabelExtension, // Short, consistent lines
      labelBandPadding: maxLabelExtension + 25, // Buffer for label width
    };
  }, []);

  // Calculate label positions with straight lines from slice edge
  const labelPositions = useMemo(() => {
    const {
      fontSize,
      labelFontWeight,
      labelLineGap,
      lineStrokeWidth,
      lineOpacity,
      anchorDotRadius,
      minPercentageThreshold,
      minLabelSpacing,
      minLineLength,
      maxLineLength,
      labelBandPadding,
    } = chartDimensions;
    
    if (!pieData.length) return [];

    // Base line length - short and consistent
    const baseLineLength = Math.min(
      maxLineLength,
      Math.max(minLineLength, PIE_RADIUS * 0.25)
    );

    type LabelNode = {
      item: (typeof pieData)[number];
      index: number;
      edgeX: number;
      edgeY: number;
      directionX: number;
      directionY: number;
      lineStartX: number;
      lineStartY: number;
      lineLength: number;
      minLineLength: number;
      maxLineLength: number;
      lineEndX: number;
      lineEndY: number;
      labelX: number;
      labelY: number;
      labelText: string;
      labelWidth: number;
      labelHeight: number;
      fontSize: number;
      labelFontWeight: string;
      textAnchor: 'start' | 'middle' | 'end';
      labelLineGap: number;
      lineStrokeWidth: number;
      lineOpacity: number;
      anchorDotRadius: number;
    };

    const nodes: LabelNode[] = pieData
      .filter((item) => item.percentage >= minPercentageThreshold)
      .map((item, index) => {
        // Calculate slice midpoint angle - this is the center of the slice
        const midAngle = normalizeAngle(item.midAngle);
        // Convert to radians with proper offset (SVG uses 0° at top, so -90° adjustment)
        const midAngleRad = ((midAngle - 90) * Math.PI) / 180;
        
        // Anchor dot and line start from the edge at the slice's center (midpoint)
        // This ensures the dot is at the center of each slice piece
        const edgeX = PIE_CENTER + PIE_RADIUS * Math.cos(midAngleRad);
        const edgeY = PIE_CENTER + PIE_RADIUS * Math.sin(midAngleRad);
        
        // Direction vector from center of slice outward
        const directionX = Math.cos(midAngleRad);
        const directionY = Math.sin(midAngleRad);
        
        // Anchor dot and line start exactly at the pie edge at slice center
        const lineStartX = edgeX;
        const lineStartY = edgeY;
        
        const labelText = `${item.percentage.toFixed(0)}%`;
        const { width, height } = estimateLabelBox(labelText, fontSize);

        const node: LabelNode = {
          item,
          index,
          edgeX,
          edgeY,
          directionX,
          directionY,
          lineStartX,
          lineStartY,
          lineLength: baseLineLength,
          minLineLength,
          maxLineLength,
          lineEndX: 0,
          lineEndY: 0,
          labelX: 0,
          labelY: 0,
          labelText,
          labelWidth: width,
          labelHeight: height,
          fontSize,
          labelFontWeight,
          textAnchor: getTextAnchorForDirection(directionX),
          labelLineGap,
          lineStrokeWidth,
          lineOpacity,
          anchorDotRadius,
        };
        return node;
      });

    if (!nodes.length) return [];

    const updateDerivedValues = (node: LabelNode) => {
      // Clamp line length to allowed range
      node.lineLength = Math.min(node.maxLineLength, Math.max(node.minLineLength, node.lineLength));
      
      // Line ends at start + length in direction
      node.lineEndX = node.lineStartX + node.directionX * node.lineLength;
      node.lineEndY = node.lineStartY + node.directionY * node.lineLength;
      
      // Label positioned immediately at line end (TimeTree style - minimal gap)
      node.labelX = node.lineEndX + node.directionX * node.labelLineGap;
      node.labelY = node.lineEndY + node.directionY * node.labelLineGap;
    };

    nodes.forEach(updateDerivedValues);

    const labelsOverlap = (a: LabelNode, b: LabelNode) => {
      const horizontalGap = (a.labelWidth + b.labelWidth) / 2 + minLabelSpacing;
      const verticalGap = (a.labelHeight + b.labelHeight) / 2 + minLabelSpacing;
      return (
        Math.abs(a.labelX - b.labelX) < horizontalGap &&
        Math.abs(a.labelY - b.labelY) < verticalGap
      );
    };

    const adjustSpacing = () => {
      const maxIterations = 30;
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        let adjusted = false;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            if (!labelsOverlap(nodes[i], nodes[j])) continue;

            const primary = nodes[i].lineLength <= nodes[j].lineLength ? nodes[i] : nodes[j];
            const secondary = primary === nodes[i] ? nodes[j] : nodes[i];
            const pushDistance = minLabelSpacing;

            const initialLength = primary.lineLength;
            primary.lineLength = Math.min(primary.maxLineLength, primary.lineLength + pushDistance);
            updateDerivedValues(primary);

            if (Math.abs(primary.lineLength - initialLength) < 0.25) {
              const secondaryInitial = secondary.lineLength;
              secondary.lineLength = Math.max(secondary.minLineLength, secondary.lineLength - pushDistance);
              updateDerivedValues(secondary);

              if (Math.abs(secondary.lineLength - secondaryInitial) < 0.25) {
                primary.lineLength = Math.min(primary.maxLineLength, primary.lineLength + pushDistance * 0.5);
                updateDerivedValues(primary);
              }
            }

            adjusted = true;
          }
        }

        if (!adjusted) break;
      }
    };

    adjustSpacing();

    const limitWithinBand = () => {
      // Calculate maximum safe distance from pie edge (not center)
      const maxSafeDistance = PIE_RADIUS + labelBandPadding;
      
      nodes.forEach((node) => {
        // Check distance from pie center (accounting for label dimensions)
        const labelHalfWidth = node.labelWidth / 2;
        const labelHalfHeight = node.labelHeight / 2;
        
        // Calculate label's distance from center
        const labelDistFromCenter = Math.sqrt(
          Math.pow(node.labelX - PIE_CENTER, 2) + 
          Math.pow(node.labelY - PIE_CENTER, 2)
        );
        
        // Maximum allowed distance (radius + padding - label half-dimension)
        const maxAllowedDist = maxSafeDistance - Math.max(labelHalfWidth, labelHalfHeight);
        
        let guard = 0;
        while (
          labelDistFromCenter > maxAllowedDist &&
          node.lineLength > node.minLineLength &&
          guard < 30
        ) {
          node.lineLength -= 3;
          updateDerivedValues(node);
          
          // Recalculate distance
          const newDist = Math.sqrt(
            Math.pow(node.labelX - PIE_CENTER, 2) + 
            Math.pow(node.labelY - PIE_CENTER, 2)
          );
          if (newDist <= maxAllowedDist) break;
          guard++;
        }
      });
    };

    limitWithinBand();

    return nodes;
  }, [pieData, chartDimensions]);

  // Calculate viewBox dynamically - CRITICAL: Always keep PIE_CENTER at exact center of viewBox
  const svgViewBox = useMemo(() => {
    const padding = chartDimensions.viewBoxPadding;
    const maxLabelExtension = chartDimensions.labelBandPadding;

    if (!labelPositions.length) {
      // No labels: viewBox centered on PIE_CENTER
      const size = PIE_SIZE + padding * 2;
      const start = PIE_CENTER - size / 2;
      return `${start} ${start} ${size} ${size}`;
    }

    // Calculate maximum extent from PIE_CENTER in all directions
    // CRITICAL: All calculations are relative to PIE_CENTER to ensure perfect centering
    let maxDistanceFromCenter = PIE_RADIUS; // Start with pie radius

    labelPositions.forEach((pos) => {
      // Calculate distance from PIE_CENTER for all label and line points
      const labelMinX = pos.labelX - pos.labelWidth / 2;
      const labelMaxX = pos.labelX + pos.labelWidth / 2;
      const labelMinY = pos.labelY - pos.labelHeight / 2;
      const labelMaxY = pos.labelY + pos.labelHeight / 2;

      // Find maximum distance from center for this label
      const distances = [
        Math.sqrt(Math.pow(labelMinX - PIE_CENTER, 2) + Math.pow(labelMinY - PIE_CENTER, 2)),
        Math.sqrt(Math.pow(labelMaxX - PIE_CENTER, 2) + Math.pow(labelMinY - PIE_CENTER, 2)),
        Math.sqrt(Math.pow(labelMinX - PIE_CENTER, 2) + Math.pow(labelMaxY - PIE_CENTER, 2)),
        Math.sqrt(Math.pow(labelMaxX - PIE_CENTER, 2) + Math.pow(labelMaxY - PIE_CENTER, 2)),
        Math.sqrt(Math.pow(pos.lineStartX - PIE_CENTER, 2) + Math.pow(pos.lineStartY - PIE_CENTER, 2)),
        Math.sqrt(Math.pow(pos.lineEndX - PIE_CENTER, 2) + Math.pow(pos.lineEndY - PIE_CENTER, 2)),
        Math.sqrt(Math.pow(pos.edgeX - PIE_CENTER, 2) + Math.pow(pos.edgeY - PIE_CENTER, 2)),
      ];

      const maxDist = Math.max(...distances);
      maxDistanceFromCenter = Math.max(maxDistanceFromCenter, maxDist);
    });

    // Clamp to reasonable bounds
    const maxAllowedDistance = PIE_RADIUS + maxLabelExtension + padding;
    maxDistanceFromCenter = Math.min(maxDistanceFromCenter, maxAllowedDistance);

    // CRITICAL: ViewBox must be perfectly centered on PIE_CENTER and perfectly square
    // This ensures all slices appear to meet at the exact same center point with no distortion
    // Square viewBox prevents any aspect ratio distortion that could make slices appear different lengths
    const viewBoxSize = maxDistanceFromCenter * 2 + padding * 2;
    // Ensure viewBox is perfectly centered on PIE_CENTER (160, 160)
    const viewBoxX = PIE_CENTER - viewBoxSize / 2;
    const viewBoxY = PIE_CENTER - viewBoxSize / 2;
    
    // Return perfectly square viewBox centered on PIE_CENTER
    return `${viewBoxX} ${viewBoxY} ${viewBoxSize} ${viewBoxSize}`;
  }, [labelPositions, chartDimensions.viewBoxPadding, chartDimensions.labelBandPadding]);

  return (
    <View style={[styles.categoryCard, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
      <View style={styles.categoryHeader}>
        <AppText variant="subtitle" style={[styles.categoryTitle, { color: themeColors.textSecondary }]}>
          Category Breakdown
        </AppText>
        <TouchableOpacity style={styles.infoButton} onPress={onInfoPress}>
          <Ionicons name="information-circle-outline" size={18} color={themeColors.textTertiary} />
        </TouchableOpacity>
      </View>
      
      {/* Pie Chart with external labels and connecting lines */}
      <View style={styles.pieChartContainer}>
        {/* Centered pie chart with proper sizing */}
        <Svg 
          width={PIE_SIZE} 
          height={PIE_SIZE} 
          viewBox={svgViewBox}
          style={{ alignSelf: 'center' }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Pie slices - all with exact same radius/length, meeting at exact same center point */}
          {pieData.map((item, index) => {
            // CRITICAL: All slices use the exact same PIE_RADIUS (130) and PIE_CENTER (160) constants
            // This ensures all slices have identical length and meet at the exact same center point
            // Every slice path starts at (160, 160) and extends to radius 130 - no variations
            // Slices are drawn without stroke to ensure consistent visible radius
            // Use exact constants directly - no intermediate variables that could differ
            const pathData = createPieSlice(item.startAngle, item.endAngle, PIE_RADIUS, PIE_CENTER);
            return (
              <Path
                key={`${item.category}-${item.startAngle}-${item.endAngle}`}
                d={pathData}
                fill={item.color}
                fillRule="evenodd" // Ensure consistent fill rendering across all slices
                stroke="none" // No stroke - slices touch each other
                strokeWidth={0} // No stroke width
                strokeLinejoin="miter" // Clean, straight joins for uniform gaps
                strokeLinecap="butt" // Flat caps for straight edges
                strokeMiterlimit={10} // Ensure clean miter joins
                vectorEffect="non-scaling-stroke" // Consistent stroke rendering
              />
            );
          })}
          
          {/* External labels with clean leader lines (TimeTree style) */}
          {labelPositions.map((pos) => {
            const { 
              item, 
              lineStartX,
              lineStartY,
              lineEndX,
              lineEndY,
              labelX, 
              labelY,
              fontSize,
              labelFontWeight,
              textAnchor,
              lineStrokeWidth,
              lineOpacity,
              anchorDotRadius,
              labelText,
            } = pos;
            
            return (
              <G key={`label-${item.category}`}>
                {/* Small anchor dot at slice edge (TimeTree style) */}
                <Circle
                  cx={lineStartX}
                  cy={lineStartY}
                  r={anchorDotRadius}
                  fill={item.color}
                />
                {/* Clean straight line from anchor to label */}
                <Line
                  x1={lineStartX}
                  y1={lineStartY}
                  x2={lineEndX}
                  y2={lineEndY}
                  stroke={item.color}
                  strokeWidth={lineStrokeWidth}
                  strokeLinecap="round"
                  strokeOpacity={lineOpacity}
                />
                {/* Percentage label immediately at line end */}
                <SvgText
                  x={labelX}
                  y={labelY}
                  fontSize={fontSize}
                  fontWeight={labelFontWeight}
                  fill={item.color}
                  textAnchor={textAnchor}
                  alignmentBaseline="middle"
                >
                  {labelText}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Legend - Two Column Layout */}
      <View style={styles.legendContainer}>
        <View style={styles.legendColumn}>
          {categoryData.slice(0, Math.ceil(categoryData.length / 2)).map((item) => {
            const color = CATEGORY_COLORS[item.category] || themeColors.textTertiary;
            return (
              <View key={item.category} style={styles.legendItem}>
                <View style={[styles.legendColorDot, { backgroundColor: color }]} />
                <View style={styles.legendTextContainer}>
                  <AppText 
                    variant="caption" 
                    style={[styles.legendText, { color: themeColors.textSecondary }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.category}
                  </AppText>
                </View>
                <AppText variant="caption" style={[styles.legendPercentage, { color: themeColors.text }]}>
                  {item.percentage.toFixed(0)}%
                </AppText>
              </View>
            );
          })}
        </View>
        <View style={styles.legendColumn}>
          {categoryData.slice(Math.ceil(categoryData.length / 2)).map((item) => {
            const color = CATEGORY_COLORS[item.category] || themeColors.textTertiary;
            return (
              <View key={item.category} style={styles.legendItem}>
                <View style={[styles.legendColorDot, { backgroundColor: color }]} />
                <View style={styles.legendTextContainer}>
                  <AppText 
                    variant="caption" 
                    style={[styles.legendText, { color: themeColors.textSecondary }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.category}
                  </AppText>
                </View>
                <AppText variant="caption" style={[styles.legendPercentage, { color: themeColors.text }]}>
                  {item.percentage.toFixed(0)}%
                </AppText>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});

// Streak Timeline Component
const StreakTimelineInner: React.FC<{
  events: MarkEvent[];
  marks: Mark[];
  theme: 'light' | 'dark';
  themeColors: typeof colors.light;
}> = ({ events, marks, theme, themeColors }) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const timelineData = useMemo(() => {
    // CRITICAL: Skip all calculations if arrays are too large to prevent mobile crashes
    if (!marks || !Array.isArray(marks) || marks.length === 0) {
      return [];
    }
    
    if (!events || !Array.isArray(events)) {
      return [];
    }
    
    if (events.length > 500 || marks.length > 50) {
      logger.warn('Stats: Skipping timeline calculation - data too large for mobile');
      return [];
    }
    
    try {
      const days = [];
      const today = new Date();
      const safeMarks = marks;
      const safeEvents = Array.isArray(events) ? events : [];
      
      // Early return if no data
      if (safeMarks.length === 0) {
        return [];
      }
      
      const activeMarkIds = new Set(safeMarks.filter((m) => m && !m.deleted_at).map((m) => m.id));
      
      // CRITICAL: Very strict limit for mobile - only last 200 events
      const eventsToProcess = safeEvents.slice(0, 200);
      
      // Create a map of date -> mark_ids for faster lookup
      const dateToMarksMap = new Map<string, Set<string>>();
      eventsToProcess.forEach((e) => {
        try {
          if (e && !e.deleted_at && e.event_type === 'increment' && e.occurred_local_date && e.mark_id) {
            const dateStr = e.occurred_local_date;
            if (!dateToMarksMap.has(dateStr)) {
              dateToMarksMap.set(dateStr, new Set());
            }
            dateToMarksMap.get(dateStr)!.add(e.mark_id);
          }
        } catch {
          // Skip invalid events
        }
      });

      for (let i = 29; i >= 0; i--) {
        try {
          const date = subDays(today, i);
          if (!date || isNaN(date.getTime())) continue;
          const dateStr = safeFormatDate(date);
          if (!dateStr) continue;
          
          // Use the pre-built map instead of filtering
          const dayMarks = dateToMarksMap.get(dateStr) || new Set();
          const completedMarks = Array.from(dayMarks).filter(id => activeMarkIds.has(id)).length;
          const totalMarks = activeMarkIds.size;

          let state: 'active' | 'partial' | 'inactive' | 'future';
          if (i === 0) {
            state = completedMarks > 0 ? (completedMarks === totalMarks && totalMarks > 0 ? 'active' : 'partial') : 'inactive';
          } else if (i < 0) {
            state = 'future';
          } else {
            state = completedMarks > 0 ? (completedMarks === totalMarks && totalMarks > 0 ? 'active' : 'partial') : 'inactive';
          }

          days.push({
            date,
            dateStr,
            state,
            completedMarks,
            totalMarks,
          });
        } catch (error) {
          logger.error('Error processing timeline day:', error);
          // Continue with next day
        }
      }

      return days;
    } catch (error) {
      logger.error('Error calculating timeline data:', error);
      return [];
    }
  }, [events, marks]);

  useEffect(() => {
    // Scroll to today (rightmost position) on mount - only once
    const timeoutId = setTimeout(() => {
      try {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      } catch (error) {
        logger.error('Error scrolling timeline:', error);
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  // CRITICAL: Disable animation to prevent crashes on mobile
  // const todayPulse = useSharedValue(1);
  // useEffect(() => {
  //   let isMounted = true;
  //   const pulse = () => {
  //     if (!isMounted) return;
  //     todayPulse.value = withTiming(1.1, { duration: 1000, easing: Easing.inOut(Easing.ease) }, () => {
  //       if (isMounted) {
  //         todayPulse.value = withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }, pulse);
  //       }
  //     });
  //   };
  //   pulse();
  //   return () => {
  //     isMounted = false;
  //   };
  // }, []);

  // const todayAnimatedStyle = useAnimatedStyle(() => {
  //   'worklet';
  //   return {
  //     transform: [{ scale: todayPulse.value || 1 }],
  //   };
  // });
  
  // Animation disabled - no longer needed

  return (
    <View style={[styles.timelineCard, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
      <AppText variant="body" style={[styles.timelineTitle, { color: themeColors.textSecondary }]}>
        Last 30 Days
      </AppText>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timelineScrollContent}
      >
        {timelineData.map((day, index) => {
          const isToday = index === timelineData.length - 1;
          const isSelected = selectedDay === day.dateStr;

          let backgroundColor = themeColors.surfaceVariant;
          let borderColor = themeColors.border;
          let icon: string | null = null;
          let iconColor = themeColors.text;

          if (day.state === 'active') {
            backgroundColor = themeColors.success;
            borderColor = themeColors.text;
            icon = '✓';
          } else if (day.state === 'partial') {
            backgroundColor = themeColors.primary;
            borderColor = themeColors.primary;
            icon = '•';
            if (theme === 'dark') {
              backgroundColor = `${themeColors.primary}99`;
            } else {
              backgroundColor = `${themeColors.primary}99`;
            }
          } else if (day.state === 'future') {
            backgroundColor = themeColors.surfaceVariant;
            borderColor = themeColors.border;
            if (theme === 'dark') {
              backgroundColor = `${themeColors.surfaceVariant}4D`;
            } else {
              backgroundColor = `${themeColors.surfaceVariant}4D`;
            }
          }

          // CRITICAL: Use regular View instead of Animated.View to prevent crashes
          const DayIndicator = View; // isToday ? Animated.View : View;
          const dayStyle = [styles.timelineDay, { backgroundColor, borderColor }];

          return (
            <TouchableOpacity
              key={day.dateStr}
              onPress={() => {
                setSelectedDay(isSelected ? null : day.dateStr);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.7}
            >
              <DayIndicator style={dayStyle}>
                {icon && (
                  <AppText style={[styles.timelineIcon, { color: iconColor }]}>{icon}</AppText>
                )}
              </DayIndicator>
              {index % 5 === 0 && (
                <View style={styles.timelineLabelContainer}>
                  <AppText variant="caption" style={[styles.timelineLabel, { color: themeColors.textTertiary }]}>
                    {format(day.date, 'MMM d')}
                  </AppText>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {selectedDay && (
        <View style={[styles.timelineTooltip, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <AppText variant="caption" style={{ color: themeColors.text }}>
            {safeFormatDateDisplay(timelineData.find((d) => d.dateStr === selectedDay)?.date)}
          </AppText>
          {(() => {
            const dayData = timelineData.find((d) => d.dateStr === selectedDay);
            if (dayData) {
              return (
                <AppText variant="caption" style={{ color: themeColors.textSecondary, marginTop: spacing.xs }}>
                  {dayData.completedMarks} of {dayData.totalMarks} Marks
                </AppText>
              );
            }
            return null;
          })()}
        </View>
      )}
    </View>
  );
};

const StreakTimeline = React.memo(StreakTimelineInner, (prevProps, nextProps) => {
  return (
    prevProps.events?.length === nextProps.events?.length &&
    prevProps.marks?.length === nextProps.marks?.length &&
    prevProps.theme === nextProps.theme
  );
});

// Momentum Score Component
const MomentumScoreInner: React.FC<{
  events: MarkEvent[];
  marks: Mark[];
  theme: 'light' | 'dark';
  themeColors: typeof colors.light;
  onInfoPress: () => void;
}> = ({ events, marks, theme, themeColors, onInfoPress }) => {
  const score = useMemo(() => {
    // Prevent calculation if arrays are empty or invalid
    if (!marks || !Array.isArray(marks) || marks.length === 0) {
      return 0;
    }
    
    if (!events || !Array.isArray(events)) {
      return 0;
    }
    
    // CRITICAL: Skip all calculations if arrays are too large to prevent mobile crashes
    if (events.length > 300 || marks.length > 30) {
      logger.warn('Stats: Skipping momentum score calculation - data too large for mobile');
      return 0;
    }
    
    try {
      const safeMarks = marks;
      const safeEvents = Array.isArray(events) ? events : [];
      const activeMarks = safeMarks.filter((m) => m && !m.deleted_at);
      if (activeMarks.length === 0) return 0;

      // CRITICAL: Very strict limit for mobile - only last 200 events
      const eventsToProcess = safeEvents.slice(0, 200);
      
      // Pre-filter events by mark_id for faster lookup
      const eventsByMarkId = new Map<string, MarkEvent[]>();
      eventsToProcess.forEach((e) => {
        if (e && !e.deleted_at && e.mark_id) {
          if (!eventsByMarkId.has(e.mark_id)) {
            eventsByMarkId.set(e.mark_id, []);
          }
          eventsByMarkId.get(e.mark_id)!.push(e);
        }
      });

      // Calculate streak consistency (40% weight)
      // CRITICAL: Very strict limit for mobile - only 5 marks with streaks
      const marksWithStreaks = activeMarks.filter((m) => m && m.enable_streak).slice(0, 5);
      const streaks: number[] = [];
      
      // Process streaks with error handling
      for (const m of marksWithStreaks) {
        try {
          const markEvents = eventsByMarkId.get(m.id) || [];
          if (markEvents.length === 0) {
            streaks.push(0);
            continue;
          }
          // CRITICAL: Very strict limit for mobile - only 50 events per mark
          const limitedEvents = markEvents.slice(0, 50);
          const streakData = computeStreak(limitedEvents as any);
          streaks.push(streakData?.current || 0);
        } catch (error) {
          logger.error('Error calculating streak for mark:', m.id, error);
          streaks.push(0);
        }
      }
      const avgStreak = streaks.length > 0 ? streaks.reduce((sum, s) => sum + s, 0) / streaks.length : 0;
      const maxStreak = streaks.length > 0 ? Math.max(...streaks, 30) : 30;
      const streakScore = maxStreak > 0 ? Math.min((avgStreak / maxStreak) * 40, 40) : 0;

      // Calculate daily completion % (35% weight)
      let last7Days: Date;
      try {
        last7Days = subDays(new Date(), 7);
      } catch {
        return 0;
      }
      
      // Use the already filtered eventsToProcess
      const recentEvents = eventsToProcess.filter(
        (e) => {
          try {
            if (!e || e.deleted_at || e.event_type !== 'increment' || !e.occurred_at) return false;
            const eventDate = new Date(e.occurred_at);
            return !isNaN(eventDate.getTime()) && eventDate >= last7Days;
          } catch {
            return false;
          }
        }
      );
      const dailyCompletions: number[] = [];
      const today = new Date();
      
      // Pre-calculate date strings to avoid repeated subDays calls
      const dateStrings: string[] = [];
      for (let i = 6; i >= 0; i--) {
        try {
          const date = subDays(today, i);
          if (!date || isNaN(date.getTime())) {
            dateStrings.push('');
            continue;
          }
          const dateStr = safeFormatDate(date);
          dateStrings.push(dateStr || '');
        } catch {
          dateStrings.push('');
        }
      }
      
      // Build a map of date -> mark_ids for faster lookup
      const dateToMarksMap = new Map<string, Set<string>>();
      recentEvents.forEach((e) => {
        if (e && e.occurred_local_date && e.mark_id) {
          if (!dateToMarksMap.has(e.occurred_local_date)) {
            dateToMarksMap.set(e.occurred_local_date, new Set());
          }
          dateToMarksMap.get(e.occurred_local_date)!.add(e.mark_id);
        }
      });
      
      // Calculate completions using the map
      for (const dateStr of dateStrings) {
        if (!dateStr) {
          dailyCompletions.push(0);
          continue;
        }
        try {
          const dayMarks = dateToMarksMap.get(dateStr) || new Set();
          const completion = activeMarks.length > 0 ? (dayMarks.size / activeMarks.length) * 100 : 0;
          dailyCompletions.push(completion);
        } catch (error) {
          logger.error('Error calculating daily completion:', error);
          dailyCompletions.push(0);
        }
      }
      const avgCompletion = dailyCompletions.length > 0 ? dailyCompletions.reduce((sum, c) => sum + c, 0) / dailyCompletions.length : 0;
      const completionScore = (avgCompletion / 100) * 35;

      // Calculate intensity (25% weight)
      const activeMarkIds = new Set(
        recentEvents.map((e) => e?.mark_id).filter((id) => id && activeMarks.some((m) => m.id === id))
      );
      const intensityScore = activeMarks.length > 0 ? (activeMarkIds.size / activeMarks.length) * 25 : 0;

      return Math.round(streakScore + completionScore + intensityScore);
    } catch (error) {
      logger.error('Error calculating momentum score:', error);
      return 0;
    }
  }, [events, marks]);

  const [displayScore, setDisplayScore] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const previousScoreRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    
    // Only animate if score actually changed
    if (score === previousScoreRef.current) {
      return () => {
        isMounted = false;
      };
    }

    // Cleanup any existing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Animate from previous score to new score
    let startTime: number | null = null;
    const duration = 1000;
    const startValue = previousScoreRef.current;
    const endValue = score;

    const animate = (timestamp: number) => {
      if (!isMounted) {
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }

      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Simple easing function (ease-out cubic) - no need for Easing library
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + (endValue - startValue) * eased);
      
      if (isMounted) {
        setDisplayScore(currentValue);
      }

      if (progress < 1 && isMounted) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        if (isMounted) {
          previousScoreRef.current = endValue;
        }
        animationFrameRef.current = null;
      }
    };

    if (isMounted) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    // Cleanup on unmount or when score changes
    return () => {
      isMounted = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [score]);

  // Initialize display score on mount - only once
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && score > 0) {
      initializedRef.current = true;
      previousScoreRef.current = score;
      setDisplayScore(score);
    }
  }, [score]);

  let scoreColor = themeColors.textTertiary;
  let scoreLabel = 'Building Momentum';
  if (score >= 71) {
    scoreColor = themeColors.success;
    scoreLabel = 'Strong Momentum';
  } else if (score >= 41) {
    scoreColor = themeColors.primary;
    scoreLabel = 'Steady Progress';
  }

  return (
    <View style={[styles.momentumCard, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
      <View style={styles.momentumHeader}>
        <AppText variant="body" style={[styles.momentumLabel, { color: themeColors.textSecondary }]}>
          Momentum Score
        </AppText>
        <TouchableOpacity style={styles.infoButton} onPress={onInfoPress}>
          <Ionicons name="information-circle-outline" size={18} color={themeColors.textTertiary} />
        </TouchableOpacity>
      </View>
      <View style={styles.momentumContent}>
        <View
          style={[
            styles.momentumScoreBackground,
            {
              backgroundColor: `${scoreColor}26`,
              borderColor: scoreColor,
            },
          ]}
        >
          <AppText
            variant="display"
            style={[
              styles.momentumScore,
              {
                color: themeColors.text,
                fontSize: fontSize['3xl'],
                fontWeight: fontWeight.bold,
              },
            ]}
          >
            {displayScore}
          </AppText>
        </View>
        <AppText variant="caption" style={[styles.momentumSubLabel, { color: scoreColor }]}>
          {scoreLabel}
        </AppText>
      </View>
    </View>
  );
};

const MomentumScore = React.memo(MomentumScoreInner, (prevProps, nextProps) => {
  return (
    prevProps.events?.length === nextProps.events?.length &&
    prevProps.marks?.length === nextProps.marks?.length &&
    prevProps.theme === nextProps.theme
  );
});

// Best Day / Average Day Component
const BestAverageDayInner: React.FC<{
  events: MarkEvent[];
  marks: Mark[];
  theme: 'light' | 'dark';
  themeColors: typeof colors.light;
}> = ({ events, marks, theme, themeColors }) => {
  const { bestDay, averageDay } = useMemo(() => {
    // Prevent calculation if arrays are empty or invalid
    if (!marks || !Array.isArray(marks) || marks.length === 0) {
      return {
        bestDay: null,
        averageDay: 0,
      };
    }
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return {
        bestDay: null,
        averageDay: 0,
      };
    }
    
    // CRITICAL: Skip all calculations if arrays are too large to prevent mobile crashes
    if (events.length > 300 || marks.length > 30) {
      logger.warn('Stats: Skipping best/average day calculation - data too large for mobile');
      return {
        bestDay: null,
        averageDay: 0,
      };
    }
    
    try {
      const safeMarks = marks;
      const safeEvents = events;
      
      const activeMarkIds = new Set(safeMarks.filter((m) => m && !m.deleted_at).map((m) => m.id));
      const dayCounts: Record<string, Set<string>> = {};

      // CRITICAL: Very strict limit for mobile - only last 200 events
      const eventsToProcess = safeEvents.slice(0, 200);
      
      eventsToProcess
        .filter((e) => e && !e.deleted_at && e.event_type === 'increment' && e.occurred_local_date)
        .forEach((e) => {
          if (e.mark_id && activeMarkIds.has(e.mark_id)) {
            if (!dayCounts[e.occurred_local_date]) {
              dayCounts[e.occurred_local_date] = new Set();
            }
            dayCounts[e.occurred_local_date].add(e.mark_id);
          }
        });

      // Convert Sets to counts
      const dayCountsArray = Object.entries(dayCounts).map(([date, uniqueMarks]) => ({
        date,
        count: uniqueMarks.size,
      }));

      // Find best day
      const best = dayCountsArray.reduce(
        (max, day) => (day.count > max.count ? day : max),
        { date: '', count: 0 }
      );

      // Calculate average for last 7 days
      const last7Days = subDays(new Date(), 7);
      const recentDays = dayCountsArray.filter((d) => {
        try {
          return d.date && new Date(d.date) >= last7Days;
        } catch {
          return false;
        }
      });
      const average = recentDays.length > 0
        ? recentDays.reduce((sum, d) => sum + d.count, 0) / 7
        : 0;

      return {
        bestDay: best.count > 0 ? { date: best.date, count: best.count } : null,
        averageDay: average,
      };
    } catch (error) {
      logger.error('Error calculating best/average day:', error);
      return {
        bestDay: null,
        averageDay: 0,
      };
    }
  }, [events, marks]);

  return (
    <View style={styles.bestAverageContainer}>
      <View style={[styles.bestAverageCard, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
        <AppText variant="caption" style={[styles.bestAverageLabel, { color: themeColors.textSecondary }]}>
          Best Day
        </AppText>
        {bestDay ? (
          <>
            <AppText
              variant="body"
              style={[
                styles.bestAverageDate,
                { color: themeColors.text, fontWeight: fontWeight.semibold },
              ]}
            >
              {safeFormatDateDisplay(bestDay.date)}
            </AppText>
            <AppText variant="body" style={[styles.bestAverageValue, { color: themeColors.text }]}>
              {bestDay.count} Marks
            </AppText>
            <View style={[styles.bestBadge, { backgroundColor: `${themeColors.success}33` }]}>
              <AppText variant="caption" style={[styles.bestBadgeText, { color: themeColors.success }]}>
                🏆 Best
              </AppText>
            </View>
          </>
        ) : (
          <AppText variant="caption" style={[styles.emptyText, { color: themeColors.textTertiary }]}>
            No data
          </AppText>
        )}
      </View>

      <View style={[styles.bestAverageCard, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
        <AppText variant="caption" style={[styles.bestAverageLabel, { color: themeColors.textSecondary }]}>
          Average Day
        </AppText>
        <AppText variant="caption" style={[styles.bestAveragePeriod, { color: themeColors.textTertiary }]}>
          Last 7 days
        </AppText>
        <AppText variant="body" style={[styles.bestAverageValue, { color: themeColors.text }]}>
          {averageDay.toFixed(1)} Marks
        </AppText>
      </View>
    </View>
  );
};

const BestAverageDay = React.memo(BestAverageDayInner, (prevProps, nextProps) => {
  return (
    prevProps.events?.length === nextProps.events?.length &&
    prevProps.marks?.length === nextProps.marks?.length &&
    prevProps.theme === nextProps.theme
  );
});

export default function StatsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme] || colors.light;
  const { counters } = useCounters();
  const eventsStore = useEventsStore();
  const { user } = useAuth();
  // Memoize events and counters - use the actual array reference to detect changes
  // This ensures recalculation when events are added, even if length stays the same
  const events = useMemo(() => {
    try {
      return (eventsStore && Array.isArray(eventsStore.events)) ? eventsStore.events : [];
    } catch {
      return [];
    }
  }, [eventsStore?.events]); // Use the actual array reference, not just length
  
  const safeCounters = useMemo(() => {
    try {
      return Array.isArray(counters) ? counters : [];
    } catch {
      return [];
    }
  }, [counters]); // Use the actual array reference, not just length
  
  const loadEvents = eventsStore?.loadEvents;

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');

  // Track current date to detect midnight reset
  const [currentDate, setCurrentDate] = useState(() => safeFormatDate(new Date()));

  // Update date when it changes (midnight reset)
  useEffect(() => {
    const checkDateChange = () => {
      const today = safeFormatDate(new Date());
      if (today && today !== currentDate) {
        setCurrentDate(today);
      }
    };

    // Check immediately
    checkDateChange();

    // Set up interval to check every minute (to catch midnight)
    const intervalId = setInterval(checkDateChange, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, [currentDate]);

  // Ensure events are loaded - only once when component mounts or user changes
  const eventsLoadedRef = useRef(false);
  const loadEventsRef = useRef(loadEvents);
  loadEventsRef.current = loadEvents;
  
  useEffect(() => {
    if (user?.id && loadEventsRef.current && !eventsLoadedRef.current) {
      eventsLoadedRef.current = true;
      // Load only last 5000 events (approximately 90 days) to reduce I/O
      loadEventsRef.current(undefined, user.id, 5000).catch((error) => {
        logger.error('Error loading events in stats screen:', error);
        eventsLoadedRef.current = false; // Allow retry on error
      });
    }
    // Reset when user changes
    if (!user?.id) {
      eventsLoadedRef.current = false;
    }
  }, [user?.id]);

  const showModal = (title: string, message: string) => {
    logger.info('Showing modal:', { title, messageLength: message?.length });
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  // Daily marks count calculation - tracks total increment amount for today
  // Resets automatically at midnight when the date changes
  // Use a dependency key that includes event IDs to ensure recalculation when new events are added
  const dailyMarksKey = useMemo(() => {
    if (!events || events.length === 0) return `no-events-${currentDate}`;
    // Use the first 20 most recent event IDs as a dependency key
    // This ensures recalculation when new events are added, even if array length stays the same
    const recentEventIds = events
      .slice(0, 20)
      .map(e => e?.id)
      .filter(Boolean)
      .join(',');
    // Include current date to trigger recalculation at midnight
    return `${recentEventIds}-${currentDate}`;
  }, [events, currentDate]);

  const dailyMarksCount = useMemo(() => {
    try {
      // Use currentDate state which updates at midnight
      // This count persists even after manual resets - it only resets when the date changes
      if (!currentDate) return 0;
      
      const safeEvents = Array.isArray(events) ? events : [];
      const safeCounters = Array.isArray(counters) ? counters : [];
      
      // Create a set of active (non-deleted) mark IDs for validation
      const activeMarkIds = new Set(
        safeCounters
          .filter((c) => c && !c.deleted_at)
          .map((c) => c.id)
      );
      
      // Count unique marks that have been incremented today
      // IMPORTANT: This count persists even if a mark is manually reset
      // The count only resets when the date changes (daily reset at midnight)
      // Only count marks that:
      // 1. Still exist (are in activeMarkIds) - marks that were deleted don't count
      // 2. Have increment events today (regardless of reset events)
      // 3. Are not deleted
      // Note: Reset events do NOT affect this count - we only look at increment events
      const marksIncrementedToday = new Set<string>();
      
      safeEvents.forEach((e) => {
        try {
          // Only count increment events from today
          // Reset events are ignored - they don't affect the daily count
          if (e && 
              !e.deleted_at && 
              e.event_type === 'increment' && // Only increment events count
              e.occurred_local_date && 
              e.occurred_local_date === currentDate &&
              e.mark_id &&
              activeMarkIds.has(e.mark_id)) { // Only count if mark still exists and is active
            marksIncrementedToday.add(e.mark_id);
          }
        } catch {
          // Skip invalid events
        }
      });
      
      return marksIncrementedToday.size;
    } catch (error) {
      logger.error('Error calculating daily marks count:', error);
      return 0;
    }
  }, [dailyMarksKey, currentDate, counters]); // Include counters to react to mark deletions

  // Show loading state only if data is not yet available
  if (!events || !safeCounters) {
    return (
      <ErrorBoundary>
        <LoadingScreen />
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <GradientBackground>
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <AppText variant="headline" style={[styles.title, { color: themeColors.text }]}>
                  Statistics
                </AppText>
                <AppText variant="body" style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                  Your week at a glance
                </AppText>
              </View>
              {APP_BRAND_LOGO_LIGHT && APP_BRAND_LOGO_DARK && (
                <Image
                  source={theme === 'dark' ? APP_BRAND_LOGO_DARK : APP_BRAND_LOGO_LIGHT}
                  style={styles.brandLogo}
                  resizeMode="contain"
                  onError={() => logger.error('Error loading brand logo')}
                />
              )}
            </View>

            {/* Daily Marks Count Ring */}
            <View style={[styles.card, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
              <DailyMarksRing
                count={dailyMarksCount}
                activeMarksCount={safeCounters.filter((c) => c && !c.deleted_at).length}
                theme={theme}
                themeColors={themeColors}
                onInfoPress={() => {
                  showModal(
                    'Marks Today',
                    'This card tracks how many of your active marks you\'ve incremented today.\n\nThe number shows "X/Y" where:\n• X = Number of unique marks you\'ve incremented today\n• Y = Total number of active marks you have\n\nThe ring fills up as you complete more marks throughout the day, giving you a visual representation of your daily progress.\n\nNote: This count resets automatically at midnight each day, so you can start fresh every morning!'
                  );
                }}
              />
            </View>

            {/* Category Breakdown */}
            {events && safeCounters && (
              <CategoryBreakdown
                events={events}
                marks={safeCounters}
                theme={theme}
                themeColors={themeColors}
                onInfoPress={() => {
                  showModal(
                    'Category Breakdown',
                    'This visualization shows how your activity is distributed across different categories over the last 30 days.\n\nEach colored segment represents the percentage of your increment events that belong to that category. The larger the segment, the more activity you\'ve had in that area.\n\nCategories are automatically assigned when your Mark names match our suggested categories (Fitness, Wellness, Learning & Growth, Productivity, or Habit Breaking). Marks that don\'t match any category are grouped as "Uncategorized".\n\nThis helps you see which areas of your life you\'re focusing on most and identify areas where you might want to increase your activity.'
                  );
                }}
              />
            )}
          </ScrollView>
          {/* Info Modal */}
          <InfoModal visible={modalVisible} title={modalTitle} message={modalMessage} onClose={closeModal} />
        </SafeAreaView>
      </GradientBackground>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    marginBottom: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {},
  brandLogo: {
    width: 60,
    height: 60,
  },
  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.card,
    marginBottom: spacing.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Daily Completion Ring
  ringWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  ringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.md,
  },
  ringHeaderTitle: {
    fontSize: fontSize.base,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  ringContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNumber: {
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
  },
  ringLabel: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
  },
  // Category Breakdown
  categoryCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.card,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  categoryTitle: {
    fontSize: fontSize.base,
  },
  infoButton: {
    padding: spacing.xs,
  },
  // Pie chart styles
  pieChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    paddingVertical: spacing.md,
    width: '100%',
    overflow: 'hidden', // Clip labels that extend beyond container
    minHeight: 380, // Ensure adequate space for larger chart (PIE_SIZE + padding)
  },
  // Legend styles - Two Column Layout
  legendContainer: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  legendColumn: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0, // Important for flexbox truncation in columns
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 24,
    width: '100%',
  },
  legendColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    flexShrink: 0,
  },
  legendTextContainer: {
    flex: 1,
    minWidth: 0, // Critical for flexbox text truncation
    marginRight: spacing.xs,
    overflow: 'hidden', // Prevent text overflow
  },
  legendText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  legendPercentage: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    flexShrink: 0,
    marginLeft: spacing.xs,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  // Streak Timeline
  timelineCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.card,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  timelineTitle: {
    fontSize: fontSize.base,
    marginBottom: spacing.md,
  },
  timelineScrollContent: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  timelineDay: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  timelineIcon: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  timelineLabelContainer: {
    width: 24,
    marginRight: spacing.sm,
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  timelineTooltip: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  // Momentum Score
  momentumCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.card,
    marginBottom: spacing.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  momentumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.md,
  },
  momentumLabel: {
    fontSize: fontSize.base,
  },
  momentumContent: {
    alignItems: 'center',
  },
  momentumScoreBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  momentumScore: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
  },
  momentumSubLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  // Best/Average Day
  bestAverageContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  bestAverageCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.card,
    borderWidth: 1,
  },
  bestAverageLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  bestAverageDate: {
    fontSize: fontSize.base,
    marginBottom: spacing.xs,
  },
  bestAveragePeriod: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  bestAverageValue: {
    fontSize: fontSize.lg,
    marginBottom: spacing.xs,
  },
  bestBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
  },
  bestBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
});
