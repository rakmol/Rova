import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton, ContentFrame, Page, PageHeader, Surface } from '../../components/ui';
import { RovaIcon } from '../../components/RovaIcon';
import { VehicleSelector } from '../../components/VehicleSelector';
import { useRovaTheme } from '../../theme/ThemeProvider';
import type { ThemeMode } from '../../theme/theme';
import { useRoutePreview } from '../../map/RouteProvider';
import { AccountControls } from '../../account/AccountControls';
import { NotificationSettings } from '../../notifications/NotificationSettings';
import { OfflineSettings } from '../../offline/OfflineSettings';
import { DriverSettings } from '../../account/DriverSettings';
import { PilotSettings } from '../../pilot/PilotSettings';

const sections = [
  { id: 'navigation', title: 'Navigation & voice', description: 'Vehicle, spoken guidance, language and units', icon: 'navigation' },
  { id: 'appearance', title: 'Appearance', description: 'Light, dark or your phone’s theme', icon: 'appearance' },
  { id: 'privacy', title: 'Location & privacy', description: 'Permissions, search history and erase phone data', icon: 'privacy' },
  { id: 'account', title: 'Account', description: 'Optional sign-in and account data', icon: 'account' },
  { id: 'offline', title: 'Offline & data', description: 'Saved routes, downloads and freshness', icon: 'offline' },
  { id: 'notifications', title: 'Notifications & reminders', description: 'Road updates and vehicle renewal reminders', icon: 'notifications' },
  { id: 'pilot', title: 'Beta & diagnostics', description: 'Optional quality reporting and pilot information', icon: 'pilot' },
  { id: 'about', title: 'About ROVA', description: 'Road safety and app information', icon: 'about' },
] as const;
type Section = typeof sections[number]['id'];
const themeOptions: { label: string; value: ThemeMode }[] = [{ label: 'System', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }];

export default function SettingsScreen() {
  const { mode, setMode, theme } = useRovaTheme();
  const { vehicleType, setVehicleType } = useRoutePreview();
  const [section, setSection] = useState<Section | null>(null);
  const selected = sections.find(item => item.id === section);
  const ink = { color: theme.colors.ink }, muted = { color: theme.colors.inkMuted };
  return <Page key={section ?? 'menu'}><ContentFrame>
    {section && <View style={styles.back}><ActionButton title="All settings" secondary onPress={() => setSection(null)} /></View>}
    <PageHeader eyebrow="Your ROVA" title={selected?.title ?? 'Settings'} subtitle={selected?.description ?? 'Everything you need, a tap away.'} />
    {!section && <Surface style={styles.menu}>
      {sections.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={item.description} onPress={() => setSection(item.id)} style={({ pressed }) => [styles.menuRow, { borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: theme.colors.border, backgroundColor: pressed ? theme.colors.brandTint : theme.colors.surface }]}>
        <View style={[styles.menuIcon, { backgroundColor: theme.colors.brandTint }]}>
          <RovaIcon name={item.icon} color={theme.colors.brandStrong} size={21} />
        </View>
        <View style={styles.copy}><Text style={[styles.title, ink]}>{item.title}</Text><Text style={[styles.description, muted]}>{item.description}</Text></View>
        <RovaIcon name="chevron" color={theme.colors.inkSubtle} size={18} />
      </Pressable>)}
    </Surface>}
    {section === 'navigation' && <><Surface style={styles.card}><VehicleSelector value={vehicleType} onChange={setVehicleType} /></Surface><DriverSettings section="navigation" /></>}
    {section === 'privacy' && <DriverSettings section="privacy" />}
    {section === 'account' && <AccountControls />}
    {section === 'offline' && <OfflineSettings />}
    {section === 'notifications' && <NotificationSettings />}
    {section === 'pilot' && <PilotSettings />}
    {section === 'appearance' && <Surface style={styles.card}>
      <Text style={[styles.title, ink]}>Choose your display</Text>
      <Text style={[styles.description, muted]}>System follows your phone. All themes support readable safety alerts.</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Choose app appearance" style={styles.options}>
        {themeOptions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: mode === option.value }} onPress={() => setMode(option.value)} style={[styles.option, { borderColor: mode === option.value ? theme.colors.brandStrong : theme.colors.border, backgroundColor: mode === option.value ? theme.colors.brandTint : theme.colors.surface }]}><Text style={[styles.title, { color: mode === option.value ? theme.colors.brandStrong : theme.colors.ink }]}>{option.label}</Text></Pressable>)}
      </View>
    </Surface>}
    {section === 'about' && <Surface style={styles.card}><Text style={[styles.title, ink]}>Built for the road ahead.</Text><Text style={[styles.description, muted]}>ROVA is built for Ghana. Verified speed limits are labelled separately from community road and enforcement reports. Road signs and traffic rules take priority.</Text><Text style={[styles.description, muted]}>ROVA · Preview</Text></Surface>}
  </ContentFrame></Page>;
}
const styles = StyleSheet.create({
  back: { marginTop: 12, alignSelf: 'flex-start' }, menu: { padding: 0, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 78 },
  menuIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '800' }, description: { fontSize: 13, lineHeight: 20, marginTop: 5 }, chevron: { fontSize: 28 },
  card: { gap: 12, marginBottom: 18 }, options: { gap: 10, marginTop: 8 }, option: { minHeight: 54, padding: 16, borderWidth: 1, borderRadius: 14 },
});
