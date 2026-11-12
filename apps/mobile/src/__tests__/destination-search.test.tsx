import { act, configure, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { Place } from "../places/provider";
import DestinationSearchScreen from "../app/destination-search";
import { ThemeProvider } from "../theme/ThemeProvider";
import { placesProvider } from "../places/runtime";
import { writeHistory } from "../places/history";

const mockPick = jest.fn();
jest.mock("expo-router", () => ({ router: { back: jest.fn(), navigate: jest.fn() } }));
jest.mock("../map/RouteProvider", () => ({ useRoutePreview: () => ({ setPickedDestination: mockPick }) }));
jest.mock("../map/MapboxMap", () => ({ MapboxMap: () => null }));
jest.mock("../map/mapboxProvider", () => ({ accraDevelopmentCenter: [-0.187, 5.6037], mapboxProvider: { initialize: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("../places/runtime", () => ({ placesProvider: { autocomplete: jest.fn(), details: jest.fn(async (place) => place) } }));
jest.mock("../places/history", () => {const real=jest.requireActual("../places/history");return{...real,writeHistory:jest.fn(real.writeHistory)};});

const place = { id: "test-id", name: "Test suburb", detail: "Test address, Ghana", coordinate: [-0.187, 5.6037] as [number, number], attribution: "© Mapbox" };
jest.setTimeout(30000);
configure({asyncUtilTimeout:5000});
beforeEach(async () => { await writeHistory({enabled:false,queries:[]});jest.clearAllMocks(); });
test("destination flow: opt-in history stores typed text, real result shows details, selection returns to map", async () => {
  jest.mocked(placesProvider.autocomplete).mockResolvedValue([place]);
  const view = await render(<ThemeProvider><DestinationSearchScreen /></ThemeProvider>);
  await fireEvent(view.getByLabelText("Remember recent searches"), "valueChange", true);
  await fireEvent.changeText(view.getByLabelText("Search Ghana places"), "Test query");
  await fireEvent.press(await view.findByRole("button", { name: "View Test suburb" }));
  expect(view.getByText("Test address, Ghana")).toBeTruthy();
  expect(writeHistory).toHaveBeenLastCalledWith({ enabled: true, queries: ["Test query"] });
  await fireEvent.press(view.getByRole("button", { name: "Use this destination" }));
  expect(mockPick).toHaveBeenCalledWith(place);
  await fireEvent.press(view.getByRole("button", { name: "Clear recent searches" }));
  expect(writeHistory).toHaveBeenLastCalledWith({ enabled: true, queries: [] });
  await fireEvent(view.getByLabelText("Remember recent searches"), "valueChange", false);
  expect(writeHistory).toHaveBeenLastCalledWith({ enabled: false, queries: [] });
});

test("empty results remain empty and network errors expose a retry", async () => {
  jest.mocked(placesProvider.autocomplete).mockResolvedValue([]);
  const view = await render(<ThemeProvider><DestinationSearchScreen /></ThemeProvider>);
  await fireEvent.changeText(view.getByLabelText("Search Ghana places"), "Unknown query");
  expect(await view.findByText(/No matches found/)).toBeTruthy();
  jest.mocked(placesProvider.autocomplete).mockRejectedValue(new Error("Search is offline"));
  await fireEvent.changeText(view.getByLabelText("Search Ghana places"), "Another query");
  expect(await view.findByText("Search is offline")).toBeTruthy();
  expect(view.getByRole("button", { name: "Try search again" })).toBeTruthy();
  expect(writeHistory).not.toHaveBeenCalled();
});

test("a slow response for an old query cannot replace the latest suggestions", async () => {
  let finishOld!: (places: Place[]) => void;
  jest.mocked(placesProvider.autocomplete)
    .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValueOnce([{ ...place, id: "new-id", name: "New test suburb" }]);
  const view = await render(<ThemeProvider><DestinationSearchScreen /></ThemeProvider>);
  await fireEvent.changeText(view.getByLabelText("Search Ghana places"), "Old query");
  await waitFor(() => expect(placesProvider.autocomplete).toHaveBeenCalledTimes(1));
  await fireEvent.changeText(view.getByLabelText("Search Ghana places"), "New query");
  await view.findByRole("button", { name: "View New test suburb" });
  await act(async () => finishOld([place]));
  expect(view.queryByRole("button", { name: "View Test suburb" })).toBeNull();
  expect(view.getByRole("button", { name: "View New test suburb" })).toBeTruthy();
});
