import { StyleSheet, Text, View } from "react-native";
import type { NoticeProps } from "./types";
import { palette } from "./palette";

export function Notice({ title, children }: NoticeProps) {
  return (
    <View accessibilityLabel={title} style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  title: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  message: {
    marginTop: 6,
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
