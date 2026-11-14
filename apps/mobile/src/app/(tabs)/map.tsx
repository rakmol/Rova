import { router } from "expo-router";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef } from "react";
import {
  Keyboard,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { ActionButton, Pill } from "../../components/ui";
import { SafeAreaView } from 'react-native-safe-area-context';
import {JourneySheet} from '../../components/JourneySheet';
import {scrollMenu} from '../../components/scrollMenu';
import { useScrollMenu } from '../../components/ScrollMenuContext';
import { NetworkNotice } from '../../offline/NetworkNotice';
import { useDrivingSafety } from '../../safety/driving';
import { DrivingGate } from '../../safety/DrivingGate';
import { HomeBackGuard } from "../../components/HomeBackGuard";
import { RovaIcon } from "../../components/RovaIcon";
import { useRoutePreview } from "../../map/RouteProvider";
import {
  accraDevelopmentCenter,
  createSearchSessionToken,
  isMapboxConfigured,
  mapboxProvider,
} from "../../map/mapboxProvider";
import { MapboxMap } from "../../map/MapboxMap";
import { VehicleSelector } from "../../components/VehicleSelector";
import { travelDistance, useDriverData } from '../../account/local';
import type {
  Destination,
  DestinationSuggestion,
  MapCoordinate,
} from "../../map/types";
import { useRovaTheme } from "../../theme/ThemeProvider";

type SearchState = "idle" | "loading" | "error";

export default function MapScreen() {
  const { theme } = useRovaTheme();
  const { height: screenHeight, fontScale } = useWindowDimensions();
  const mapHeight = Math.max(240, Math.min(390, screenHeight * (fontScale >= 1.5 ? 0.34 : 0.42)));
  const {preferences,places}=useDriverData();
  const menu=useScrollMenu();
  const {setHidden:setMenuHidden}=menu;
  const motion=useDrivingSafety();
  const trackScroll=useMemo(()=>scrollMenu(setMenuHidden),[setMenuHidden]);
  const [dockHeight,setDockHeight]=useState(210);
  const { vehicleType, setVehicleType, route, setRoute, pickedDestination, setPickedDestination, selectedRoutingOption, setSelectedRoutingOption } = useRoutePreview();
  const mapboxConfigured = isMapboxConfigured();
  const sessionToken = useRef(createSearchSessionToken());
  const currentLocationRef = useRef<MapCoordinate | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [center, setCenter] = useState<MapCoordinate>(accraDevelopmentCenter);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchInputRef=useRef<ComponentRef<typeof TextInput>>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const closeSearch=useCallback(()=>{
    if(!searchFocused)return false;
    searchInputRef.current?.blur();Keyboard.dismiss();setSearchFocused(false);setSearchEnabled(false);setSuggestions([]);setSearchMessage(null);setSearchState('idle');setMenuHidden(false);return true;
  },[searchFocused,setMenuHidden]);
  useEffect(()=>{if(motion.locked&&!motion.passenger){Keyboard.dismiss();}},[motion.locked,motion.passenger]);

  useEffect(() => {
    if (!mapboxConfigured) return;
    let active = true;
    mapboxProvider
      .initialize()
      .then(() => {
        if (active) setMapReady(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setMapError(
            error instanceof Error ? error.message : "Mapbox could not be initialized.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [mapboxConfigured]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!mapboxConfigured || !searchEnabled || trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchState("loading");
      setSearchMessage(null);
      mapboxProvider
        .searchDestinations(
          trimmedQuery,
          sessionToken.current,
          currentLocationRef.current ?? accraDevelopmentCenter,
          controller.signal,
        )
        .then((results) => {
          if (controller.signal.aborted) return;
          setSuggestions(results);
          setSearchState("idle");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof Error && error.name === "AbortError") return;
          setSearchState("error");
          setSearchMessage(
            error instanceof Error ? error.message : "Destination search failed.",
          );
        });
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mapboxConfigured, query, searchEnabled]);

  const buildRoute = useCallback(async (
    destination: Destination,
    origin: MapCoordinate | null = currentLocationRef.current,
  ) => {
    setSelectedRoutingOption(null);
    setRoute(null);
    setRouteError(null);
    setRouteLoading(true);
    const liveOrigin = origin !== null;
    const routeOrigin = origin ?? accraDevelopmentCenter;
    try {
      const mapRoute = await mapboxProvider.requestRoute(
        routeOrigin,
        destination.coordinate,
      );
      setRoute({
        ...mapRoute,
        originIsLive: liveOrigin,
        originLabel: liveOrigin ? "Your location" : "Accra development center",
        destinationLabel: destination.name,
      });
      return mapRoute;
    } catch (error) {
      setRouteError(
        error instanceof Error ? error.message : "A route could not be calculated.",
      );
    } finally {
      setRouteLoading(false);
    }
  }, [setRoute, setSelectedRoutingOption]);

  useEffect(() => {
    if (!pickedDestination) return;
    const frame = requestAnimationFrame(() => {
      setSelectedDestination(pickedDestination);
      setCenter(pickedDestination.coordinate);
      setQuery(pickedDestination.name);
      setSearchEnabled(false);
      setPickedDestination(null);
      void buildRoute(pickedDestination);
    });
    return () => cancelAnimationFrame(frame);
  }, [pickedDestination, setPickedDestination, buildRoute]);

  async function handleSelectDestination(suggestion: DestinationSuggestion) {
    closeSearch();
    Keyboard.dismiss();
    setSelectingId(suggestion.id);
    setSearchEnabled(false);
    setSuggestions([]);
    setSearchMessage(null);
    try {
      const destination = await mapboxProvider.retrieveDestination(
        suggestion,
        sessionToken.current,
      );
      sessionToken.current = createSearchSessionToken();
      setSelectedDestination(destination);
      setQuery(destination.name);
      setCenter(destination.coordinate);
      await buildRoute(destination);
    } catch (error) {
      setSearchState("error");
      setSearchMessage(
        error instanceof Error ? error.message : "The destination could not be loaded.",
      );
    } finally {
      setSelectingId(null);
    }
  }

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {setKeyboardHeight(0);setSearchFocused(false);setMenuHidden(false);});
    return () => { shown.remove(); hidden.remove(); };
  }, [setMenuHidden]);

  async function handleLocate() {
    if (!mapboxConfigured) return;
    setLocationStatus(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationEnabled(false);
        setLocationStatus(
          "Location permission is off. You can still preview a route from the Accra development center.",
        );
        return;
      }

      setLocationEnabled(true);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate: MapCoordinate = [
        position.coords.longitude,
        position.coords.latitude,
      ];
      currentLocationRef.current = coordinate;
      setCenter(coordinate);
      if (selectedDestination) {
        await buildRoute(selectedDestination, coordinate);
      }
    } catch (error) {
      setLocationStatus(
        error instanceof Error ? error.message : "Your current location is unavailable.",
      );
    }
  }

  const { distanceMeters = 0, durationSeconds = 0, trafficAware = false } = route ?? {};

  const openSaved=(kind:'home'|'work')=>{const place=places.find(p=>p.kind===kind);if(place){setPickedDestination({name:place.label,detail:place.address,coordinate:[place.lon,place.lat]});}else router.navigate('/(tabs)/saved');};
  return <View style={[styles.screen,{backgroundColor:theme.colors.background}]}>
    <HomeBackGuard closeSearch={closeSearch}/>
    <View style={StyleSheet.absoluteFill} testID="explore-map-background">
      {mapReady?<MapboxMap fill center={center} destination={selectedDestination?.coordinate} locationEnabled={locationEnabled} routeGeometry={selectedRoutingOption?.geometry??route?.geometry} mapBottomInset={dockHeight+(menu.hidden?(menu.safeBottom??0):menu.height)} controlsTopInset={110} onMapLoaded={()=>{setMapLoaded(true);setMapLoadError(null);}} onMapError={setMapLoadError}/>:<View style={[styles.placeholder,{backgroundColor:theme.colors.surfaceRaised}]}><Text style={{color:theme.colors.ink}}>{mapError?'Map could not be loaded':mapboxConfigured?'Loading the Accra map':'Mapbox token required'}</Text></View>}
    </View>
    <Animated.View pointerEvents="box-none" style={[styles.screen,{paddingBottom:menu.bottomInset??menu.height}]}><SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.screen}>
      <View style={styles.floatingTop}>
        <View style={[styles.search,{backgroundColor:theme.colors.surface,boxShadow:theme.mode==='dark'?'0 3px 14px rgba(0,0,0,.28)':'0 3px 14px rgba(16,42,53,.12)'}]}>
          {searchFocused?<Pressable accessibilityRole="button" accessibilityLabel="Close destination search" onPress={closeSearch} style={styles.profile}><RovaIcon name="back" color={theme.colors.brandStrong}/></Pressable>:<RovaIcon name="search" color={theme.colors.brandStrong}/>}
          <TextInput ref={searchInputRef} accessibilityLabel="Search destinations in Ghana" editable={mapboxConfigured&&selectingId===null&&(!motion.locked||motion.passenger)} value={query} placeholder="Search here" placeholderTextColor={theme.colors.inkMuted} maxLength={256} autoCorrect={false} style={[styles.input,{color:theme.colors.ink}]} onFocus={()=>{setSearchFocused(true);setSearchEnabled(true);setMenuHidden(false);}} onBlur={()=>setSearchFocused(false)} onChangeText={text=>{setQuery(text);setSearchEnabled(true);setSelectedDestination(null);setRoute(null);setRouteError(null);setSuggestions([]);setSearchState('idle');setSearchMessage(null);}}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={()=>router.navigate('/(tabs)/settings')} style={[styles.profile,{backgroundColor:theme.colors.brandTint}]}><RovaIcon name="account" color={theme.colors.brandStrong}/></Pressable>
        </View>
        {(!motion.locked||motion.passenger)&&searchFocused&&(searchState==='loading'||searchMessage||suggestions.length>0)&&<View style={[styles.searchResults,{backgroundColor:theme.colors.surface}]}>
          {searchState==='loading'&&<Text style={{color:theme.colors.inkMuted}}>Searching places...</Text>}
          {searchMessage&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{searchMessage}</Text>}
          {!!suggestions.length&&<ScrollView testID="destination-suggestions" keyboardShouldPersistTaps="always" keyboardDismissMode="none" nestedScrollEnabled style={{maxHeight:240}}>{suggestions.map(suggestion=><Pressable key={suggestion.id} accessibilityRole="button" accessibilityLabel={'Choose '+suggestion.name} disabled={selectingId!==null} onPress={()=>void handleSelectDestination(suggestion)} style={[styles.result,{borderBottomColor:theme.colors.divider}]}><RovaIcon name="locate" color={theme.colors.inkMuted}/><View style={{flex:1,gap:4}}><Text style={[styles.rowTitle,{color:theme.colors.ink}]}>{selectingId===suggestion.id?'Loading destination...':suggestion.name}</Text><Text style={{color:theme.colors.inkMuted}}>{suggestion.detail}</Text></View></Pressable>)}</ScrollView>}
        </View>}
      </View>
      <View style={styles.mapSpace} pointerEvents="box-none">
        {mapReady&&<Pressable accessibilityRole="button" accessibilityLabel="Locate me" onPress={()=>void handleLocate()} style={[styles.locate,{backgroundColor:theme.colors.surface}]}><RovaIcon name="locate" color={theme.colors.brandStrong}/></Pressable>}
      </View>
      {(!searchFocused||(motion.locked&&!motion.passenger))&&<JourneySheet key={selectedDestination?.coordinate.join(',')??'explore'} initialExpanded={!!selectedDestination} onSettled={setDockHeight} footer={route&&selectedDestination&&(!motion.locked||motion.passenger)&&<View testID="persistent-route-start" style={{paddingHorizontal:20,paddingBottom:12,paddingTop:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:theme.colors.divider}}><ActionButton title={route.originIsLive?'Start navigation':'Locate me to navigate'} onPress={()=>{if(route.originIsLive)router.push('/navigation');else void handleLocate();}}/></View>}>
        <ScrollView testID="explore-journey-content" keyboardShouldPersistTaps="handled" style={{flex:1,minHeight:0}} onScroll={event=>trackScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16} contentContainerStyle={styles.sheetContent}>
          <DrivingGate><NetworkNotice/>
          <View style={styles.heading}><Text accessibilityRole="header" style={[styles.sheetTitle,{color:theme.colors.ink}]}>{selectedDestination?.name??'Explore with ROVA'}</Text><Text style={{color:theme.colors.inkMuted,fontSize:12}}>Ghana</Text></View>
          {mapReady&&(!mapLoaded||mapLoadError)&&<Text accessibilityRole={mapLoadError?'alert':'summary'} style={{color:theme.colors.inkMuted}}>{mapLoadError??'Loading streets...'}</Text>}
          {routeLoading&&<Text accessibilityLiveRegion="polite" style={{color:theme.colors.inkMuted}}>Calculating route...</Text>}
          {routeError&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{routeError}</Text>}
          {locationStatus&&<Text accessibilityRole="alert" style={{color:theme.colors.warning}}>{locationStatus}</Text>}
          {route&&selectedDestination?<>
            <View style={styles.routeMetrics}><Text style={[styles.duration,{color:theme.colors.brandStrong}]}>{Math.max(1,Math.round((selectedRoutingOption?.durationSeconds??durationSeconds)/60))} min</Text><Text style={{color:theme.colors.inkMuted}}>{travelDistance(selectedRoutingOption?.distanceMeters??distanceMeters,preferences.units)} | estimate</Text><Pill tone="neutral">{trafficAware?'TRAFFIC UNVERIFIED':'NO LIVE TRAFFIC'}</Pill></View>
            <VehicleSelector compact value={vehicleType} onChange={setVehicleType}/>
            <View style={{flex:1,minWidth:140}}><ActionButton title="Compare route options" secondary onPress={()=>router.push({pathname:'/route-options',params:{origin:route.origin.join(','),destination:route.destination.join(','),title:route.destinationLabel}})}/></View>
            <Text style={{color:theme.colors.inkMuted,fontSize:12}}>{route.originIsLive?'From your location':'Preview from Accra city centre; locate yourself before navigating.'} | Toll information {selectedRoutingOption?.tolls??'unknown'}.</Text>
          </>:<View style={styles.actions}>
            {([{label:'Home',icon:'home',press:()=>openSaved('home')},{label:'Work',icon:'work',press:()=>openSaved('work')},{label:'Contribute',icon:'contribute',press:()=>router.navigate('/(tabs)/contribute')}] as const).map(item=><Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={item.press} style={[styles.shortcut,{backgroundColor:theme.colors.surfaceRaised}]}><RovaIcon name={item.icon} color={theme.colors.brandStrong}/><Text style={[styles.rowTitle,{color:theme.colors.ink}]}>{item.label}</Text></Pressable>)}
          </View>}
          <Pressable accessibilityRole="button" accessibilityLabel="Search destinations & recent searches" onPress={()=>router.push('/destination-search')} style={styles.result}><RovaIcon name="search" color={theme.colors.inkMuted}/><Text style={{color:theme.colors.ink,flex:1}}>Recent searches & saved places</Text><RovaIcon name="chevron" color={theme.colors.inkMuted}/></Pressable>
          </DrivingGate>
        </ScrollView>
      </JourneySheet>}
      {searchFocused&&(!motion.locked||motion.passenger)&&<View style={{height:Math.max(0,Math.min(mapHeight,keyboardHeight?0:48))}}/>}
    </SafeAreaView></Animated.View>
  </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1},placeholder:{flex:1,alignItems:'center',justifyContent:'center'},floatingTop:{marginHorizontal:14,marginTop:8,zIndex:2},search:{minHeight:58,borderRadius:30,flexDirection:'row',alignItems:'center',paddingLeft:18,paddingRight:7,gap:10},input:{flex:1,minWidth:0,minHeight:54,fontSize:17,paddingVertical:10},profile:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},searchResults:{marginTop:6,padding:12,borderRadius:22},mapSpace:{flex:1,minHeight:60,alignItems:'flex-end',justifyContent:'flex-end',padding:14},locate:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',boxShadow:'0 2px 10px rgba(0,0,0,.14)'},sheet:{borderTopLeftRadius:28,borderTopRightRadius:28,boxShadow:'0 -2px 16px rgba(0,0,0,.10)'},sheetHandle:{minHeight:30,alignItems:'center',justifyContent:'center'},handle:{width:36,height:4,borderRadius:2},sheetContent:{paddingHorizontal:20,paddingBottom:16,gap:14},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},sheetTitle:{fontSize:22,fontWeight:'700',flex:1},rowTitle:{fontSize:15,fontWeight:'600'},routeMetrics:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:10},duration:{fontSize:26,fontWeight:'800'},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},shortcut:{flex:1,minWidth:82,minHeight:76,borderRadius:20,alignItems:'center',justifyContent:'center',gap:7},result:{minHeight:64,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,borderBottomWidth:StyleSheet.hairlineWidth}
});
