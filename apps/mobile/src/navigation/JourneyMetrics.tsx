import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRovaTheme } from '../theme/ThemeProvider';

export type JourneyMetric = { label: string; value: string };
export function JourneyMetrics({ metrics }: { metrics: JourneyMetric[] }) {
  const { theme } = useRovaTheme();
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale >= 1.8 ? 1 : width < 600 || fontScale >= 1.2 ? 2 : 4;
  return <View testID="journey-metrics" style={styles.grid}>
    {metrics.map(metric => <View key={metric.label} accessible accessibilityLabel={`${metric.label}: ${metric.value}`} style={[styles.metric, { width: columns === 1 ? '100%' : columns === 2 ? '48%' : '23.5%', backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
      <Text style={[styles.value, { color: theme.colors.ink }]}>{metric.value}</Text>
      <Text style={[styles.label, { color: theme.colors.inkMuted }]}>{metric.label}</Text>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 8 },
  metric: { padding: 12, minWidth: 0, borderWidth: 1, borderRadius: 16 },
  value: { fontSize: 23, lineHeight: 31, fontWeight: '800', fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, lineHeight: 18, marginTop: 3 },
});
