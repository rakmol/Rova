import { render } from "@testing-library/react-native";
import { NavigationInstruction } from "../navigation/NavigationInstruction";
import type { SessionSnapshot } from "../navigation/session";
test('compact long instructions use three visible lines while retaining the complete screen-reader instruction',async()=>{
 const text='Enter the roundabout and take the first exit onto Tetteh Quarshie Interchange.';
 const snapshot={state:'navigating',gpsReliable:true,progress:{instruction:text,turnMeters:110}} as SessionSnapshot;
 const view=await render(<NavigationInstruction snapshot={snapshot} ink="#FFFFFF" muted="#DDDDDD" compact/>);
 expect(view.getByRole('header',{name:text}).props.numberOfLines).toBe(3);await view.unmount();
});
test("a GPS gap keeps the last maneuver visible with stale labels rather than blanking navigation", async () => {
  const snapshot: SessionSnapshot = { state: "navigating", route: null, gpsReliable: false, message: "Waiting for GPS", speedKmh: null, progress: { along: 100, coordinate: [0, 0], remainingMeters: 500, remainingSeconds: 60, instruction: "Test turn left", turnMeters: 80, step: 1 } };
  const view = await render(<NavigationInstruction snapshot={snapshot} ink="#000000" muted="#666666" />);
  expect(view.getByText("Test turn left")).toBeTruthy();
  expect(view.getByText("Updating GPS - last known instruction")).toBeTruthy();
  expect(view.queryByText(/80 m/)).toBeNull();
  expect(view.queryByText("Guidance suspended")).toBeNull();
  await view.unmount();
}, 15000);
