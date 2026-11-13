import { fireEvent, render } from "@testing-library/react-native";
import { MapboxMap } from "../map/MapboxMap";
import { ThemeProvider } from "../theme/ThemeProvider";

const mockZoomTo = jest.fn();
const mockCameraProps = jest.fn();
const mockCustomProvider = jest.fn();

jest.mock("@rnmapbox/maps", () => {
  // Native map rendering is verified on the phone; exercise its camera commands here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const MockMapView = (props: object) => React.createElement(View, { ...props, testID: "native-map" });
  const MockCamera = React.forwardRef(function CameraMock(props: object, ref: object) {
    mockCameraProps(props);
    React.useImperativeHandle(ref, () => ({ zoomTo: mockZoomTo }));
    return null;
  });
  return {
    __esModule: true,
    default: { MapView: MockMapView, StyleURL: { Dark: "dark", Light: "light" } },
    Camera: MockCamera,
    CustomLocationProvider: (props: object) => { mockCustomProvider(props); return null; },
    LineLayer: () => null,
    LocationPuck: () => null,
    Images: () => null,
    ShapeSource: View,
  };
});

beforeEach(() => mockZoomTo.mockClear());

test('navigation sends each accepted fix to the marker and a short street-level camera transition',async()=>{
  const fix={coordinate:[-.2,5.6] as [number,number],accuracy:8,speed:4,heading:90,timestamp:Date.now()};
  const view=await render(<ThemeProvider><MapboxMap navigationMode navigationFix={fix} center={fix.coordinate} locationEnabled onMapLoaded={()=>{}} onMapError={()=>{}}/></ThemeProvider>);
  expect(mockCustomProvider.mock.calls.at(-1)?.[0]).toMatchObject({coordinate:fix.coordinate,heading:90});
  const next={...fix,coordinate:[-.1999,5.6] as [number,number],timestamp:fix.timestamp+1000};
  await view.rerender(<ThemeProvider><MapboxMap navigationMode navigationFix={next} center={next.coordinate} locationEnabled onMapLoaded={()=>{}} onMapError={()=>{}}/></ThemeProvider>);
  expect(mockCustomProvider.mock.calls.at(-1)?.[0]).toMatchObject({coordinate:next.coordinate});
  expect(mockCameraProps.mock.calls.at(-1)?.[0]).toMatchObject({centerCoordinate:next.coordinate,animationDuration:300,defaultSettings:{zoomLevel:16}});
  await view.unmount();
});

test("zoom buttons start from the user's pinch zoom and stay within map zoom limits", async () => {
  const view = await render(<ThemeProvider><MapboxMap center={[-0.187, 5.6037]} locationEnabled={false} onMapLoaded={() => {}} onMapError={() => {}} /></ThemeProvider>);
  const map = view.getByTestId("native-map");
  expect(map.props.requestDisallowInterceptTouchEvent).toBe(true);
  expect(map.props.gestureSettings.pinchZoomEnabled).toBe(true);

  await fireEvent(map, "cameraChanged", { properties: { zoom: 16 } });
  await fireEvent.press(view.getByRole("button", { name: "Zoom in" }));
  expect(mockZoomTo).toHaveBeenLastCalledWith(17, 200);
  await fireEvent.press(view.getByRole("button", { name: "Zoom out" }));
  expect(mockZoomTo).toHaveBeenLastCalledWith(16, 200);

  await fireEvent(map, "cameraChanged", { properties: { zoom: 22 } });
  await fireEvent.press(view.getByRole("button", { name: "Zoom in" }));
  expect(mockZoomTo).toHaveBeenLastCalledWith(22, 200);
  await fireEvent(map, "cameraChanged", { properties: { zoom: 0 } });
  await fireEvent.press(view.getByRole("button", { name: "Zoom out" }));
  expect(mockZoomTo).toHaveBeenLastCalledWith(0, 200);
});
