import {tx} from "../i18n";
import { Text, View } from "react-native";
import type { SessionSnapshot } from "./session";
import { travelDistance, useDriverData } from '../account/local';

export function NavigationInstruction({ snapshot: s, ink, muted, compact=false }: { snapshot: SessionSnapshot; ink: string; muted: string; compact?:boolean }) {
  const {preferences}=useDriverData();
  const following = s.state === "navigating" || s.state === "paused";
  const current = following && s.gpsReliable;
  const lastKnown = following && !s.gpsReliable && !!s.progress;
  const text = current || lastKnown ? s.progress?.instruction ?? tx('nav.continue') : s.state === "arrived" ? tx('nav.arrived') : s.state === "paused" ? tx('nav.finding') : s.state === "error" ? tx('nav.unavailable') : s.state === "off-route" || s.state === "rerouting" ? tx('nav.updatingRoute') : tx('nav.finding');
  return <View>
    {lastKnown && <Text style={{ color: muted, fontSize: 14 }}>{tx('nav.lastKnown')}</Text>}
    <Text accessibilityRole="header" accessibilityLabel={text} accessibilityLiveRegion="polite" numberOfLines={compact?3:undefined} style={{ color: ink, fontSize: compact?20:28, lineHeight: compact?26:36, fontWeight: "800" }}>{text}</Text>
    {current && s.progress?.turnMeters !== null && s.progress?.turnMeters !== undefined && <Text style={{ color: muted, fontSize: compact?16:20 }}>{tx('nav.turnDistance',{distance:travelDistance(s.progress.turnMeters,preferences.units)})}</Text>}
  </View>;
}
