import type { ReactNode, RefObject } from "react";
import { useMemo } from 'react';
import { useScrollMenu } from './ScrollMenuContext';
import { scrollMenu } from './scrollMenu';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import { DrivingGate } from "../safety/DrivingGate";
import { NetworkNotice } from "../offline/NetworkNotice";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRovaTheme } from "../theme/ThemeProvider";

export function Page({
  children,
  scrollRef,
  onScroll,
  extraBottomPadding = 0,
}: {
  children: ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  extraBottomPadding?: number;
}) {
  const { theme } = useRovaTheme();
  const menu = useScrollMenu();
  const trackScroll = useMemo(() => scrollMenu(menu.setHidden), [menu.setHidden]);
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: theme.spacing.xl + extraBottomPadding + menu.height },
        ]}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        onScroll={event => { trackScroll(event.nativeEvent.contentOffset.y); onScroll?.(event); }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <DrivingGate>
          <NetworkNotice />
          {children}
        </DrivingGate>
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  const { theme } = useRovaTheme();
  return (
    <View style={styles.pageHeader}>
      <Text style={[styles.eyebrow, { color: theme.colors.brandStrong }]}>{eyebrow}</Text>
      <Text
        accessibilityRole="header"
        style={[
          styles.pageTitle,
          {
            color: theme.colors.ink,
            fontSize: theme.typography.title,
            lineHeight: Math.ceil(theme.typography.title * 1.22),
          },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.pageSubtitle,
          {
            color: theme.colors.inkMuted,
            lineHeight: theme.typography.bodyLine,
          },
        ]}
      >
        {subtitle}
      </Text>
    </View>
  );
}

export function Surface({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  const { theme } = useRovaTheme();
  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.divider,
          borderRadius: theme.radii.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Pill({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "warning" | "neutral";
}) {
  const { theme } = useRovaTheme();
  const toneColors = {
    brand: [theme.colors.brandTint, theme.colors.brandStrong],
    warning: [theme.colors.warningTint, theme.colors.warning],
    neutral: [theme.colors.surfaceRaised, theme.colors.inkMuted],
  } as const;
  const [backgroundColor, color] = toneColors[tone];

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor, borderRadius: theme.radii.pill, maxWidth: "100%" },
      ]}
    >
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

export function ActionButton({
  title,
  onPress,
  disabled = false,
  secondary = false,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
}) {
  const { theme } = useRovaTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: secondary ? theme.colors.surfaceRaised : theme.colors.brand,
          borderColor: secondary ? theme.colors.border : theme.colors.brand,
          opacity: disabled ? 0.55 : pressed ? 0.82 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          {
            color: secondary
              ? theme.colors.ink
              : theme.mode === "dark"
                ? "#0D1D26"
                : "#FFFFFF",
            fontSize: theme.typography.body,
          },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function ContentFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return <View style={[styles.contentFrame, width >= 720 && styles.wideFrame]}>{children}</View>;
}

export type AppFeedbackState =
  | "loading"
  | "error"
  | "permissionDenied"
  | "unavailable";

const feedbackCopy: Record<AppFeedbackState, { title: string; tone: "info" | "warning" | "error" }> = {
  loading: { title: "Loading", tone: "info" },
  error: { title: "Something went wrong", tone: "error" },
  permissionDenied: { title: "Permission is off", tone: "warning" },
  unavailable: { title: "Not available yet", tone: "info" },
};

export function FeedbackMessage({
  state,
  message,
}: {
  state: AppFeedbackState;
  message: string;
}) {
  const { theme } = useRovaTheme();
  const copy = feedbackCopy[state];
  const colors = {
    info: [theme.colors.brandTint, theme.colors.brandStrong],
    warning: [theme.colors.warningTint, theme.colors.warning],
    error: [theme.colors.surfaceRaised, theme.colors.danger],
  } as const;
  const [backgroundColor, accentColor] = colors[copy.tone];

  return (
    <View
      accessibilityLiveRegion={state === "loading" ? "polite" : "assertive"}
      accessibilityRole={state === "error" || state === "permissionDenied" ? "alert" : "summary"}
      style={[styles.feedback, { backgroundColor }]}
    >
      <Text style={[styles.feedbackTitle, { color: accentColor }]}>{copy.title}</Text>
      <Text style={[styles.feedbackMessage, { color: theme.colors.inkMuted }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  contentFrame: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  wideFrame: {
    maxWidth: 720,
    paddingHorizontal: 32,
  },
  pageHeader: {
    paddingTop: 16,
    paddingBottom: 22,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  pageTitle: {
    marginTop: 8,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.7,
    lineHeight: 39,
  },
  pageSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  surface: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  actionButton: {
    minHeight: 54,
    minWidth: 48,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
  feedback: {
    borderRadius: 16,
    padding: 14,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  feedbackMessage: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
});
