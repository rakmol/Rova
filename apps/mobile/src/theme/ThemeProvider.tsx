import { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import type { ReactNode } from "react";
import type { RovaTheme, ThemeMode } from "./theme";
import { resolveTheme } from "./theme";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: RovaTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");
  const theme = useMemo(
    () => resolveTheme(mode, systemColorScheme),
    [mode, systemColorScheme],
  );
  const value = useMemo(() => ({ mode, setMode, theme }), [mode, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useRovaTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useRovaTheme must be used inside ThemeProvider.");
  }
  return context;
}
