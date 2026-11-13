import { SymbolView } from "expo-symbols";
import type { ColorValue } from "react-native";

const iconNames = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  work: { ios: 'briefcase.fill', android: 'work', web: 'work' },
  contribute: { ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' },
  camera: { ios: 'camera.fill', android: 'camera_alt', web: 'camera_alt' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  map: { ios: "map.fill", android: "map", web: "map" },
  reports: { ios: "exclamationmark.bubble.fill", android: "campaign", web: "campaign" },
  saved: { ios: "heart.fill", android: "favorite", web: "favorite" },
  settings: { ios: "gearshape.fill", android: "settings", web: "settings" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  locate: { ios: "location.fill", android: "my_location", web: "my_location" },
  navigation: { ios: "arrow.turn.up.right", android: "turn_right", web: "turn_right" },
  appearance: { ios: "circle.lefthalf.filled", android: "contrast", web: "contrast" },
  privacy: { ios: "lock.fill", android: "lock", web: "lock" },
  account: { ios: "person.crop.circle", android: "account_circle", web: "account_circle" },
  offline: { ios: "arrow.down.circle.fill", android: "download_for_offline", web: "download_for_offline" },
  notifications: { ios: "bell.fill", android: "notifications", web: "notifications" },
  pilot: { ios: "waveform.path.ecg", android: "monitor_heart", web: "monitor_heart" },
  about: { ios: "info.circle.fill", android: "info", web: "info" },
  chevron: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
} as const;

export type RovaIconName = keyof typeof iconNames;

export function RovaIcon({
  name,
  color,
  size = 22,
}: {
  name: RovaIconName;
  color: ColorValue;
  size?: number;
}) {
  return (
    <SymbolView
      name={iconNames[name]}
      size={size}
      tintColor={color}
      accessible={false}
      style={{ width: size, height: size }}
    />
  );
}
