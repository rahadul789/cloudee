import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, { Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/src/components/pressable-scale";
import { appAlert } from "@/src/lib/app-alert";
import { styles } from "@/src/components/location/location-picker.styles";
import {
  useCustomerSaveLocationMutation,
  useCustomerMapStyleQuery,
  useCustomerUpdateLocationMutation,
} from "@/src/hooks/use-customer-api";
import {
  buildCustomerAddressFromGeocode,
  buildCustomerLabelFromGeocode,
  formatCustomerAddressLine,
} from "@/src/lib/location-address";
import { openLocationPermissionSettings } from "@/src/lib/location-permissions";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type { SavedLocation } from "@/src/types/location";

const DEFAULT_LOCATION_PICKER_DELTA = 0.0045;

// "Save as" presets — the label shown in the address switcher (Other keeps the
// auto-detected area name).
const LABEL_PRESETS: { key: "Home" | "Work" | "Other"; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "Home", icon: "home-outline" },
  { key: "Work", icon: "briefcase-outline" },
  { key: "Other", icon: "location-outline" },
];
type LabelPreset = (typeof LABEL_PRESETS)[number]["key"];

// Tap-to-add guideline for typing the address by hand: what riders actually need.
const ADDRESS_GUIDE = ["House / Holding", "Road", "Floor", "Flat", "Landmark"];
const DEFAULT_LOCATION_PICKER_ZOOM = 17;
const MIN_LOCATION_PICKER_ZOOM = 14;
const MAX_LOCATION_PICKER_ZOOM = 20;

function showLocationSettingsAlert() {
  appAlert(
    "Location access needed",
    "Open phone settings and allow location access for Foodbela.",
    [
      { text: "Not now", style: "cancel" },
      {
        text: "Open settings",
        onPress: () => {
          void openLocationPermissionSettings();
        },
      },
    ],
    { icon: "location-outline" },
  );
}

