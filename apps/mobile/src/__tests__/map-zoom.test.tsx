import { fireEvent, render } from "@testing-library/react-native";
import { MapboxMap } from "../map/MapboxMap";
import { ThemeProvider } from "../theme/ThemeProvider";

const mockZoomTo = jest.fn();

jest.mock("@rnmapbox/maps", () => {
  // Native map rendering is verified on the phone; exercise its camera commands here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const MockMapView = (props: object) => React.createElement(View, { ...props, testID: "native-map" });
  const MockCamera = React.forwardRef(function CameraMock(_props: object, ref: object) {
    React.useImperativeHandle(ref, () => ({ zoomTo: mockZoomTo }));
    return null;
  });
  return {
    __esModule: true,
    default: { MapView: MockMapView, StyleURL: { Dark: "dark", Light: "light" } },
    Camera: MockCamera,
    LineLayer: () => null,
    LocationPuck: () => null,
    Images: () => null,
    ShapeSource: View,
  };
});

beforeEach(() => mockZoomTo.mockClear());

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
