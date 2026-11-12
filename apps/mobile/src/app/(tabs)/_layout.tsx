import {tx} from "../../i18n";
import { Tabs } from "expo-router";
import { StyleSheet, Text, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRovaTheme } from "../../theme/ThemeProvider";

const tabItems = {
  map: { title: tx('tab.map'), symbol: "⌖" },
  reports: { title: tx('tab.reports'), symbol: "!" },
  saved: { title: tx('tab.saved'), symbol: "♡" },
  settings: { title: tx('tab.settings'), symbol: "⚙" },
} as const;

export default function TabLayout() {
  const { theme } = useRovaTheme();
  const insets = useSafeAreaInsets();
  const {fontScale}=useWindowDimensions();

  return (
    <Tabs
      screenOptions={({ route }) => {
        const item = tabItems[route.name as keyof typeof tabItems] ?? tabItems.map;
        return {
          headerShown: false,
          tabBarActiveTintColor: theme.colors.brandStrong,
          tabBarInactiveTintColor: theme.colors.inkMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            height: Math.max(66,Math.ceil(36+24*fontScale)) + insets.bottom,
            paddingTop: 7,
            paddingBottom: 8 + insets.bottom,
          },
          tabBarLabelStyle: [styles.label,fontScale>=1.5&&{fontSize:11}],
          tabBarAllowFontScaling: true,
          tabBarItemStyle: {minHeight:48},
          tabBarAccessibilityLabel: item.title,
          tabBarIcon: ({ color, focused }) => (
            <Text
              accessible={false}
              style={[
                styles.icon,
                { color },
                focused && { backgroundColor: theme.colors.brandTint },
              ]}
            >
              {item.symbol}
            </Text>
          ),
        };
      }}
    >
      <Tabs.Screen name="map" options={{ title: tabItems.map.title }} />
      <Tabs.Screen name="reports" options={{ title: tabItems.reports.title }} />
      <Tabs.Screen name="saved" options={{ title: tabItems.saved.title }} />
      <Tabs.Screen name="settings" options={{ title: tabItems.settings.title }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 34,
    height: 28,
    borderRadius: 14,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 20,
    overflow: "hidden",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
});
