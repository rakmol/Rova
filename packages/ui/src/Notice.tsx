import type { CSSProperties } from "react";
import type { NoticeProps } from "./types";
import { palette } from "./palette";

const styles: Record<string, CSSProperties> = {
  container: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: palette.surface,
    color: palette.ink,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
  },
  message: {
    marginTop: 6,
    color: palette.muted,
    fontSize: 14,
    lineHeight: "20px",
  },
};

export function Notice({ title, children }: NoticeProps) {
  return (
    <aside aria-label={title} style={styles.container}>
      <strong style={styles.title}>{title}</strong>
      <div style={styles.message}>{children}</div>
    </aside>
  );
}
