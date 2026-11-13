import type { ColorSchemeName } from "react-native";

export type ThemeMode = "system" | "light" | "dark";

export interface RovaTheme {
  mode: "light" | "dark";
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radii: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  typography: {
    caption: number;
    body: number;
    title: number;
    bodyLine: number;
  };
  colors: {
    background: string;
    surface: string;
    surfaceRaised: string;
    ink: string;
    inkMuted: string;
    inkSubtle: string;
    border: string;
    divider: string;
    brand: string;
    brandStrong: string;
    brandTint: string;
    accent: string;
    warning: string;
    warningTint: string;
    danger: string;
    overlay: string;
  };
}

const designTokens = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radii: { sm: 12, md: 16, lg: 20, pill: 999 },
  typography: { caption: 12, body: 15, title: 28, bodyLine: 22 },
} as const;

const themes: Record<"light" | "dark", RovaTheme> = {
  light: {
    mode: "light",
    ...designTokens,
    colors: {
      background: "#F7F9F8",
      surface: "#FFFFFF",
      surfaceRaised: "#F8FBFA",
      ink: "#102A35",
      inkMuted: "#536970",
      inkSubtle: "#536970",
      border: "#7A918B",
      divider: "#DEE6E3",
      brand: "#08786F",
      brandStrong: "#075D58",
      brandTint: "#E3F4F1",
      accent: "#D7F06A",
      warning: "#8A5A00",
      warningTint: "#FFF3D6",
      danger: "#A63C32",
      overlay: "rgba(12, 35, 44, 0.06)",
    },
  },
  dark: {
    mode: "dark",
    ...designTokens,
    colors: {
      background: "#0D1D26",
      surface: "#142832",
      surfaceRaised: "#1B333D",
      ink: "#F0F6F4",
      inkMuted: "#B0C1C3",
      inkSubtle: "#879DA1",
      border: "#65888D",
      divider: "#35515C",
      brand: "#6BD4C5",
      brandStrong: "#8AE4D5",
      brandTint: "#1D4548",
      accent: "#D7F06A",
      warning: "#FFD780",
      warningTint: "#44391F",
      danger: "#FF9A8E",
      overlay: "rgba(0, 0, 0, 0.2)",
    },
  },
};

export function resolveTheme(
  mode: ThemeMode,
  systemColorScheme: ColorSchemeName | null,
): RovaTheme {
  const resolvedMode =
    mode === "system" ? (systemColorScheme === "dark" ? "dark" : "light") : mode;
  return themes[resolvedMode];
}
