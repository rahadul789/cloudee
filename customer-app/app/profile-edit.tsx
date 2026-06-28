import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/screen";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RemoteImage } from "@/src/components/remote-image";
import {
  useCustomerMediaDeleteMutation,
  useCustomerMediaUploadSignatureMutation,
  useCustomerProfileUpdateMutation,
} from "@/src/hooks/use-customer-api";
import { getCustomerAuthErrorMessage } from "@/src/lib/auth-error-message";
import { fetchWithTimeout } from "@/src/lib/api";
import { formatDeliveryAddress } from "@/src/lib/location-address";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";

type ProfileImageValue = {
  url?: string;
  publicId?: string;
};

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PROFILE_IMAGE_LABEL = "2 MB";
const PROFILE_IMAGE_UPLOAD_TIMEOUT_MS = 45_000;

async function getPickedImageSize(asset: ImagePicker.ImagePickerAsset) {
  if (typeof asset.fileSize === "number" && asset.fileSize > 0) {
    return asset.fileSize;
  }

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  return blob.size;
}

export default function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const customer = useCustomerAuthStore((state) => state.customer);
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const isOnline = useIsOnline();
  const updateMutation = useCustomerProfileUpdateMutation();
  const uploadSignatureMutation = useCustomerMediaUploadSignatureMutation();
  const deleteMediaMutation = useCustomerMediaDeleteMutation();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const fullNameInputRef = useRef<TextInput | null>(null);
  const [fullName, setFullName] = useState(customer?.fullName ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [profileImage, setProfileImage] = useState<ProfileImageValue>(
    customer?.profileImage ?? {}
  );
  const [errorText, setErrorText] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [fullNameFocused, setFullNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  function scrollProfileFieldIntoView(targetY: number) {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    }, 120);
  }

  const initials = useMemo(() => {
    const source = fullName.trim() || customer?.fullName?.trim() || "Customer";
    const next = source
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return next || "CU";
  }, [customer?.fullName, fullName]);
  const trimmedFullName = fullName.trim();
  const trimmedEmail = email.trim();
  const normalizedCustomerImage = customer?.profileImage?.url?.trim() ?? "";
  const normalizedProfileImage = profileImage?.url?.trim() ?? "";
  const originalProfilePublicId = customer?.profileImage?.publicId?.trim() ?? "";
  const hasChanges = useMemo(
    () =>
      trimmedFullName !== (customer?.fullName?.trim() ?? "") ||
      trimmedEmail !== (customer?.email?.trim() ?? "") ||
      normalizedProfileImage !== normalizedCustomerImage,
    [
      customer?.email,
      customer?.fullName,
      normalizedCustomerImage,
      normalizedProfileImage,
      trimmedEmail,
      trimmedFullName,
    ]
  );
  const deliveryPointPrimary = useMemo(() => {
    const typedAddress = selectedLocation?.addressDetails?.trim();
    return (
      typedAddress ||
      formatDeliveryAddress(selectedLocation, "Set delivery point")
    );
  }, [selectedLocation]);
  const deliveryPointSecondary = useMemo(() => {
    const typedAddress = selectedLocation?.addressDetails?.trim();
    if (!typedAddress) {
      return "Add flat, floor, road, or landmark for easier delivery.";
    }

    return formatDeliveryAddress(selectedLocation, "Pinned on map");
  }, [selectedLocation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fullNameInputRef.current?.focus();
    }, 350);

    return () => clearTimeout(timer);
  }, []);

  async function handlePickImage() {
    if (!isOnline) {
      setErrorText("Reconnect to upload a profile photo.");
      return;
    }
    try {
      setErrorText("");
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        setErrorText(
          "Photo library permission is required to upload a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.78,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      const imageSize = await getPickedImageSize(asset);
      if (imageSize > MAX_PROFILE_IMAGE_BYTES) {
        setErrorText(`Profile photo must be ${MAX_PROFILE_IMAGE_LABEL} or smaller.`);
        return;
      }

      setIsUploadingImage(true);

      const previousPublicId = profileImage?.publicId?.trim();
      if (previousPublicId && previousPublicId !== originalProfilePublicId) {
        const deleteResult = await deleteMediaMutation.mutateAsync({
          publicId: previousPublicId,
          resourceType: "image",
        });

        if (!deleteResult.deleted) {
          throw new Error("Could not replace the previous profile photo. Please try again.");
        }

        setProfileImage({ url: "", publicId: "" });
      }

      const signature = await uploadSignatureMutation.mutateAsync({
        folder: "foodbela/customer/profile",
        resourceType: "image",
      });

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        type: asset.mimeType ?? "image/jpeg",
        name: asset.fileName ?? `customer-profile-${Date.now()}.jpg`,
      } as unknown as Blob);
      formData.append("api_key", signature.apiKey);
      formData.append("timestamp", String(signature.timestamp));
      formData.append("signature", signature.signature);
      formData.append("folder", signature.folder);

      const response = await fetchWithTimeout(
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
        {
          method: "POST",
          body: formData,
        },
        PROFILE_IMAGE_UPLOAD_TIMEOUT_MS,
        "Profile photo upload timed out. Please try again."
      );

      const payload = (await response.json()) as {
        secure_url?: string;
        public_id?: string;
        error?: { message?: string };
      };

      if (!response.ok || !payload.secure_url) {
        throw new Error(
          payload.error?.message ?? "Could not upload the profile image."
        );
      }

      setProfileImage({
        url: payload.secure_url,
        publicId: payload.public_id,
      });
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not upload profile photo.")
      );
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleRemoveImage() {
    if (!isOnline) {
      setErrorText("Reconnect to remove your profile photo.");
      return;
    }

    try {
      setErrorText("");
      setIsUploadingImage(true);

      const publicId = profileImage?.publicId?.trim();
      if (publicId && publicId !== originalProfilePublicId) {
        const deleteResult = await deleteMediaMutation.mutateAsync({
          publicId,
          resourceType: "image",
        });

        if (!deleteResult.deleted) {
          throw new Error("Could not delete the profile photo. Please try again.");
        }
      }

      setProfileImage({ url: "", publicId: "" });
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not remove profile photo.")
      );
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSave() {
    if (isSavingProfile || isUploadingImage || updateMutation.isPending) {
      return;
    }
    if (!isOnline) {
      setErrorText("Reconnect to save your profile changes.");
      return;
    }
    if (!trimmedFullName) {
      setErrorText("Full name is required.");
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorText("Enter a valid email address or leave it empty.");
      return;
    }

    try {
      setErrorText("");
      setIsSavingProfile(true);
      const nextProfilePublicId = profileImage?.publicId?.trim() ?? "";
      if (originalProfilePublicId && originalProfilePublicId !== nextProfilePublicId) {
        const deleteResult = await deleteMediaMutation.mutateAsync({
          publicId: originalProfilePublicId,
          resourceType: "image",
        });

        if (!deleteResult.deleted) {
          throw new Error("Could not delete the previous profile photo. Please try again.");
        }
      }

      await updateMutation.mutateAsync({
        fullName: trimmedFullName,
        email: trimmedEmail,
        profileImage,
      });
      router.back();
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not update profile.")
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 12}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.content,
            { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 48 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed
                  ? {
                      transform: [{ scale: 0.97 }, { translateY: 1 }],
                      opacity: 0.92,
                    }
                  : null,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={palette.foreground}
              />
            </Pressable>
            <Text style={styles.topBarTitle}>Edit profile</Text>
            <View style={styles.topBarSpacer} />
          </View>

          {!isOnline ? (
            <OfflineNoticeCard description="You can review your profile here. Reconnect to upload a photo or save changes." />
          ) : null}

          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.avatarShell}>
                {profileImage?.url ? (
                  <RemoteImage
                    uri={profileImage.url}
                    style={styles.avatarImage}
                    fallbackIcon="person-outline"
                    fallbackIconSize={26}
                    accessibilityLabel="Profile photo preview"
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{initials}</Text>
                  </View>
                )}

                {(isUploadingImage || isSavingProfile || updateMutation.isPending) ? (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : null}
              </View>

              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Personal info</Text>
                <Text style={styles.heroName} numberOfLines={1}>
                  {trimmedFullName || "Your name"}
                </Text>
              </View>
            </View>

            <View style={styles.photoActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.photoButton,
                  profileImage?.url
                    ? styles.photoButtonHalf
                    : styles.photoButtonPrimaryFull,
                  styles.photoButtonPrimary,
                  pressed &&
                  !isUploadingImage &&
                  !isSavingProfile &&
                  !updateMutation.isPending &&
                  isOnline
                    ? {
                        transform: [{ scale: 0.985 }, { translateY: 1 }],
                        opacity: 0.96,
                      }
                    : null,
                ]}
                onPress={handlePickImage}
                disabled={isUploadingImage || isSavingProfile || updateMutation.isPending || !isOnline}
              >
                {isUploadingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={16} color="#fff" />
                    <Text style={styles.photoButtonPrimaryText}>
                      {profileImage?.url ? "Change photo" : "Upload photo"}
                    </Text>
                  </>
                )}
              </Pressable>

              {profileImage?.url ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.photoButton,
                    styles.photoButtonHalf,
                    pressed && !isUploadingImage && !isSavingProfile && !updateMutation.isPending && isOnline
                      ? {
                          transform: [{ scale: 0.985 }, { translateY: 1 }],
                          opacity: 0.96,
                        }
                      : null,
                  ]}
                  onPress={() => {
                    void handleRemoveImage();
                  }}
                  disabled={isUploadingImage || isSavingProfile || updateMutation.isPending || !isOnline}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={palette.foreground}
                  />
                  <Text style={styles.photoButtonText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full name</Text>
              <View
                style={[
                  styles.inputShell,
                  fullNameFocused ? styles.inputShellFocused : null,
                ]}
              >
                <View style={styles.inputIcon}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={palette.secondary}
                  />
                </View>
                <TextInput
                  ref={fullNameInputRef}
                  value={fullName}
                  onChangeText={(value) => {
                    setFullName(value);
                    setErrorText("");
                  }}
                  placeholder="Your full name"
                  placeholderTextColor={palette.placeholder}
                  selectionColor={palette.secondary}
                  textContentType="name"
                  autoCapitalize="words"
                  returnKeyType="done"
                  onFocus={() => {
                    setFullNameFocused(true);
                    scrollProfileFieldIntoView(120);
                  }}
                  onBlur={() => setFullNameFocused(false)}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email (optional)</Text>
              <View
                style={[
                  styles.inputShell,
                  emailFocused ? styles.inputShellFocused : null,
                ]}
              >
                <View style={styles.inputIcon}>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={palette.secondary}
                  />
                </View>
                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setErrorText("");
                  }}
                  placeholder="Add email address"
                  placeholderTextColor={palette.placeholder}
                  selectionColor={palette.secondary}
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onFocus={() => {
                    setEmailFocused(true);
                    scrollProfileFieldIntoView(270);
                  }}
                  onBlur={() => setEmailFocused(false)}
                  style={styles.input}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.locationLinkCard,
                pressed
                  ? {
                      transform: [{ scale: 0.985 }, { translateY: 1 }],
                      shadowOpacity: 0.06,
                    }
                  : null,
              ]}
              onPress={() => router.push("/location-picker")}
            >
              <View style={styles.locationLinkIcon}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={palette.secondary}
                />
              </View>
              <View style={styles.locationLinkCopy}>
                <Text style={styles.locationLinkLabel}>Delivery point</Text>
                <Text style={styles.locationLinkTitle} numberOfLines={2}>
                  {deliveryPointPrimary}
                </Text>
                <Text style={styles.locationLinkSubtitle} numberOfLines={2}>
                  {deliveryPointSecondary}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={palette.mutedForeground}
              />
            </Pressable>

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (!hasChanges || isSavingProfile || updateMutation.isPending || isUploadingImage) &&
                  styles.primaryButtonDisabled,
                !isOnline && styles.primaryButtonDisabled,
                pressed &&
                hasChanges &&
                !isSavingProfile &&
                !updateMutation.isPending &&
                !isUploadingImage &&
                isOnline
                  ? {
                      transform: [{ scale: 0.985 }, { translateY: 1 }],
                      opacity: 0.96,
                    }
                  : null,
              ]}
              onPress={handleSave}
              disabled={
                !hasChanges ||
                isSavingProfile ||
                updateMutation.isPending ||
                isUploadingImage ||
                !isOnline
              }
            >
              {isSavingProfile || updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Save changes</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 36,
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: palette.foreground,
  },
  topBarSpacer: {
    width: 42,
    height: 42,
  },
  heroCard: {
    borderRadius: 26,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    padding: 16,
    gap: 16,
    shadowColor: palette.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarShell: {
    width: 82,
    height: 82,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#F7EEF4",
    borderWidth: 1,
    borderColor: "#F2DFE8",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE7F1",
  },
  avatarFallbackText: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
    color: "#D85A8A",
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(28, 24, 36, 0.38)",
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  heroName: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    color: palette.foreground,
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoButton: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: "#F7F2F6",
    borderWidth: 1,
    borderColor: "#EEE1E9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  photoButtonHalf: {
    flex: 1,
  },
  photoButtonPrimaryFull: {
    flex: 1,
  },
  photoButtonPrimary: {
    backgroundColor: palette.secondary,
    borderColor: palette.secondary,
  },
  photoButtonPrimaryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#fff",
  },
  photoButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.foreground,
  },
  formCard: {
    borderRadius: 26,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    padding: 16,
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  inputShell: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9E6EE",
    backgroundColor: "#FBFAFD",
    paddingHorizontal: 12,
  },
  inputShellFocused: {
    borderColor: "#FFD4C3",
    backgroundColor: "#FFF9F5",
  },
  inputIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#FFF0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  locationLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F0E2D8",
    backgroundColor: "#FFFCFE",
  },
  locationLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F6",
  },
  locationLinkCopy: {
    flex: 1,
    gap: 2,
  },
  locationLinkLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  locationLinkTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  locationLinkSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#C62828",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: palette.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#fff",
  },
});
