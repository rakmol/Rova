import { Text, View } from 'react-native';
import { useHazardFeed } from './useHazardFeed';
import { useRovaTheme } from '../theme/ThemeProvider';
import type { HazardFeedState } from './realtime';

const labels = { pothole: 'Pothole', flood: 'Flooding', collision: 'Collision', closure: 'Road closure', congestion: 'Community-reported congestion', obstacle: 'Obstacle' };
export function NearbyHazards({ coordinate, compact = false }: { coordinate?: [number, number]; compact?: boolean }) {
  const state = useHazardFeed(coordinate);
  return <HazardFeedView state={state} coordinate={coordinate} compact={compact}/>;
}
export function HazardFeedView({ state, coordinate, compact = false, driving = false }: { state: HazardFeedState; coordinate?: [number, number]; compact?: boolean; driving?: boolean }) {
  const { theme } = useRovaTheme();
  const style = { color: theme.colors.inkMuted, fontSize: compact ? 14 : 16, lineHeight: compact ? 20 : 24 };
  const shown = state.reports.slice(0, compact ? 1 : 5);
  if(driving)return shown.length?<View style={{gap:4}}>{shown.map(r=><Text key={r.id} style={{color:theme.colors.warning,fontSize:16,lineHeight:24}}>! {labels[r.category]} | community reviewed{state.stale?' | updates may be outdated':''}</Text>)}</View>:null;
  return <View style={{ gap: 4 }}>
    {!compact && <Text style={{ color: theme.colors.warning, fontWeight: '800' }}>REVIEWED COMMUNITY HAZARDS</Text>}
    <Text style={style} accessibilityLiveRegion="polite">{!coordinate ? 'Choose an area to check hazards.' : state.checkedAt === null ? 'Hazard updates unavailable · no live traffic measurements' : `${state.stale ? 'Stale' : 'Fresh'} community updates · checked ${new Date(state.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}${state.transport === 'refresh' ? ' · periodic refresh' : state.transport === 'offline' ? ' · reconnecting' : ''}`}</Text>
    {shown.map(r => <Text key={r.id} style={{ ...style, color: theme.colors.warning }}>{labels[r.category]} · community reviewed · expires {new Date(r.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>)}
    {!!coordinate && state.checkedAt !== null && !shown.length && <Text style={style}>No active reviewed hazards received nearby; coverage is incomplete.</Text>}
    {!compact && <Text style={style}>Community reports are not measured traffic speeds or authority-verified alerts. {state.truncated ? 'Busy area: some reports are omitted.' : ''}</Text>}
  </View>;
}
