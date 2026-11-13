import { fireEvent, render } from "@testing-library/react-native";
import { MapboxMap } from "../map/MapboxMap";
import { ThemeProvider } from "../theme/ThemeProvider";

const mockZoomTo = jest.fn();
const mockCameraProps = jest.fn();
const mockPositionSource = jest.fn();
const mockSymbol = jest.fn();
const mockSetCamera = jest.fn();
const mockLine = jest.fn();

jest.mock("@rnmapbox/maps", () => {
  // Native map rendering is verified on the phone; exercise its camera commands here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const MockMapView = (props: object) => React.createElement(View, { ...props, testID: "native-map" });
  const MockCamera = React.forwardRef(function CameraMock(props: object, ref: object) {
    mockCameraProps(props);
    React.useImperativeHandle(ref, () => ({ zoomTo: mockZoomTo, setCamera: mockSetCamera }));
    return null;
  });
  return {
    __esModule: true,
    default: { MapView: MockMapView, StyleURL: { Dark: "dark", Light: "light" } },
    Camera: MockCamera,
    SymbolLayer: (props: object) => { mockSymbol(props); return null; },
    CameraGestureObserver: (props: object) => React.createElement(View, { ...props, testID: 'camera-gestures' }),
    LineLayer: (props: object) => { mockLine(props); return null; },
    LocationPuck: () => null,
    Images: () => null,
    ShapeSource: (props: object) => { mockPositionSource(props); return React.createElement(View,props); },
  };
});

beforeEach(() => mockZoomTo.mockClear());

test('only the accepted travelled section is grey; the upcoming route stays highlighted and a new route resets it', async () => {
  const geometry={type:'LineString' as const,coordinates:[[0,0],[0.001,0],[0.001,0.001]] as [number,number][]};
  const renderMap=(progress:number,navigationMode=true)=><ThemeProvider><MapboxMap navigationMode={navigationMode} center={[0,0]} routeGeometry={geometry} routeProgressMeters={progress} locationEnabled={false} onMapLoaded={()=>{}} onMapError={()=>{}}/></ThemeProvider>;
  const view=await render(renderMap(55));
  const completed=mockPositionSource.mock.calls.filter(([p])=>p.id==='rova-route-completed').at(-1)?.[0].shape.geometry.coordinates;
  const ahead=mockPositionSource.mock.calls.filter(([p])=>p.id==='rova-route-preview').at(-1)?.[0].shape.geometry.coordinates;
  expect(completed.at(-1)).toEqual(ahead[0]);
  expect(ahead.at(-1)).toEqual(geometry.coordinates.at(-1));
  expect(completed.at(-1)[0]).toBeCloseTo(0.000495,5);
  expect(mockLine.mock.calls.filter(([p])=>p.id==='rova-route-completed-line').at(-1)?.[0].style.lineColor).toBe('#89949A');
  expect(mockLine.mock.calls.filter(([p])=>p.id==='rova-route-line').at(-1)?.[0].style.lineColor).not.toBe('#89949A');
  for(const args of [[0,true],[55,false]] as const){
    mockPositionSource.mockClear();
    await view.rerender(renderMap(...args));
    expect(mockPositionSource.mock.calls.some(([p])=>p.id==='rova-route-completed')).toBe(false);
    expect(mockPositionSource.mock.calls.filter(([p])=>p.id==='rova-route-preview').at(-1)?.[0].shape.geometry.coordinates).toEqual(geometry.coordinates);
  }
  await view.unmount();
});

test('navigation sends each accepted fix to the marker and a short street-level camera transition',async()=>{
  const fix={coordinate:[-.2,5.6] as [number,number],accuracy:8,speed:4,heading:90,timestamp:Date.now()};
  const view=await render(<ThemeProvider><MapboxMap navigationMode navigationFix={fix} center={fix.coordinate} locationEnabled onMapLoaded={()=>{}} onMapError={()=>{}}/></ThemeProvider>);
  expect(mockPositionSource.mock.calls.filter(([p])=>p.id==='rova-navigation-position').at(-1)?.[0].shape.geometry.coordinates).toEqual(fix.coordinate);
  const next={...fix,coordinate:[-.1999,5.6] as [number,number],timestamp:fix.timestamp+1000};
  await view.rerender(<ThemeProvider><MapboxMap navigationMode navigationFix={next} navigationBearing={270} center={next.coordinate} locationEnabled onMapLoaded={()=>{}} onMapError={()=>{}}/></ThemeProvider>);
  expect(mockPositionSource.mock.calls.filter(([p])=>p.id==='rova-navigation-position').at(-1)?.[0].shape.geometry.coordinates).toEqual(next.coordinate);
  expect(mockSymbol.mock.calls.at(-1)?.[0].style).toMatchObject({iconRotate:270,iconRotationAlignment:'map'});
  expect(mockCameraProps.mock.calls.at(-1)?.[0]).toMatchObject({centerCoordinate:next.coordinate,heading:270,animationDuration:300,defaultSettings:{zoomLevel:16}});
  await fireEvent(view.getByTestId('camera-gestures'),'cameraChanged',{nativeEvent:{properties:{isUserInteraction:true}}});
  expect(mockCameraProps.mock.calls.at(-1)?.[0].centerCoordinate).toBeUndefined();
  await fireEvent.press(view.getByRole('button',{name:'Recenter on your position and follow travel direction'}));
  expect(mockSetCamera).toHaveBeenLastCalledWith(expect.objectContaining({centerCoordinate:next.coordinate,heading:270,zoomLevel:16}));
  expect(mockCameraProps.mock.calls.at(-1)?.[0].centerCoordinate).toEqual(next.coordinate);
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
