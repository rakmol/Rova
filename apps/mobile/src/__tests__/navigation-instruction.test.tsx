import { render } from "@testing-library/react-native";
import { NavigationInstruction } from "../navigation/NavigationInstruction";
import type { SessionSnapshot } from "../navigation/session";
test("a GPS gap keeps the last maneuver visible with stale labels rather than blanking navigation", async () => {
  const snapshot: SessionSnapshot = { state: "navigating", route: null, gpsReliable: false, message: "Waiting for GPS", speedKmh: null, progress: { along: 100, coordinate: [0, 0], remainingMeters: 500, remainingSeconds: 60, instruction: "Test turn left", turnMeters: 80, step: 1 } };
  const view = await render(<NavigationInstruction snapshot={snapshot} ink="#000000" muted="#666666" />);
  expect(view.getByText("Test turn left")).toBeTruthy();
  expect(view.getByText("Updating GPS - last known instruction")).toBeTruthy();
  expect(view.queryByText(/80 m/)).toBeNull();
  expect(view.queryByText("Guidance suspended")).toBeNull();
  await view.unmount();
}, 15000);
