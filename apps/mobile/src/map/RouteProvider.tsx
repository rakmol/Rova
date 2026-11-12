import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Destination, MapRoute } from "./types";
import type { RoutingOption, VehicleClass } from "@rova/shared";

export type RoutePreview = MapRoute & {
  originIsLive: boolean;
  originLabel: string;
  destinationLabel: string;
};

type RouteContextValue = {
  vehicleType: VehicleClass;
  setVehicleType: (vehicle: VehicleClass) => void;
  route: RoutePreview | null;
  setRoute: (route: RoutePreview | null) => void;
  pickedDestination: Destination | null;
  setPickedDestination: (destination: Destination | null) => void;
  selectedRoutingOption: RoutingOption | null;
  setSelectedRoutingOption: (option: RoutingOption | null) => void;
};

const RouteContext = createContext<RouteContextValue | null>(null);

export function RouteProvider({ children }: { children: ReactNode }) {
  const [vehicleType, setVehicleType] = useState<VehicleClass>("private_car");
  const [selectedRoutingOption, setSelectedRoutingOption] = useState<RoutingOption | null>(null);
  const [pickedDestination, setPickedDestination] = useState<Destination | null>(null);
  const [route, setRouteState] = useState<RoutePreview | null>(null);
  const routeRef = useRef<RoutePreview | null>(null);

  const setRoute = useCallback((nextRoute: RoutePreview | null) => {
    const previousRoute = routeRef.current;
    if (previousRoute && previousRoute !== nextRoute) {
      previousRoute.release();
    }
    routeRef.current = nextRoute;
    setRouteState(nextRoute);
  }, []);

  useEffect(
    () => () => {
      routeRef.current?.release();
    },
    [],
  );

  return (
    <RouteContext.Provider value={{ route, setRoute, pickedDestination, setPickedDestination, selectedRoutingOption, setSelectedRoutingOption, vehicleType, setVehicleType }}>
      {children}
    </RouteContext.Provider>
  );
}

export function useRoutePreview(): RouteContextValue {
  const context = useContext(RouteContext);
  if (!context) {
    throw new Error("useRoutePreview must be used within RouteProvider.");
  }
  return context;
}
