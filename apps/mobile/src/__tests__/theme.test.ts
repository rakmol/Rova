import { resolveTheme } from "../theme/theme";

describe("resolveTheme", () => {
  it("follows the system color scheme when system mode is selected", () => {
    expect(resolveTheme("system", "dark").mode).toBe("dark");
    expect(resolveTheme("system", "light").mode).toBe("light");
    expect(resolveTheme("system", null).mode).toBe("light");
  });

  it("respects an explicit theme preference", () => {
    expect(resolveTheme("light", "dark").mode).toBe("light");
    expect(resolveTheme("dark", "light").mode).toBe("dark");
  });
});
