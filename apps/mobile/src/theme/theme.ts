import type { ColorSchemeName } from "react-native";

export type ThemeMode = "system" | "light" | "dark";

export interface RovaTheme {
  mode: "light" | "dark";
  colors: {
    background: string;
    surface: string;
    surfaceRaised: string;
    ink: string;
    inkMuted: string;
    inkSubtle: string;
    border: string;
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

const themes: Record<"light" | "dark", RovaTheme> = {
  light: {
    mode: "light",
    colors: {
      background: "#F4F7F6",
      surface: "#FFFFFF",
      surfaceRaised: "#FFFFFF",
      ink: "#102A35",
      inkMuted: "#536970",
      inkSubtle: "#536970",
      border: "#7A918B",
      brand: "#066F69",
      brandStrong: "#06645F",
      brandTint: "#E0F3F0",
      accent: "#D7F06A",
      warning: "#8A5A00",
      warningTint: "#FFF3D6",
      danger: "#A63C32",
      overlay: "rgba(12, 35, 44, 0.06)",
    },
  },
  dark: {
    mode: "dark",
    colors: {
      background: "#0D1D26",
      surface: "#142832",
      surfaceRaised: "#1B333D",
      ink: "#F0F6F4",
      inkMuted: "#B0C1C3",
      inkSubtle: "#879DA1",
      border: "#65888D",
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