export default function LocationPickerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ delta?: string; useCurrent?: string }>();
  const mapDelta = useMemo(() => {
    const raw = Number(params.delta);
    if (Number.isFinite(raw) && raw > 0 && raw <= 0.02) {
      return raw;
    }
    return DEFAULT_LOCATION_PICKER_DELTA;
  }, [params.delta]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  const hasAppliedInitialCameraRef = useRef(false);
  const isMountedRef = useRef(true);
  const hasReturnedRef = useRef(false);
  const reverseGeocodeRequestIdRef = useRef(0);
  const reverseGeocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pinPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const isDraggingRef = useRef(false);

  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const currentCoordinates = useLocationStore(
    (state) => state.currentCoordinates,
  );
  // Opened from the home "are you somewhere else?" reminder: start at the phone's position
  // and save as a NEW address (never overwrite the old saved one, e.g. "Home").
  const startFromCurrent = params.useCurrent === "1" && Boolean(currentCoordinates);
  const upsertSavedLocation = useLocationStore(
    (state) => state.upsertSavedLocation,
  );
  const hydrateSavedLocations = useLocationStore(
    (state) => state.hydrateSavedLocations,
  );
  const setSelectedLocation = useLocationStore(
    (state) => state.setSelectedLocation,
  );
  const isAuthenticated = useCustomerAuthStore((state) =>
    Boolean(state.accessToken),
  );
  const saveLocationMutation = useCustomerSaveLocationMutation();
  const updateLocationMutation = useCustomerUpdateLocationMutation();
  const pickerMapStyleQuery = useCustomerMapStyleQuery("customer.location_picker");
  // Apply the custom style as a prop (Android applies it in place) rather than keying
  // the MapView on it — keying remounts the whole Google Maps view when the style
  // resolves after mount, which is the visible "slow"/double load when opening the map.
  const resolvedMapStyle = pickerMapStyleQuery.data ?? undefined;

  const initialLabel = selectedLocation?.label ?? "Delivery point";
  const initialAddress = formatCustomerAddressLine(selectedLocation?.address);
  const initialAddressDetails = selectedLocation?.addressDetails ?? "";

  const [label, setLabel] = useState(initialLabel);
  const [address, setAddress] = useState(initialAddress);
  const [manualNote, setManualNote] = useState(initialAddressDetails);
  const [labelPreset, setLabelPreset] = useState<LabelPreset | null>(
    initialLabel === "Home" || initialLabel === "Work" ? initialLabel : null,
  );
  const detailsInputRef = useRef<TextInput | null>(null);
  const [overlayHeight, setOverlayHeight] = useState(0);

  // Guideline chip → appends "Road: " etc. and puts the cursor there.
  const addGuidePart = (part: string) => {
    setManualNote((current) => {
      const trimmed = current.trim();
      const next = `${trimmed}${trimmed ? ", " : ""}${part}: `;
      return next.slice(0, 200);
    });
    detailsInputRef.current?.focus();
  };
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isLoadingInitialRegion, setIsLoadingInitialRegion] = useState(
    !selectedLocation && !currentCoordinates,
  );
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [region, setRegion] = useState<Region | null>(
    startFromCurrent && currentCoordinates
      ? {
          latitude: currentCoordinates.latitude,
          longitude: currentCoordinates.longitude,
          latitudeDelta: mapDelta,
          longitudeDelta: mapDelta,
        }
      : selectedLocation
      ? {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          latitudeDelta: mapDelta,
          longitudeDelta: mapDelta,
        }
      : currentCoordinates
        ? {
            latitude: currentCoordinates.latitude,
            longitude: currentCoordinates.longitude,
            latitudeDelta: mapDelta,
            longitudeDelta: mapDelta,
          }
        : null,
  );

  const pinLift = useRef(new Animated.Value(0)).current;
  const pinPulse = useRef(new Animated.Value(1)).current;
  const pinBob = useRef(new Animated.Value(0)).current;
  const pinHalo = useRef(new Animated.Value(0)).current;
  const currentPulse = useRef(new Animated.Value(1)).current;
  const locateRadar = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(locateRadar, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [locateRadar]);
  const manualFieldPulse = useRef(new Animated.Value(0)).current;

  const isConfirming = useMemo(
    () =>
      isSubmitting ||
      saveLocationMutation.isPending ||
      updateLocationMutation.isPending,
    [
      isSubmitting,
      saveLocationMutation.isPending,
      updateLocationMutation.isPending,
    ],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      reverseGeocodeRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const bobAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pinBob, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pinBob, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const haloAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pinHalo, {
          toValue: 1,
          duration: 1500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pinHalo, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    bobAnimation.start();
    haloAnimation.start();

    return () => {
      bobAnimation.stop();
      haloAnimation.stop();
      pinPulseLoopRef.current?.stop();
      if (reverseGeocodeTimerRef.current) {
        clearTimeout(reverseGeocodeTimerRef.current);
      }
    };
  }, [pinBob, pinHalo]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const resolveAddress = useCallback(
    async (latitude: number, longitude: number, _preserveManual = true) => {
      const requestId = reverseGeocodeRequestIdRef.current + 1;
      reverseGeocodeRequestIdRef.current = requestId;

      if (isMountedRef.current) {
        setIsResolvingAddress(true);
      }

      try {
        const result = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        if (
          !isMountedRef.current ||
          requestId !== reverseGeocodeRequestIdRef.current
        ) {
          return;
        }

        const first = result[0];
        if (!first) return;

        const nextAddress = buildCustomerAddressFromGeocode(first, "");

        if (nextAddress) {
          setAddress(nextAddress);
        }

        const nextLabel = buildCustomerLabelFromGeocode(first, "");
        if (nextLabel) {
          setLabel(nextLabel);
        }
      } catch {
        // Keep manual input if reverse geocoding fails.
      } finally {
        if (
          isMountedRef.current &&
          requestId === reverseGeocodeRequestIdRef.current
        ) {
          setIsResolvingAddress(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    async function ensureInitialRegion() {
      if (region) {
        setIsLoadingInitialRegion(false);
        return;
      }

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          if (isMounted) {
            setIsLoadingInitialRegion(false);
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!isMounted) return;

        const nextRegion = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: mapDelta,
          longitudeDelta: mapDelta,
        };
        setRegion(nextRegion);
        void resolveAddress(nextRegion.latitude, nextRegion.longitude, false);
      } finally {
        if (isMounted) {
          setIsLoadingInitialRegion(false);
        }
      }
    }

    void ensureInitialRegion();

    return () => {
      isMounted = false;
    };
  }, [mapDelta, region, resolveAddress]);

  const applyInitialCamera = useCallback(() => {
    if (!region || hasAppliedInitialCameraRef.current || !mapRef.current) {
      return;
    }

    hasAppliedInitialCameraRef.current = true;
    mapRef.current.animateCamera(
      {
        center: {
          latitude: region.latitude,
          longitude: region.longitude,
        },
        zoom: DEFAULT_LOCATION_PICKER_ZOOM,
        heading: 0,
        pitch: 0,
      },
      { duration: 0 },
    );
  }, [region]);

  useEffect(() => {
    if (startFromCurrent) return;
    setLabel(initialLabel);
    setAddress(initialAddress);
    setManualNote(initialAddressDetails);
  }, [initialAddress, initialAddressDetails, initialLabel, startFromCurrent]);

  // Starting from the phone's position: fresh address for that spot, no old details/label.
  const startedFromCurrentRef = useRef(false);
  useEffect(() => {
    if (!startFromCurrent || startedFromCurrentRef.current || !currentCoordinates) return;
    startedFromCurrentRef.current = true;
    setLabel("");
    setAddress("");
    setManualNote("");
    setLabelPreset(null);
    void resolveAddress(currentCoordinates.latitude, currentCoordinates.longitude, false);
  }, [currentCoordinates, resolveAddress, startFromCurrent]);

  function startDraggingPin() {
    if (isDraggingRef.current) return;
    isDraggingRef.current = true;

    Animated.timing(pinLift, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    pinPulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pinPulse, {
          toValue: 1.08,
          duration: 320,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pinPulse, {
          toValue: 1,
          duration: 320,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pinPulseLoopRef.current.start();
  }

  function pulseManualField() {
    manualFieldPulse.stopAnimation();
    manualFieldPulse.setValue(0);
    Animated.sequence([
      Animated.timing(manualFieldPulse, {
        toValue: 1,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(manualFieldPulse, {
        toValue: 0,
        duration: 90,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(manualFieldPulse, {
        toValue: 1,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(manualFieldPulse, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();
  }

  function stopDraggingPin() {
    isDraggingRef.current = false;
    pinPulseLoopRef.current?.stop();
    pinPulse.setValue(1);

    Animated.timing(pinLift, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function handleRegionChange() {
    startDraggingPin();
  }

  function handleRegionChangeComplete(nextRegion: Region) {
    stopDraggingPin();
    setRegion(nextRegion);
    pulseManualField();

    if (reverseGeocodeTimerRef.current) {
      clearTimeout(reverseGeocodeTimerRef.current);
    }

    reverseGeocodeTimerRef.current = setTimeout(() => {
      void resolveAddress(nextRegion.latitude, nextRegion.longitude);
    }, 260);
  }

  async function handleGoToCurrentLocation() {
    setIsLocating(true);

    Animated.sequence([
      Animated.timing(currentPulse, {
        toValue: 1.08,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(currentPulse, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!isMountedRef.current) return;

      if (permission.status !== "granted") {
        showLocationSettingsAlert();
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!isMountedRef.current) return;

      const nextRegion = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        latitudeDelta: mapDelta,
        longitudeDelta: mapDelta,
      };
      setRegion(nextRegion);
      mapRef.current?.animateCamera(
        {
          center: {
            latitude: nextRegion.latitude,
            longitude: nextRegion.longitude,
          },
          zoom: DEFAULT_LOCATION_PICKER_ZOOM,
          heading: 0,
          pitch: 0,
        },
        { duration: 320 },
      );
      await resolveAddress(nextRegion.latitude, nextRegion.longitude, false);
    } finally {
      if (isMountedRef.current) {
        setIsLocating(false);
      }
    }
  }

  async function handleConfirm() {
    if (isConfirming) {
      return;
    }
    if (!region) {
      appAlert(
        "Location unavailable",
        "Please allow location access and try again.",
        undefined,
        { icon: "location-outline" },
      );
      return;
    }
    if (!address.trim()) {
      appAlert(
        "Address required",
        "Please wait for the map address or move the pin slightly before saving.",
        undefined,
        { icon: "map-outline" },
      );
      return;
    }

    const finalAddress = formatCustomerAddressLine(
      address,
      "Selected location",
    );
    const addressDetails = manualNote.trim();

    setIsSubmitting(true);

    const nextLocation: SavedLocation = {
      id:
        startFromCurrent || !selectedLocation?.id || selectedLocation.id === "current-location"
          ? `loc-${Date.now()}`
          : selectedLocation.id,
      label:
        (labelPreset && labelPreset !== "Other" ? labelPreset : label).trim() ||
        "Selected location",
      address: finalAddress,
      addressDetails,
      latitude: region.latitude,
      longitude: region.longitude,
      source: !startFromCurrent && selectedLocation?.source === "saved" ? "saved" : "manual",
    };

    setSelectedLocation(nextLocation);
    upsertSavedLocation(nextLocation);

    hasReturnedRef.current = true;
    startTransition(() => {
      router.back();
    });

    if (!isAuthenticated) {
      return;
    }

    void (async () => {
      try {
        const shouldUpdateExistingLocation =
          !startFromCurrent &&
          Boolean(selectedLocation?.id) &&
          selectedLocation?.id !== "current-location" &&
          !selectedLocation?.id.startsWith("loc-");
        const locations = shouldUpdateExistingLocation
          ? await updateLocationMutation.mutateAsync({
              locationId: selectedLocation!.id,
              label: nextLocation.label,
              address: nextLocation.address,
              addressDetails: nextLocation.addressDetails,
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              source: nextLocation.source,
            })
          : await saveLocationMutation.mutateAsync({
              label: nextLocation.label,
              address: nextLocation.address,
              addressDetails: nextLocation.addressDetails,
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              source: nextLocation.source,
            });

        const nextLocations = locations.map((item) => ({
          id: item.id,
          label: item.label,
          address: formatCustomerAddressLine(item.address, "Selected location"),
          addressDetails: item.addressDetails,
          latitude: item.latitude,
          longitude: item.longitude,
          source: item.source,
          isDefault: item.isDefault,
          lastUsedAt: item.lastUsedAt,
        }));
        hydrateSavedLocations(nextLocations);
        const matchedLocation =
          nextLocations.find(
            (item) =>
              item.latitude === nextLocation.latitude &&
              item.longitude === nextLocation.longitude &&
              item.address === nextLocation.address,
          ) ?? nextLocations[0];

        if (matchedLocation) {
          setSelectedLocation(matchedLocation);
        }
      } catch {
        // Keep the optimistic local location even if account sync is slow or unavailable.
      } finally {
        if (isMountedRef.current && !hasReturnedRef.current) {
          setIsSubmitting(false);
        }
      }
    })();
  }

  const bottomOffset = keyboardHeight
    ? keyboardHeight + 8
    : Math.max(insets.bottom, 12);
  // Equal top/bottom padding keeps the camera centre (= the pin) at the screen centre while
  // lifting the Google logo above the floating card.
  // Capped so the two paddings never eat the map (Google needs a usable centre area).
  const mapEdge = overlayHeight
    ? Math.min(overlayHeight + bottomOffset, Math.round(windowHeight * 0.42))
    : 0;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" translucent />

      {/* Full-screen map; everything else floats on top of it. */}
      <View style={StyleSheet.absoluteFill}>
        {region ? (
          <>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              minZoomLevel={MIN_LOCATION_PICKER_ZOOM}
              maxZoomLevel={MAX_LOCATION_PICKER_ZOOM}
              showsCompass={false}
              // pitch is disabled (always top-down), so 3D buildings never render
              // anyway — turning them and indoor floor plans off is a pure GPU win.
              showsBuildings={false}
              showsIndoors={false}
              customMapStyle={resolvedMapStyle}
              toolbarEnabled={false}
              showsUserLocation
              showsMyLocationButton={false}
              rotateEnabled={false}
              pitchEnabled={false}
              onMapReady={applyInitialCamera}
              onRegionChange={handleRegionChange}
              onRegionChangeComplete={handleRegionChangeComplete}
              mapPadding={{ top: mapEdge, bottom: mapEdge, left: 0, right: 0 }}
            />

            <View pointerEvents="none" style={styles.centerPinWrap}>
              {/* Tooltip above the pin — hides while the map is moving. */}
              <Animated.View
                style={[
                  styles.pinTooltip,
                  {
                    opacity: pinLift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0],
                    }),
                  },
                ]}
              >
                <Text style={styles.pinTooltipText}>Your order will be delivered here</Text>
                <View style={styles.pinTooltipArrow} />
              </Animated.View>

              <Animated.View
                style={[
                  styles.pinShadow,
                  {
                    transform: [
                      {
                        scale: pinLift.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.72],
                        }),
                      },
                    ],
                    opacity: pinLift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.22, 0.08],
                    }),
                  },
                ]}
              />

              <Animated.View
                style={[
                  styles.pinHalo,
                  {
                    transform: [
                      {
                        scale: pinHalo.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.7, 1.45],
                        }),
                      },
                    ],
                    opacity: pinHalo.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.24, 0],
                    }),
                  },
                ]}
              />

              <Animated.View
                style={[
                  styles.pinWrap,
                  {
                    transform: [
                      {
                        translateY: pinLift.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -18],
                        }),
                      },
                      {
                        translateY: pinBob.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -4],
                        }),
                      },
                      { scale: pinPulse },
                    ],
                  },
                ]}
              >
                <Ionicons name="location" size={44} color={palette.primary} style={styles.pinIcon} />
              </Animated.View>
            </View>
          </>
        ) : (
          <View style={styles.mapFallback}>
            {isLoadingInitialRegion ? (
              <>
                <ActivityIndicator size="small" color={palette.secondary} />
                <Text style={styles.mapFallbackTitle}>Opening the map…</Text>
                <Text style={styles.mapFallbackText}>
                  Finding your current location so you can fine-tune it.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.mapFallbackIcon}>
                  <Ionicons name="location-outline" size={26} color={palette.secondary} />
                </View>
                <Text style={styles.mapFallbackTitle}>Location access is needed</Text>
                <Text style={styles.mapFallbackText}>
                  Allow location access, then reopen the map to choose your exact delivery
                  point.
                </Text>
                <PressableScale
                  scaleTo={0.97}
                  style={styles.mapFallbackButton}
                  onPress={() => void openLocationPermissionSettings()}
                >
                  <Ionicons name="settings-outline" size={16} color={palette.onPrimary} />
                  <Text style={styles.mapFallbackButtonText}>Open settings</Text>
                </PressableScale>
              </>
            )}
          </View>
        )}
      </View>

      {/* Top overlay: back + title pill. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.roundButton, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={6}
        >
          <Ionicons name="arrow-back" size={20} color={palette.foreground} />
        </Pressable>
        <View style={styles.titlePill}>
          <Ionicons name="navigate-circle" size={18} color={palette.secondary} />
          <View style={styles.titleCopy}>
            <Text style={styles.titleText}>Set delivery point</Text>
            <Text style={styles.titleSub} numberOfLines={1}>
              Drag the map to place the pin on your door
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom overlay: locate FAB + the info card. */}
      <View
        style={[styles.bottomArea, { bottom: bottomOffset }]}
        pointerEvents="box-none"
        onLayout={(event) => {
          if (!keyboardHeight) setOverlayHeight(Math.round(event.nativeEvent.layout.height));
        }}
      >
        {region ? (
          <Animated.View
            style={[styles.locateFabWrap, { transform: [{ scale: currentPulse }] }]}
          >
            {/* Radar ring behind the pill: "tap here for your current location". */}
            {!isLocating ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.locateRadar,
                  {
                    opacity: locateRadar.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                    transform: [
                      { scaleX: locateRadar.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
                      { scaleY: locateRadar.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) },
                    ],
                  },
                ]}
              />
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.locatePill, pressed ? styles.pressed : null]}
              onPress={handleGoToCurrentLocation}
              disabled={isLocating}
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
            >
              {isLocating ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <Ionicons name="locate" size={18} color={palette.onPrimary} />
              )}
              <Text style={styles.locatePillText}>
                {isLocating ? "Finding you…" : "Use my location"}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <View style={styles.card}>
          {/* Address resolved from the pin */}
          <View style={styles.addressRow}>
            <View style={styles.addressIcon}>
              <Ionicons name="location" size={18} color={palette.onPrimary} />
            </View>
            <View style={styles.addressCopy}>
              <Text style={styles.addressTitle} numberOfLines={2}>
                {isResolvingAddress && !address
                  ? "Finding address…"
                  : address || "Move the map to choose your spot"}
              </Text>
              <Text style={styles.addressHint} numberOfLines={1}>
                {isResolvingAddress ? "Updating from the pin…" : "Detected from the pin"}
              </Text>
            </View>
            {isResolvingAddress ? (
              <ActivityIndicator size="small" color={palette.secondary} />
            ) : null}
          </View>

          {/* Save as */}
          <View style={styles.presetRow}>
            {LABEL_PRESETS.map((preset) => {
              const active = labelPreset === preset.key;
              return (
                <PressableScale
                  key={preset.key}
                  scaleTo={0.95}
                  onPress={() => setLabelPreset(active ? null : preset.key)}
                  style={[styles.presetChip, active ? styles.presetChipActive : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={preset.icon}
                    size={14}
                    color={active ? palette.onPrimary : palette.mutedForeground}
                  />
                  <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>
                    {preset.key}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* Manual details with a guideline */}
          <View style={styles.detailsBlock}>
            <Text style={styles.detailsLabel}>Help the rider find you</Text>
            <Animated.View
              style={[
                styles.inputShell,
                {
                  borderColor: manualFieldPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["#E6E6E6", palette.primary],
                  }),
                },
              ]}
            >
              <TextInput
                ref={detailsInputRef}
                value={manualNote}
                onChangeText={setManualNote}
                placeholder="e.g. House 12, Road 5, 3rd floor, Flat B — near City Bank"
                placeholderTextColor={palette.placeholder}
                selectionColor={palette.secondary}
                style={styles.input}
                multiline
                maxLength={200}
                textAlignVertical="top"
                underlineColorAndroid="transparent"
              />
            </Animated.View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={styles.guideRow}
            >
              {ADDRESS_GUIDE.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => addGuidePart(item)}
                  style={({ pressed }) => [styles.guideChip, pressed ? styles.pressed : null]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item}`}
                >
                  <Ionicons name="add" size={13} color={palette.secondary} />
                  <Text style={styles.guideText}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <PressableScale
            scaleTo={0.98}
            style={[styles.confirmButton, isConfirming ? styles.confirmDisabled : null]}
            onPress={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? (
              <ActivityIndicator size="small" color={palette.onPrimary} />
            ) : (
              <Text style={styles.confirmText}>Confirm delivery point</Text>
            )}
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
