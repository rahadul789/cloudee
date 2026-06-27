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
  Alert,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Region } from "react-native-maps";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

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
const DEFAULT_LOCATION_PICKER_ZOOM = 17;
const MIN_LOCATION_PICKER_ZOOM = 14;
const MAX_LOCATION_PICKER_ZOOM = 20;

function showLocationSettingsAlert() {
  Alert.alert(
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
  );
}

export default function LocationPickerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ delta?: string }>();
  const mapDelta = useMemo(() => {
    const raw = Number(params.delta);
    if (Number.isFinite(raw) && raw > 0 && raw <= 0.02) {
      return raw;
    }
    return DEFAULT_LOCATION_PICKER_DELTA;
  }, [params.delta]);
  const insets = useSafeAreaInsets();
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
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isLoadingInitialRegion, setIsLoadingInitialRegion] = useState(
    !selectedLocation && !currentCoordinates,
  );
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [region, setRegion] = useState<Region | null>(
    selectedLocation
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
    setLabel(initialLabel);
    setAddress(initialAddress);
    setManualNote(initialAddressDetails);
  }, [initialAddress, initialAddressDetails, initialLabel]);

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
      Alert.alert(
        "Location unavailable",
        "Please allow location access and try again.",
      );
      return;
    }
    if (!address.trim()) {
      Alert.alert(
        "Address required",
        "Please wait for the map address or move the pin slightly before saving.",
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
        !selectedLocation?.id || selectedLocation.id === "current-location"
          ? `loc-${Date.now()}`
          : selectedLocation.id,
      label: label.trim() || "Selected location",
      address: finalAddress,
      addressDetails,
      latitude: region.latitude,
      longitude: region.longitude,
      source: selectedLocation?.source === "saved" ? "saved" : "manual",
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

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" backgroundColor={palette.background} />

      <View style={styles.screenBody}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.headerButton,
              pressed
                ? {
                    transform: [{ scale: 0.97 }, { translateY: 1 }],
                    opacity: 0.92,
                  }
                : null,
            ]}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={palette.foreground}
            />
          </Pressable>

          <View style={styles.headerCopy}>
            <View style={styles.headerBadge}>
              <Ionicons
                name="navigate-circle"
                size={13}
                color={palette.secondary}
              />
              <Text style={styles.headerBadgeText}>Delivery point</Text>
            </View>
            <Text style={styles.headerTitle}>Update delivery point</Text>
            <Text style={styles.headerSubtitle}>
              Move the pin to your exact drop-off spot.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.headerLocateButton,
              pressed
                ? {
                    transform: [{ scale: 0.97 }, { translateY: 1 }],
                    opacity: 0.92,
                  }
                : null,
            ]}
            onPress={handleGoToCurrentLocation}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color={palette.surface} />
            ) : (
              <Ionicons name="locate" size={18} color={palette.surface} />
            )}
          </Pressable>
        </View>

        <View style={styles.mapWrap}>
          {region ? (
            <>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={region}
                minZoomLevel={MIN_LOCATION_PICKER_ZOOM}
                maxZoomLevel={MAX_LOCATION_PICKER_ZOOM}
                showsCompass={false}
                showsBuildings
                customMapStyle={resolvedMapStyle}
                toolbarEnabled={false}
                showsUserLocation
                showsMyLocationButton={false}
                rotateEnabled={false}
                pitchEnabled={false}
                onMapReady={applyInitialCamera}
                onRegionChange={handleRegionChange}
                onRegionChangeComplete={handleRegionChangeComplete}
              />

              <View pointerEvents="none" style={styles.mapHintPill}>
                <Ionicons name="move-outline" size={14} color={palette.secondary} />
                <Text style={styles.mapHintPillText}>
                  Drag map to adjust location
                </Text>
              </View>

              <View pointerEvents="none" style={styles.centerPinWrap}>
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
                  <Ionicons
                    name="location"
                    size={40}
                    color={palette.secondary}
                  />
                </Animated.View>
              </View>

              <Animated.View
                style={[
                  styles.currentLocationFab,
                  {
                    transform: [{ scale: currentPulse }],
                    bottom: Math.max(insets.bottom, 14) + 10,
                  },
                ]}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.currentLocationFabInner,
                    pressed
                      ? {
                          transform: [{ scale: 0.96 }],
                          opacity: 0.92,
                        }
                      : null,
                  ]}
                  onPress={handleGoToCurrentLocation}
                >
                  {isLocating ? (
                    <ActivityIndicator
                      size="small"
                      color={palette.foreground}
                    />
                  ) : (
                    <Ionicons
                      name="locate"
                      size={20}
                      color={palette.foreground}
                    />
                  )}
                </Pressable>
              </Animated.View>
            </>
          ) : (
            <View style={styles.mapFallback}>
              {isLoadingInitialRegion ? (
                <>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={styles.mapFallbackTitle}>
                    Opening the map...
                  </Text>
                  <Text style={styles.mapFallbackText}>
                    We are trying to read your current location so you can
                    fine-tune it on the map.
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="location-outline"
                    size={28}
                    color={palette.primary}
                  />
                  <Text style={styles.mapFallbackTitle}>
                    Location access is needed
                  </Text>
                  <Text style={styles.mapFallbackText}>
                    Allow location access first, then reopen the map picker to
                    choose your exact delivery point.
                  </Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.mapFallbackButton,
                      pressed
                        ? {
                            transform: [{ scale: 0.985 }, { translateY: 1 }],
                            opacity: 0.96,
                          }
                        : null,
                    ]}
                    onPress={() => void openLocationPermissionSettings()}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.mapFallbackButtonText}>
                      Open settings
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>

        <View
          style={[
            styles.bottomCard,
            {
              marginBottom: keyboardHeight
                ? Math.max(keyboardHeight - insets.bottom + 12, 80)
                : 0,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.bottomTopRow}>
            <View style={styles.bottomIcon}>
              <Ionicons name="pin" size={16} color={palette.foreground} />
            </View>

            <View style={styles.bottomCopy}>
              <Text style={styles.bottomLabel}>Delivery point</Text>
              <Text style={styles.bottomTitle} numberOfLines={3}>
                {address || "Move the map to choose your exact spot"}
              </Text>
              <Text style={styles.bottomSubtitle} numberOfLines={2}>
                {region
                  ? `${region.latitude.toFixed(6)}, ${region.longitude.toFixed(6)}`
                  : "Waiting for location access"}
              </Text>
            </View>

            {isResolvingAddress ? (
              <View style={styles.statusPill}>
                <ActivityIndicator size="small" color={palette.foreground} />
              </View>
            ) : null}
          </View>

          <View style={styles.manualFieldWrap}>
            <Text style={styles.manualFieldLabel}>
              Address details (optional)
            </Text>
            <Animated.View
              style={[
                styles.manualFieldShell,
                styles.manualFieldShellMultiline,
                {
                  borderColor: manualFieldPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["#E7D8DF", palette.secondary],
                  }),
                  shadowOpacity: manualFieldPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.08, 0.24],
                  }),
                },
              ]}
            >
              <View style={styles.manualFieldIcon}>
                <Ionicons
                  name="reader-outline"
                  size={16}
                  color={palette.secondary}
                />
              </View>
              <TextInput
                value={manualNote}
                onChangeText={setManualNote}
                placeholder="Flat, floor, road, gate, or nearby landmark"
                placeholderTextColor={palette.placeholder}
                selectionColor={palette.secondary}
                style={[
                  styles.manualFieldInput,
                  styles.manualFieldInputMultiline,
                ]}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                underlineColorAndroid="transparent"
              />
            </Animated.View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.confirmButtonLift,
              isConfirming ? styles.confirmButtonDisabled : null,
              pressed && !isConfirming ? styles.confirmButtonPressed : null,
            ]}
            onPress={handleConfirm}
            disabled={isConfirming}
          >
            <View style={styles.confirmButton}>
              <View style={styles.confirmButtonGlow} />
              <View style={styles.confirmButtonSheen} />
              {isConfirming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.confirmButtonContent}>
                  <Text style={styles.confirmButtonText}>
                    Update delivery point
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
