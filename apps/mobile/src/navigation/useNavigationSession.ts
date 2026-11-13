import {observeMotion,navigationInteraction} from "../safety/driving";
import {networkSnapshot,requestOutcome} from "../offline/network";
import {offlineCompliance} from "../offline/runtime";
import {offlineData} from "../offline/data";

import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import type { RoutingCoordinate, RoutingOption, VehicleClass } from "@rova/shared";
import { routingProvider } from "../routing/runtime";
import { NavigationMachine, VoiceGate, type Fix } from "./session";
import { createVoicePlayer, speechAvailable } from "./voice";
import { routeWindow,projectOnPath } from "@rova/shared";
import { SmartAlertEngine, emptySmartAlert, smartAlertFlags, type BoundComplianceContext } from "./smart-alerts";
import { fetchComplianceContext } from "./compliance-client";
import {ReportedRoadAlertEngine,emptyReportedRoadAlert,reportedRoadAlertsEnabled} from "./reported-road-alerts";
import { useHazardFeed } from '../incidents/useHazardFeed';
import { CongestionAlertEngine, type CongestionAlert } from './congestion-alerts';
import {pilotRuntime} from '../pilot/runtime';
import { TravelBearing } from './travelBearing';

const fromLocation = (location: Location.LocationObject): Fix => ({ coordinate: [location.coords.longitude, location.coords.latitude], accuracy: location.coords.accuracy, timestamp: location.timestamp, speed: location.coords.speed, heading: location.coords.heading });

