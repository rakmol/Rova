import { fireEvent, render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme/ThemeProvider";
import { PublicEnforcementReports } from "../reports/PublicEnforcementReports";
import { filterPublicReports, policeSpeedGuidance, publicEnforcementReports } from "../reports/public-enforcement";
import { SmartAlertEngine } from "../navigation/smart-alerts";
test("public reports preserve mixed and unknown readings without promoting names to geofences or approved rules", () => {
  expect(publicEnforcementReports.length).toBeGreaterThan(70);
  expect(new Set(publicEnforcementReports.map((r) => r.id)).size).toBe(publicEnforcementReports.length);
  for (const report of publicEnforcementReports) {
    expect(report.verification).toBe("unverified"); expect(report.geometry).toBeNull(); expect(report.precision).toBe("named_area_only");
    expect(report.reportedSpeedsKmh).not.toContain(0);
  }
  expect(filterPublicReports("Forest", "all")[0].reportedSpeedsKmh).toEqual([30, 50]);
  expect(filterPublicReports("Rawlings", "all")[0].reportedSpeedsKmh).toEqual([]);
  expect(filterPublicReports("80", "all").map((r) => r.area)).toContain("Winneba Road / Mendskrom");
  expect(filterPublicReports("80", "kumasi")).toHaveLength(0);
  expect(policeSpeedGuidance.map((g) => g.kmh)).toEqual([30, 50, 90, 100]);
  expect(new SmartAlertEngine().update({ fix: null, speedKmh: 90, reliable: false, navigating: true, progressMeters: 0, context: null, now: Date.now(), flags: { enabled: true, transitions: true, corridors: true } })).toMatchObject({ limitKmh: null, alert: null });
});
test("report view labels the 80 km/h readings as unverified, supports area search, and never claims complete coverage", async () => {
  const view = await render(<ThemeProvider><PublicEnforcementReports /></ThemeProvider>);
  try {
    expect(view.getByText("PUBLIC REPORTS · UNVERIFIED")).toBeTruthy();
    expect(view.getByText(/not a live camera feed or a complete camera list/)).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Search reported enforcement areas"), "Mendskrom");
    expect(view.getByText("Winneba Road / Mendskrom")).toBeTruthy();
    expect(view.getByText("Reported: 80 km/h · unverified")).toBeTruthy();
    expect(view.queryByText("Verified limit: 80 km/h")).toBeNull();
    await fireEvent.changeText(view.getByLabelText("Search reported enforcement areas"), "not-a-real-record");
    expect(view.getByText(/Enforcement may still operate here/)).toBeTruthy();
  } finally { await view.unmount(); }
}, 15000);
