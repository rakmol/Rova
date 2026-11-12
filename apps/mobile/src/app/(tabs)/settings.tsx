import { Pressable, StyleSheet, Text, View } from "react-native";
import { ContentFrame, Page, PageHeader, Surface } from "../../components/ui";
import { useRovaTheme } from "../../theme/ThemeProvider";
import type { ThemeMode } from "../../theme/theme";
import { useRoutePreview } from "../../map/RouteProvider";
import { vehicleLabels } from "../../navigation/SmartAlertPanel";
import type { VehicleClass } from "@rova/shared";
import { AccountControls } from '../../account/AccountControls';
import {NotificationSettings} from "../../notifications/NotificationSettings";
import {OfflineSettings} from "../../offline/OfflineSettings";
import { DriverSettings } from '../../account/DriverSettings';

const themeOptions: { label: string; value: ThemeMode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export default function SettingsScreen() {
  const { mode, setMode, theme } = useRovaTheme();
  const { vehicleType, setVehicleType } = useRoutePreview();

  return (
    <Page>
      <ContentFrame>
        <PageHeader
          eyebrow="Preferences"
          title="Settings"
          subtitle="Make ROVA feel right for you."
        />

        <AccountControls/>
        <DriverSettings/>
        <OfflineSettings/>
        <NotificationSettings/>
        <Text style={[styles.sectionLabel, { color: theme.colors.inkMuted }]}>
          APPEARANCE
        </Text>
        <Surface style={styles.settingCard}>
          <Text style={[styles.settingTitle, { color: theme.colors.ink }]}>
            Theme
          </Text>
          <Text style={[styles.settingDescription, { color: theme.colors.inkMuted }]}>
            Choose a comfortable display. System follows your device setting.
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Choose app appearance"
            style={styles.optionRow}
          >
            {themeOptions.map((option) => {
              const selected = mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setMode(option.value)}
                  style={[
                    styles.option,
                    {
                      backgroundColor: selected ? theme.colors.brandTint : theme.colors.surfaceRaised,
                      borderColor: selected ? theme.colors.brand : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.brandStrong : theme.colors.inkMuted,
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Surface>

        <Surface style={styles.settingCard}>
          <Text style={[styles.settingTitle, { color: theme.colors.ink }]}>Vehicle for speed-limit alerts</Text>
          <Text style={[styles.settingDescription, { color: theme.colors.inkMuted }]}>Choose before driving. Applies to verified compliance limits; routing remains general driving guidance. Kept for this app session.</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Vehicle class" style={{ gap: 8 }}>
            {(Object.keys(vehicleLabels) as VehicleClass[]).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: value === vehicleType }} onPress={() => setVehicleType(value)} style={[styles.option, { backgroundColor: value === vehicleType ? theme.colors.brandTint : theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.ink }}>{vehicleLabels[value]}</Text>
            </Pressable>)}
          </View>
        </Surface>
        <Text style={[styles.sectionLabel, styles.spacedSection, { color: theme.colors.inkMuted }]}>
          PRIVACY & SAFETY
        </Text>
        <Surface style={styles.settingCard}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={[styles.settingTitle, { color: theme.colors.ink }]}>
                Location
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.inkMuted }]}>
                Foreground location is used for locating you, navigation and reporting.
                See the permission status and phone controls above.
              </Text>
            </View>
            <View style={[styles.stateBadge, { backgroundColor: theme.colors.surfaceRaised }]}>
              <Text style={[styles.stateText, { color: theme.colors.inkSubtle }]}>OPTIONAL</Text>
            </View>
          </View>
        </Surface>

        <Surface style={[styles.settingCard, styles.aboutCard]}>
          <Text style={[styles.settingTitle, { color: theme.colors.ink }]}>About ROVA</Text>
          <Text style={[styles.settingDescription, { color: theme.colors.inkMuted }]}>
            Built for Ghana. Verified speed limits are labelled separately from community
            road and enforcement reports.
          </Text>
          <Text style={[styles.version, { color: theme.colors.inkSubtle }]}>
            ROVA · Preview
          </Text>
        </Surface>
      </ContentFrame>
    </Page>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: 11,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  spacedSection: {
    marginTop: 25,
  },
  settingCard: {
    borderRadius: 20,
    padding: 17,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  settingDescription: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  option: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowCopy: {
    flex: 1,
  },
  stateBadge: {
    minWidth: 44,
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stateText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  aboutCard: {
    marginTop: 25,
  },
  version: {
    marginTop: 16,
    fontSize: 11,
    fontWeight: "700",
  },
});
