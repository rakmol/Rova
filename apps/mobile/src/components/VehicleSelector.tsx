import type { VehicleClass } from '@rova/shared';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { vehicleLabels } from '../navigation/SmartAlertPanel';
import { useRovaTheme } from '../theme/ThemeProvider';

export function VehicleSelector({ value, onChange, compact=false }: { value: VehicleClass; onChange: (value: VehicleClass) => void; compact?:boolean }) {
  const { theme } = useRovaTheme();
  const options=(Object.keys(vehicleLabels) as VehicleClass[]).map(vehicle => {
    const selected=vehicle===value;
    return <Pressable key={vehicle} accessibilityRole="radio" accessibilityLabel={vehicleLabels[vehicle]} accessibilityState={{checked:selected}} onPress={()=>onChange(vehicle)} style={[styles.option,compact&&{flexGrow:0,flexBasis:'auto',borderRadius:26},{backgroundColor:selected?theme.colors.brandTint:theme.colors.surface,borderColor:selected?theme.colors.brandStrong:theme.colors.border}]}>
      <View accessible={false} style={[styles.radio,{borderColor:selected?theme.colors.brandStrong:theme.colors.inkMuted}]}>{selected&&<View style={[styles.dot,{backgroundColor:theme.colors.brandStrong}]}/>}</View><Text style={[styles.label,{color:selected?theme.colors.brandStrong:theme.colors.ink}]}>{vehicleLabels[vehicle]}</Text>
    </Pressable>;
  });
  return <View style={styles.container}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.ink }]}>Your vehicle</Text>
    {compact?<ScrollView horizontal accessibilityRole="radiogroup" accessibilityLabel="Vehicle for this journey" showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{options}</ScrollView>:<View accessibilityRole="radiogroup" accessibilityLabel="Vehicle for this journey" style={styles.options}>{options}</View>}
    <Text style={[styles.note, { color: theme.colors.inkMuted }]}>{compact?'Speed-limit alerts use this vehicle. Routes remain general driving routes.':'Used for applicable speed-limit alerts. Routes are general driving routes, without vehicle-specific clearance or access checks.'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 10 }, heading: { fontSize: 17, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexBasis: '46%', minHeight: 52, padding: 12, borderWidth: 1, borderRadius: 14 },
  radio: { width: 18, height: 18, borderWidth: 2, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 }, label: { flex: 1, fontSize: 14, fontWeight: '700' }, note: { fontSize: 12, lineHeight: 18 },
});
