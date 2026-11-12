import { fireEvent, render } from "@testing-library/react-native";
import RouteOptionsScreen from "../app/route-options";
import { ThemeProvider } from "../theme/ThemeProvider";
import { routingProvider } from "../routing/runtime";
import type { RoutingOption } from "@rova/shared";
const mockSelect = jest.fn();
jest.mock("expo-router", () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ origin: "-0.187,5.6037", destination: "-0.173,5.622", title: "Test destination" }) }));
jest.mock("../map/RouteProvider", () => ({ useRoutePreview: () => ({ setSelectedRoutingOption: mockSelect }) }));
jest.mock("../routing/runtime", () => ({ routingProvider: { routes: jest.fn() } }));
jest.mock("../routing/MapLibreRouteMap", () => ({ MapLibreRouteMap: () => null }));
const option: RoutingOption = { id: "test-balanced", label: "Balanced route", geometry: { type: "LineString", coordinates: [[-0.187, 5.6037], [-0.173, 5.622]] }, distanceMeters: 4000, durationSeconds: 600, maneuvers: [{ instruction: "Test turn", distanceMeters: 50, durationSeconds: null }], trafficAware: false, etaKind: "static_estimate", tolls: "unknown", isSample: false, attribution: "Test fixture" };
beforeEach(() => { jest.clearAllMocks(); });
test("selecting a supported alternative updates distance/ETA and stores the same selected geometry", async () => {
  const shorter = { ...option, id: "test-short", label: "Shorter distance", distanceMeters: 3000, durationSeconds: 720 };
  jest.mocked(routingProvider.routes).mockResolvedValue({ provider: "geoapify", routes: [option, shorter], warnings: [], fetchedAt: "2026-11-07T00:00:00Z" });
  const view = await render(<ThemeProvider><RouteOptionsScreen /></ThemeProvider>);
  const radio = await view.findByRole("radio", { name: "Shorter distance" });
  await fireEvent.press(radio);
  expect(view.getByText("Estimated distance 3.0 km | Estimated time 12 min")).toBeTruthy();
  expect(view.getByRole("radio", { name: "Shorter distance" }).props.accessibilityState.checked).toBe(true);
  await fireEvent.press(view.getByRole("button", { name: "Use route preview" }));
  expect(mockSelect).toHaveBeenCalledWith(shorter);
});
test("test sample routes are visibly labelled and cannot be selected for navigation", async () => {
  jest.mocked(routingProvider.routes).mockResolvedValue({ provider: "geoapify", routes: [{ ...option, isSample: true }], warnings: [], fetchedAt: "2026-11-07T00:00:00Z" });
  const view = await render(<ThemeProvider><RouteOptionsScreen /></ThemeProvider>);
  expect(await view.findByText("Sample route for testing only. Not for navigation.")).toBeTruthy();
  expect(view.getByRole("button", { name: "Use route preview" }).props.accessibilityState.disabled).toBe(true);
});
test("no route stays an explicit empty state rather than drawing a sample", async () => {
  jest.mocked(routingProvider.routes).mockResolvedValue({ provider: "geoapify", routes: [], warnings: [], fetchedAt: "2026-11-07T00:00:00Z" });
  const view = await render(<ThemeProvider><RouteOptionsScreen /></ThemeProvider>);
  expect(await view.findByText(/No driving route was found/)).toBeTruthy();
  expect(view.queryByRole("button", { name: "Use route preview" })).toBeNull();
});

test("a connection failure offers a retry that can recover genuine route options", async () => {
  jest.mocked(routingProvider.routes).mockRejectedValueOnce(new Error("Could not load routes. Check your connection and retry."))
    .mockResolvedValueOnce({ provider: "geoapify", routes: [option], warnings: [], fetchedAt: "2026-11-07T00:00:00Z" });
  const view = await render(<ThemeProvider><RouteOptionsScreen /></ThemeProvider>);
  expect(await view.findByText(/Could not load routes/)).toBeTruthy();
  expect(view.queryByRole("button", { name: "Use route preview" })).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Retry route search" }));
  expect(await view.findByRole("radio", { name: "Balanced route" })).toBeTruthy();
  expect(view.queryByText(/Could not load routes/)).toBeNull();
});
