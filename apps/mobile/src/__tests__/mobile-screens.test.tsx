import { act, fireEvent, render, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { BackHandler, Keyboard, Pressable, Text } from "react-native";
import MapScreen from "../app/(tabs)/map";
import SettingsScreen from "../app/(tabs)/settings";
import * as Driving from "../safety/driving";
import { FeedbackMessage } from "../components/ui";
import { isMapboxConfigured, mapboxProvider } from "../map/mapboxProvider";
import { RouteProvider, useRoutePreview } from "../map/RouteProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import {ScrollMenuContext} from '../components/ScrollMenuContext';

jest.mock("expo-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (callback:()=>void)=>require("react").useEffect(callback,[callback]),
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("expo-symbols", () => ({
  SymbolView: () => null,
}));
jest.mock('../components/HomeBackGuard', () => ({ HomeBackGuard: () => null }));

jest.mock("../map/mapboxProvider", () => ({
  accraDevelopmentCenter: [-0.187, 5.6037],
  createSearchSessionToken: () => "00000000-0000-4000-8000-000000000000",
  isMapboxConfigured: jest.fn(() => false),
  mapboxProvider: {
    initialize: jest.fn().mockResolvedValue(undefined),
    searchDestinations: jest.fn(),
    retrieveDestination: jest.fn(),
    requestRoute: jest.fn(),
  },
}));

jest.mock("../map/MapboxMap", () => ({
  MapboxMap: () => null,
}));

async function renderWithTheme(component: ReactElement) {
  return render(
    <ThemeProvider>
      <RouteProvider>{component}</RouteProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.mocked(isMapboxConfigured).mockReturnValue(false);
  jest.mocked(mapboxProvider.initialize).mockResolvedValue(undefined);
  jest.mocked(mapboxProvider.searchDestinations).mockReset();
});

describe("mobile screen foundation", () => {
  it('restores the journey panel when search closes and scrolling the panel never hides the menu',async()=>{
    jest.mocked(isMapboxConfigured).mockReturnValue(true);
    const setHidden=jest.fn();
    const view=await renderWithTheme(<ScrollMenuContext.Provider value={{height:80,setHidden}}><MapScreen/></ScrollMenuContext.Provider>);
    try{
      await fireEvent(view.getByLabelText('Search destinations in Ghana'),'focus');
      expect(view.queryByTestId('explore-journey-content')).toBeNull();
      await fireEvent.press(view.getByRole('button',{name:'Close destination search'}));
      expect(view.getByTestId('explore-journey-content')).toBeTruthy();
      await fireEvent.scroll(view.getByTestId('explore-journey-content'),{nativeEvent:{contentOffset:{y:150}}});
      expect(setHidden).not.toHaveBeenCalledWith(true);
      await fireEvent.press(view.getByRole('button',{name:'Expand journey panel'}));
      expect(view.getByRole('button',{name:'Collapse journey panel'})).toBeTruthy();
      expect(setHidden).not.toHaveBeenCalledWith(true);
    }finally{await view.unmount();}
  });
  it("accepts a destination from the dedicated search screen and previews its route", async () => {
    // Explicitly flush the deferred destination handoff before querying. An async
    // findByText scope can otherwise overlap the animation-frame act scope.
    let handoff: FrameRequestCallback | undefined;
    const frame = jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) => { handoff = callback; return 1; });
    jest.mocked(isMapboxConfigured).mockReturnValue(true);
    jest.mocked(mapboxProvider.requestRoute).mockResolvedValue({ origin: [-0.187, 5.6037], destination: [-0.2, 5.6], geometry: { type: "LineString", coordinates: [[-0.187, 5.6037], [-0.2, 5.6]] }, distanceMeters: 2000, durationSeconds: 600, trafficAware: false, startGuidance: jest.fn(), release: jest.fn() });
    function PickDestination() {
      const { setPickedDestination } = useRoutePreview();
      return <Pressable accessibilityRole="button" accessibilityLabel="Use fixture destination" onPress={() => setPickedDestination({ name: "Test suburb", detail: "Ghana", coordinate: [-0.2, 5.6] })}><Text>Choose fixture</Text></Pressable>;
    }
    const view = await renderWithTheme(<><PickDestination /><MapScreen /></>);
    try {
      await fireEvent.press(view.getByRole("button", { name: "Use fixture destination" }));
      expect(handoff).toBeDefined();
      // Restore native scheduling before mounting vehicle controls; intercepting
      // every subsequent frame can prevent React's act scope from settling.
      const deliverDestination = handoff!;
      frame.mockRestore();
      await act(async () => { deliverDestination(Date.now()); });
      expect(view.getByText("Test suburb")).toBeTruthy();
      expect(within(view.getByTestId("persistent-route-start")).getByRole("button",{name:"Locate me to navigate"})).toBeTruthy();
      expect(within(view.getByTestId("explore-journey-content")).queryByRole("button",{name:"Locate me to navigate"})).toBeNull();
      expect(mapboxProvider.requestRoute).toHaveBeenCalledWith([-0.187, 5.6037], [-0.2, 5.6]);
      expect(view.getByLabelText("Search destinations in Ghana").props.value).toBe("Test suburb");
    } finally { await view.unmount(); frame.mockRestore(); }
  });
  it("shows map setup without the homepage unavailable-speed card", async () => {
    const view = await renderWithTheme(<MapScreen />);

    expect(view.getByText("Mapbox token required")).toBeTruthy();
    expect(view.queryByText("Speed limit unavailable")).toBeNull();
    expect(view.queryByText(/No approved ROVA speed-limit record/)).toBeNull();
    expect(view.getByLabelText("Search destinations in Ghana").props.editable).toBe(false);
  });

  it("keeps destination suggestions tappable and scrolls the search area above the keyboard", async () => {
    jest.mocked(isMapboxConfigured).mockReturnValue(true);
    jest.mocked(mapboxProvider.searchDestinations).mockResolvedValue([
      {
        id: "place.123",
        name: "Accra Mall",
        detail: "Tetteh Quarshie, Accra, Ghana",
      },
    ]);

    const view = await renderWithTheme(<MapScreen />);
    const input = view.getByLabelText("Search destinations in Ghana");
    await fireEvent(input, "focus");
    await fireEvent.changeText(input, "Accra Mall");

    const suggestion = await view.findByRole("button", { name: "Choose Accra Mall" });
    const suggestionList = view.getByTestId("destination-suggestions");

    expect(suggestion).toBeTruthy();
    expect(suggestionList.props.keyboardShouldPersistTaps).toBe("always");
    expect(suggestionList.props.nestedScrollEnabled).toBe(true);
    expect(suggestionList.props.style).toEqual(expect.objectContaining({ maxHeight: 240 }));
  });

  it('keeps floating destination search locked during driving and available to a passenger',async()=>{
    jest.mocked(isMapboxConfigured).mockReturnValue(true);
    const motion=jest.spyOn(Driving,'useDrivingSafety').mockReturnValue({locked:true,navigation:false,passenger:false});
    const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
    const view=await renderWithTheme(<MapScreen/>);
    try{
      expect(view.getByLabelText('Search destinations in Ghana').props.editable).toBe(false);
      expect(dismiss).toHaveBeenCalled();expect(view.queryByTestId('destination-suggestions')).toBeNull();
      motion.mockReturnValue({locked:true,navigation:false,passenger:true});
      await view.rerender(<ThemeProvider><RouteProvider><MapScreen/></RouteProvider></ThemeProvider>);
      expect(view.getByLabelText('Search destinations in Ghana').props.editable).toBe(true);
    }finally{await view.unmount();motion.mockRestore();dismiss.mockRestore();}
  });

  it("allows switching to an explicit dark theme", async () => {
    const view = await renderWithTheme(<SettingsScreen />);

    await fireEvent.press(view.getByRole("button", { name: "Appearance" }));
    await fireEvent.press(view.getByRole("radio", { name: "Dark" }));

    expect(view.getByRole("radio", { name: "Dark" }).props.accessibilityState.checked).toBe(true);
    expect(view.getByRole("radio", { name: "System" }).props.accessibilityState.checked).toBe(false);
  });

  it("opens only the selected settings category and returns to the compact menu", async () => {
    const view = await renderWithTheme(<SettingsScreen />);
    expect(view.queryByText('Voice and units')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Navigation & voice' }));
    expect(view.getByText('Voice and units')).toBeTruthy();
    expect(view.queryByText('Location and privacy')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'All settings' }));
    await fireEvent.press(view.getByRole('button', { name: 'Location & privacy' }));
    expect(view.getByText('Location and privacy')).toBeTruthy();
    expect(view.queryByText('Voice and units')).toBeNull();
  });

  it('Android Back closes a settings category before leaving Settings, and dismisses the keyboard first',async()=>{
    let back!:()=>boolean|null|undefined;
    const listener=jest.spyOn(BackHandler,'addEventListener').mockImplementation((_,fn)=>{back=fn;return{remove:jest.fn()};});
    const keyboard=jest.spyOn(Keyboard,'isVisible').mockReturnValue(false),dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
    const view=await renderWithTheme(<SettingsScreen/>);
    try{
      await fireEvent.press(view.getByRole('button',{name:'Appearance'}));
      keyboard.mockReturnValue(true);await act(()=>{expect(back()).toBe(true);});expect(dismiss).toHaveBeenCalled();expect(view.getByRole('radio',{name:'Dark'})).toBeTruthy();
      keyboard.mockReturnValue(false);await act(()=>{expect(back()).toBe(true);});expect(view.queryByRole('radio',{name:'Dark'})).toBeNull();expect(view.getByRole('button',{name:'Appearance'})).toBeTruthy();expect(back()).toBe(false);
    }finally{await view.unmount();listener.mockRestore();keyboard.mockRestore();dismiss.mockRestore();}
  });

  it("renders a clear permission-denied state without implying location access", async () => {
    const view = await renderWithTheme(
      <FeedbackMessage
        state="permissionDenied"
        message="Location permission is off. You can continue without sharing your location."
      />,
    );

    expect(view.getByText("Permission is off")).toBeTruthy();
  });

  it("provides explicit loading and error feedback states", async () => {
    const loading = await renderWithTheme(
      <FeedbackMessage state="loading" message="Loading map services." />,
    );
    expect(loading.getByText("Loading")).toBeTruthy();
    await loading.unmount();

    const error = await renderWithTheme(<FeedbackMessage state="error" message="The map could not load." />);
    expect(error.getByText("Something went wrong")).toBeTruthy();
    expect(error.getByText("The map could not load.")).toBeTruthy();
  });
});