export function useNavigationSession(destination: RoutingCoordinate | undefined, selected: RoutingOption | null, vehicleType: VehicleClass = "private_car") {
  const [snapshot, setSnapshot] = useState(() => new NavigationMachine().snapshot);
  const communityHazards = useHazardFeed(snapshot.gpsReliable && snapshot.state === 'navigating' ? snapshot.progress?.coordinate : undefined);
  const hazardsRef = useRef(communityHazards);
  useEffect(() => { hazardsRef.current = communityHazards; }, [communityHazards]);
  const [congestionAlert, setCongestionAlert] = useState<CongestionAlert | null>(null);
  const [updatedAt, setUpdatedAt] = useState(Date.now);
  const [mapFix, setMapFix] = useState<Fix | null>(null);
  const [mapBearing, setMapBearing] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [smartAlerts, setSmartAlerts] = useState(emptySmartAlert);
  const [reportedRoadAlert,setReportedRoadAlert]=useState(emptyReportedRoadAlert);
  const [alertAudio, setAlertAudio] = useState(true);
  const alertAudioRef = useRef(true);
  const [voiceError, setVoiceError] = useState<string | null>(speechAvailable ? null : "Install the updated ROVA app to enable device speech. Visual guidance remains available.");
  const [retry, setRetry] = useState(0);
  const control = useRef<{ pause(): void; resume(): void; stop(): void; silence(): void } | null>(null);
  const lon = destination?.[0]; const lat = destination?.[1];

  useEffect(() => {
    if (lon === undefined || lat === undefined) return;
    navigationInteraction(true);
    const machine = new NavigationMachine();
    const travelBearing = new TravelBearing();
    pilotRuntime.record('nav_attempts');
    let outcome=false;
    const gate = new VoiceGate();
    const voice = createVoicePlayer(setVoiceError);
    const alerts = new SmartAlertEngine();
    const reportedAlerts=new ReportedRoadAlertEngine();
    const congestion = new CongestionAlertEngine();
    let safetyContext: BoundComplianceContext | null = null;
    let safetyRequest: AbortController | null = null;
    let lastSafetyRequest = -Infinity;
    let safetyFailures=0;
    let safetyRoute: string | undefined;
    let lastVoiceAt = -Infinity;
    const controller = new AbortController();
    let rerouteAbort: AbortController | null = null;
    let active = true; let watch: Location.LocationSubscription | undefined;
    let watchGeneration = 0;
    let lastFix: Fix | null = null;
    let foregroundState = AppState.currentState;
    let resumeOnForeground = false;
    const foregroundWaiters = new Set<() => void>();
    const waitForForeground = async () => {
      if (controller.signal.aborted) throw new Error("Navigation ended.");
      if (foregroundState === "active") return;
      setSnapshot({ ...machine.snapshot, message: "Waiting for ROVA to return to the foreground" });
      await new Promise<void>((resolve, reject) => {
        const finish = () => { foregroundWaiters.delete(finish); controller.signal.removeEventListener("abort", cancel); resolve(); };
        const cancel = () => { foregroundWaiters.delete(finish); reject(new Error("Navigation ended.")); };
        foregroundWaiters.add(finish);
        controller.signal.addEventListener("abort", cancel, { once: true });
      });
    };
    const publish = () => {
      if (!active) return;
      const next = machine.snapshot;
      if(!outcome&&['error','arrived','idle'].includes(next.state)){outcome=true;pilotRuntime.record(next.state==='error'?'nav_failures':next.state==='arrived'?'nav_arrivals':'nav_cancelled');}
      setSnapshot({ ...next });
      setMapFix(machine.locationFix);
      setMapBearing(travelBearing.update(machine.locationFix, Date.now()));
      setUpdatedAt(Date.now());
      const now = Date.now();
      const safetyActive = foregroundState === "active" && next.state === "navigating" && next.gpsReliable && !!lastFix && !!next.progress;
      if (!safetyActive || safetyRoute !== next.route?.id) { safetyContext = null; safetyRequest?.abort(); safetyRequest = null; safetyRoute = next.route?.id; }
      const network=networkSnapshot();
      if(safetyActive&&lastFix&&(network.status==='offline'||safetyFailures>0||(network.lowData&&(!safetyContext||now>=safetyContext.data.validUntil))))safetyContext={data:offlineCompliance(lastFix,vehicleType),progressMeters:next.progress!.along,heading:lastFix.heading??-1};
      const safetyInterval=Math.max(network.lowData?15000:2000,Math.min(30000,2000*2**Math.min(4,safetyFailures)));
      if (network.status!=='offline' && smartAlertFlags.enabled && safetyActive && next.route && !safetyRequest && now - lastSafetyRequest >= safetyInterval) {
        const path = routeWindow(next.route.geometry.coordinates, next.progress!.along);
        if (path.length >= 2) {
          const request = new AbortController(); safetyRequest = request; lastSafetyRequest = now;
          const fix = lastFix!; const progressMeters = next.progress!.along;
          const timeout = setTimeout(() => request.abort(), 4500);
          void fetchComplianceContext(fix, path, request.signal, vehicleType).then((data) => {
            if (active && !request.signal.aborted && safetyRequest === request) {safetyFailures=0;requestOutcome(true);pilotRuntime.safety(data.limit.status==='verified',data.limit.status==='unknown'&&/stale|expired/.test(data.limit.reason));safetyContext = { data, progressMeters, heading: fix.heading ?? -1 };}
          }).catch(() => { if (safetyRequest === request) {safetyFailures++;requestOutcome(false);pilotRuntime.safety(false);safetyContext = null;} }).finally(() => {
            clearTimeout(timeout);
            if (active && safetyRequest === request) { safetyRequest = null; publish(); }
          });
        }
      }
      let navigationPrompt: string | null = null;
      if (!["navigating", "arrived"].includes(next.state) || !next.gpsReliable || mutedRef.current) voice.stop();
      else { navigationPrompt = gate.next(next, mutedRef.current, now); if (navigationPrompt) { lastVoiceAt = now; void voice.speak(navigationPrompt,{kind:next.state==='arrived'?'arrival':'maneuver',id:`maneuver:${next.route?.id}:${next.progress?.step}:${navigationPrompt}`}); } }
      const alert = alerts.update({ fix: lastFix, speedKmh: next.speedKmh, reliable: next.gpsReliable, navigating: safetyActive,
        progressMeters: next.progress?.along ?? 0, context: safetyContext, now, flags: smartAlertFlags,
        suppressPrompt: !!navigationPrompt || now - lastVoiceAt < 12000 || (next.progress?.turnMeters !== null && next.progress?.turnMeters !== undefined && next.progress.turnMeters < 80) });
      setSmartAlerts(alert);
      if (alert.alert && alertAudioRef.current && !mutedRef.current) { lastVoiceAt = now; void voice.speak(alert.alert.text,{kind:'safety',id:alert.alert.id}); }
      const report=reportedAlerts.update({context:safetyContext,fix:lastFix,progressMeters:next.progress?.along??0,reliable:next.gpsReliable,navigating:safetyActive,
        enabled:smartAlertFlags.enabled&&reportedRoadAlertsEnabled,now,suppressPrompt:!!navigationPrompt||!!alert.alert||now-lastVoiceAt<12000||(next.progress?.turnMeters!==null&&next.progress?.turnMeters!==undefined&&next.progress.turnMeters<80)});
      setReportedRoadAlert(report);
      if(report.alert&&alertAudioRef.current&&!mutedRef.current){lastVoiceAt=now;void voice.speak(report.alert.text,{kind:'community',id:report.alert.id});}
      const traffic = congestion.update({ feed: hazardsRef.current, fix: lastFix, path: next.route?.geometry.coordinates ?? [], progress: next.progress?.along ?? 0, now,
        navigating: safetyActive, audioEnabled: alertAudioRef.current && !mutedRef.current,
        suppressPrompt: !!navigationPrompt || !!alert.alert || !!report.alert || now-lastVoiceAt<12000 || (next.progress?.turnMeters !== null && next.progress?.turnMeters !== undefined && next.progress.turnMeters<80) });
      setCongestionAlert(traffic.nearby);
      if (traffic.speak) { lastVoiceAt=now; void voice.speak(traffic.speak,{kind:'community',id:`congestion:${traffic.nearby?.id}`}); }
      if (next.state === "arrived") { watchGeneration++; watch?.remove(); watch = undefined; rerouteAbort?.abort(); }
    };
    const recalculate = async () => {
      if(networkSnapshot().status==='offline'){machine.snapshot={...machine.snapshot,message:"Off route. Reconnect to calculate a new route. Saved instructions cannot be recalculated offline."};publish();return;}
      if (!lastFix || !machine.beginReroute(Date.now())) return;
      publish();
      const abort = new AbortController(); rerouteAbort = abort;
      try {
        const result = await routingProvider.routes(lastFix.coordinate, [lon, lat], abort.signal);
        if (!active || abort.signal.aborted || machine.snapshot.state !== "rerouting") return;
        const next = result.routes.find((option) => !option.isSample && option.maneuvers.some((step) => step.geometryIndex !== undefined));
        if (!next) throw new Error("No route with maneuver instructions was found.");
        machine.preview(next); machine.start();
      } catch {
        if (active && !abort.signal.aborted) {pilotRuntime.record('reroute_failures');machine.rerouteFailed();}
      } finally { if (active && !abort.signal.aborted) publish(); }
    };
    const startWatch = async () => {
      const generation = ++watchGeneration;
      watch?.remove(); watch = undefined;
      try {
        const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (location) => {
          if (!active || generation !== watchGeneration) return;
          const fix = fromLocation(location);
          observeMotion({speed:fix.speed,accuracy:fix.accuracy,timestamp:fix.timestamp});
          machine.update(fix, Date.now());
          pilotRuntime.gps(Date.now()-fix.timestamp>10000?'stale':machine.snapshot.gpsReliable?'good':'poor');
          if (machine.snapshot.gpsReliable) lastFix = fix;
          publish();
          if (machine.snapshot.state === "off-route") void recalculate();
        }, () => {
          if (!active || generation !== watchGeneration) return;
          machine.fail("GPS location updates stopped. Check location permission, then retry."); publish();
          watchGeneration++; watch?.remove(); watch = undefined;
        });
        if (!active || generation !== watchGeneration) subscription.remove(); else watch = subscription;
      } catch (error) {
        if (active && generation === watchGeneration) { machine.fail(error instanceof Error ? error.message : "GPS could not start."); publish(); }
      }
    };
    const pause = () => {
      machine.pause(); rerouteAbort?.abort(); voice.stop(); watchGeneration++; watch?.remove(); watch = undefined; publish();
    };
    control.current = {
      pause: () => { resumeOnForeground = false; pause(); },
      silence: () => voice.stop(),
      resume: () => { if (machine.snapshot.state === "paused" && foregroundState === "active") { machine.resume(); lastFix = null; publish(); void startWatch(); } },
      stop: () => { machine.stop(); controller.abort(); rerouteAbort?.abort(); voice.stop(); watchGeneration++; watch?.remove(); watch = undefined; publish(); },
    };
    async function start() {
      try {
        setSnapshot({ ...machine.snapshot, message: "Preparing route and checking GPS" });
        await waitForForeground();
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active || controller.signal.aborted) return;
        if (!permission.granted) throw new Error("Location permission is required for guidance.");
        await waitForForeground();
        if (!active || controller.signal.aborted) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancelGps = () => {};
        const cancelled = new Promise<never>((_, reject) => { cancelGps = () => reject(new Error("Navigation ended.")); controller.signal.addEventListener("abort", cancelGps, { once: true }); });
        const fix = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("GPS is taking too long. Check location settings and retry.")), 20000); }), cancelled]).finally(() => { clearTimeout(timer); controller.signal.removeEventListener("abort", cancelGps); });
        if (!active || controller.signal.aborted) return;
        await waitForForeground();
        if (!active || controller.signal.aborted) return;
        if (selected && !selected.maneuvers.some((step) => step.geometryIndex !== undefined)) throw new Error("This selected preview needs updated maneuver positions. Return to Compare route options, refresh and select it again.");
        if(networkSnapshot().status==='offline'){
          if(!selected)throw new Error('Offline. Select a previously saved route; new routes need internet.');
          const saved=offlineData().route;
          if(saved?.option.id===selected.id&&(Date.now()>=saved.expiresAt||Date.now()<saved.savedAt-2000))throw new Error('Saved route data may be outdated. Refresh online before starting.');
          const match=projectOnPath([fix.coords.longitude,fix.coords.latitude],selected.geometry.coordinates);
          if(!match||match.distance>50||match.ambiguous)throw new Error('You are not near the saved route. Reconnect for a new route.');
        }
        const result = selected ?? (await routingProvider.routes([fix.coords.longitude, fix.coords.latitude], [lon!, lat!], controller.signal)).routes[0];
        if (!active || controller.signal.aborted) return;
        await waitForForeground();
        if (!active || controller.signal.aborted) return;
        if (!result) throw new Error("No driving route was found. Return to the map to choose another destination.");
        observeMotion({speed:fix.coords.speed,accuracy:fix.coords.accuracy,timestamp:fix.timestamp});
        machine.preview(result); machine.start(); machine.update(fromLocation(fix), Date.now()); if (machine.snapshot.gpsReliable) lastFix = fromLocation(fix); publish();
        await startWatch();
      } catch (error) {
        if (active && !controller.signal.aborted) { machine.fail(error instanceof Error ? error.message : "Guidance could not start."); publish(); }
      }
    }
    const appState = AppState.addEventListener("change", (state) => {
      foregroundState = state;
      if (state === "active") {
        for (const finish of [...foregroundWaiters]) finish();
        if (resumeOnForeground && machine.snapshot.state === "paused" && !controller.signal.aborted) {
          resumeOnForeground = false; machine.resume(); lastFix = null; publish(); void startWatch();
        }
      }
      else if (["navigating", "off-route", "rerouting"].includes(machine.snapshot.state)) { resumeOnForeground = true; pause(); }
      else voice.stop(); // System permission activities can briefly background startup.
    });
    const timer = setInterval(() => { machine.stale(Date.now());if(foregroundState==='active'&&machine.snapshot.state==='navigating'&&!machine.snapshot.gpsReliable)pilotRuntime.gps('stale');publish(); }, 2000);
    void start();
    return () => { if(!outcome)pilotRuntime.record('nav_cancelled');navigationInteraction(false); active = false; controller.abort(); rerouteAbort?.abort(); safetyRequest?.abort(); watchGeneration++; watch?.remove(); voice.stop(); appState.remove(); clearInterval(timer); control.current = null; };
  }, [lon, lat, selected, retry, vehicleType]);

  return { snapshot, mapFix, mapBearing, voiceError, muted, updatedAt, smartAlerts, alertAudio,reportedRoadAlert,communityHazards,congestionAlert,
    toggleAlertAudio: () => { alertAudioRef.current = !alertAudioRef.current; setAlertAudio(alertAudioRef.current); if (!alertAudioRef.current) control.current?.silence(); },
    toggleMuted: () => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); if (mutedRef.current) control.current?.silence(); },
    pause: () => control.current?.pause(), resume: () => control.current?.resume(), stop: () => control.current?.stop(), retry: () => setRetry((value) => value + 1) };
}
