import {tx} from "../../i18n";
import { Tabs } from "expo-router";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RovaIcon } from "../../components/RovaIcon";
import { ScrollMenuProvider, ScrollTabBar } from '../../components/ScrollMenuProvider';
import { useRovaTheme } from "../../theme/ThemeProvider";

const tabItems = {
  map: { title: tx('tab.map'), icon: "map" },
  reports: { title: tx('tab.reports'), icon: "reports" },
  saved: { title: tx('tab.saved'), icon: "saved" },
  contribute: { title: 'Contribute', icon: 'contribute' },
  settings: { title: tx('tab.settings'), icon: "settings" },
} as const;
export const unstable_settings={initialRouteName:'map'};

export default function TabLayout() {
  const { theme } = useRovaTheme();
  const insets = useSafeAreaInsets();
  const {fontScale}=useWindowDimensions();
  const iconSize = Math.min(25, 18 + fontScale * 2);
  const barHeight = Math.max(70, Math.ceil(62 * Math.min(fontScale, 2))) + insets.bottom;

  return (
    <ScrollMenuProvider height={barHeight}><Tabs
      backBehavior="firstRoute"
      tabBar={props => <ScrollTabBar {...props} />}
      screenOptions={({ route }) => {
        const item = tabItems[route.name as keyof typeof tabItems] ?? tabItems.map;
        return {
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: theme.colors.brandStrong,
          tabBarInactiveTintColor: theme.colors.inkMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            height: barHeight,
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
      <Tabs.Screen name="map" options={{ title: 'Explore' }} />
      <Tabs.Screen name="reports" options={{ title: tabItems.reports.title, href: null }} />
      <Tabs.Screen name="saved" options={{ title: tabItems.saved.title }} />
      <Tabs.Screen name="contribute" options={{ title: tabItems.contribute.title }} />
      <Tabs.Screen name="settings" options={{ title: tabItems.settings.title }} />
    </Tabs></ScrollMenuProvider>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
});
