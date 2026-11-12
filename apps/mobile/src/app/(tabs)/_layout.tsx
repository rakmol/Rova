import {tx} from "../../i18n";
import { Tabs } from "expo-router";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RovaIcon } from "../../components/RovaIcon";
import { useRovaTheme } from "../../theme/ThemeProvider";

const tabItems = {
  map: { title: tx('tab.map'), icon: "map" },
  reports: { title: tx('tab.reports'), icon: "reports" },
  saved: { title: tx('tab.saved'), icon: "saved" },
  settings: { title: tx('tab.settings'), icon: "settings" },
} as const;

export default function TabLayout() {
  const { theme } = useRovaTheme();
  const insets = useSafeAreaInsets();
  const {fontScale}=useWindowDimensions();
  const iconSize = Math.min(25, 18 + fontScale * 2);

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
            height: Math.max(70, Math.ceil(62 * Math.min(fontScale, 2))) + insets.bottom,
            paddingTop: 6,
            paddingBottom: 6 + insets.bottom,
          },
          tabBarLabelStyle: styles.label,
          tabBarAllowFontScaling: true,
          tabBarItemStyle: {minHeight:48},
          tabBarAccessibilityLabel: item.title,
          tabBarIcon: ({ color }) => (
            <RovaIcon name={item.icon} color={color ?? theme.colors.inkMuted} size={iconSize} />
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
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
});
