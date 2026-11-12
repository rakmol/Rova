import {loadDriverData} from '../account/local';
import {loadHistory} from '../places/history';
import {startNotificationLifecycle} from "../notifications/runtime";
import {useEffect} from "react";
import {startDrivingMonitor} from "../safety/monitor";
import {startNetworkMonitor} from "../offline/network";
import {loadOfflineData} from "../offline/data";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useRovaTheme } from "../theme/ThemeProvider";
import { RouteProvider } from "../map/RouteProvider";

export default function RootLayout() {
  useEffect(()=>{void loadOfflineData();void loadDriverData().catch(()=>{});void loadHistory().catch(()=>{});const network=startNetworkMonitor(),driving=startDrivingMonitor(),notifications=startNotificationLifecycle();return()=>{network();driving();notifications();};},[]);
  return (
    <ThemeProvider>
      <RouteProvider>
        <RootNavigator />
      </RouteProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { theme } = useRovaTheme();
  return (
    <>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="navigation" options={{ presentation: "modal" }} />
        <Stack.Screen name="destination-search" />
        <Stack.Screen name="route-options" />
      </Stack>
    </>
  );
}
