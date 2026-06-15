import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { styles } from "@/src/components/support/support-chat.styles";
import { Screen } from "@/src/components/screen";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RemoteImage } from "@/src/components/remote-image";
import {
  type CustomerSupportCase,
  type CustomerSupportCaseAttachment,
  useCustomerCreateSupportCaseMutation,
  useCustomerLatestSupportCaseQuery,
  useCustomerMediaUploadSignatureMutation,
  useCustomerSupportCaseMessageMutation,
  useCustomerSupportCaseQuery,
} from "@/src/hooks/use-customer-api";
import { getCustomerAuthErrorMessage } from "@/src/lib/auth-error-message";
import { useIsOnline } from "@/src/hooks/use-network-status";
import {
  useSafeAnimationFrame,
  useSafeTimeout,
} from "@/src/hooks/use-safe-timeout";
import { getCustomerSocket } from "@/src/lib/socket-client";
import { palette } from "@/src/theme/palette";

type DatedSupportMessage = CustomerSupportCase["messages"][number] & {
  dayLabel: string;
  showDayLabel: boolean;
  showUnreadDivider?: boolean;
  clientStatus?: "sending" | "failed";
  localImageUri?: string | null;
};

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMessageDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return "Today";

  const sameYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (sameYesterday) return "Yesterday";

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: today.getFullYear() === date.getFullYear() ? undefined : "numeric",
  });
}

export default function SupportChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ caseId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<DatedSupportMessage>>(null);
  const shouldAutoScrollRef = useRef(true);
  const routeCaseId = Array.isArray(params.caseId)
    ? params.caseId[0]
    : params.caseId;
  const [draftMessage, setDraftMessage] = useState("");
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [activeCaseId, setActiveCaseId] = useState(routeCaseId ?? "");
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [isAdminTyping, setIsAdminTyping] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<{
    id: string;
    message: string;
    imageUri?: string | null;
    status: "sending" | "failed";
    createdAt: string;
  } | null>(null);
  const [sessionOpenedAt, setSessionOpenedAt] = useState(() =>
    new Date().toISOString(),
  );
  const [hasInitializedSessionMark, setHasInitializedSessionMark] =
    useState(false);
  const isOnline = useIsOnline();
  const scheduleTimeout = useSafeTimeout();
  const scheduleAnimationFrame = useSafeAnimationFrame();

  const latestCaseQuery = useCustomerLatestSupportCaseQuery(!routeCaseId);
  const supportCaseQuery = useCustomerSupportCaseQuery(
    activeCaseId || routeCaseId,
    Boolean(activeCaseId || routeCaseId),
  );
  const createSupportCaseMutation = useCustomerCreateSupportCaseMutation();
  const postSupportMessageMutation = useCustomerSupportCaseMessageMutation();
  const uploadSignatureMutation = useCustomerMediaUploadSignatureMutation();

  const currentCase =
    supportCaseQuery.data ??
    (!routeCaseId || !supportCaseQuery.isSuccess ? latestCaseQuery.data : null);

  const messages = useMemo(
    () => currentCase?.messages ?? [],
    [currentCase?.messages],
  );
  const isUploading = uploadSignatureMutation.isPending;
  const isSending =
    createSupportCaseMutation.isPending ||
    postSupportMessageMutation.isPending ||
    isUploading;
  const isRefreshing =
    latestCaseQuery.isRefetching || supportCaseQuery.isRefetching;
  const canSend = Boolean(draftMessage.trim() || pendingImageUri) && !isSending && isOnline;
  const datedMessages = useMemo(() => {
    let previousLabel = "";
    let unreadDividerShown = false;

    const baseMessages = messages.map((message) => {
      const dayLabel = formatMessageDayLabel(message.createdAt);
      const showDayLabel = Boolean(dayLabel) && dayLabel !== previousLabel;
      previousLabel = dayLabel || previousLabel;
      const isUnreadReply =
        !unreadDividerShown &&
        message.senderType === "admin" &&
        new Date(message.createdAt).getTime() >
          new Date(sessionOpenedAt).getTime();

      if (isUnreadReply) {
        unreadDividerShown = true;
      }

      return {
        ...message,
        dayLabel,
        showDayLabel,
        showUnreadDivider: isUnreadReply,
      };
    });

    if (!pendingMessage) {
      return baseMessages;
    }

    const dayLabel = formatMessageDayLabel(pendingMessage.createdAt);
    const showDayLabel = Boolean(dayLabel) && dayLabel !== previousLabel;

    return [
      ...baseMessages,
      {
        id: pendingMessage.id,
        senderType: "customer" as const,
        senderName: "",
        message: pendingMessage.message,
        createdAt: pendingMessage.createdAt,
        attachments: [],
        dayLabel,
        showDayLabel,
        clientStatus: pendingMessage.status,
        localImageUri: pendingMessage.imageUri ?? null,
      },
    ];
  }, [messages, pendingMessage, sessionOpenedAt]);

  const scrollToLatest = useCallback(
    (animated = true) => {
      scheduleAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated });
      });
    },
    [scheduleAnimationFrame],
  );

  useEffect(() => {
    if (hasInitializedSessionMark) {
      return;
    }

    if (latestCaseQuery.isLoading || supportCaseQuery.isLoading) {
      return;
    }

    setSessionOpenedAt(new Date().toISOString());
    setHasInitializedSessionMark(true);
  }, [
    hasInitializedSessionMark,
    latestCaseQuery.isLoading,
    supportCaseQuery.isLoading,
    currentCase?.id,
  ]);

  useEffect(() => {
    if (routeCaseId) {
      setActiveCaseId(routeCaseId);
    } else if (!activeCaseId && latestCaseQuery.data?.id) {
      setActiveCaseId(latestCaseQuery.data.id);
    }
  }, [activeCaseId, latestCaseQuery.data?.id, routeCaseId]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
  }, [messages.length]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    setIsAdminTyping(false);
  }, [messages.length, currentCase?.updatedAt]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      if (shouldAutoScrollRef.current) {
        scheduleTimeout(() => scrollToLatest(false), 40);
      }
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scheduleTimeout, scrollToLatest]);

  useEffect(() => {
    const listeningCaseId = currentCase?.id || activeCaseId || routeCaseId;
    if (!listeningCaseId) {
      return;
    }

    const socket = getCustomerSocket();
    const handleSupportTyping = (payload?: {
      caseId?: string;
      isTyping?: boolean;
      adminName?: string;
    }) => {
      if (payload?.caseId !== listeningCaseId) {
        return;
      }

      setIsAdminTyping(Boolean(payload.isTyping));

      if (payload?.isTyping && shouldAutoScrollRef.current) {
        scheduleTimeout(() => scrollToLatest(false), 40);
      }
    };

    socket.on("customer.support.typing", handleSupportTyping);
    return () => {
      socket.off("customer.support.typing", handleSupportTyping);
    };
  }, [activeCaseId, currentCase?.id, routeCaseId, scheduleTimeout, scrollToLatest]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    shouldAutoScrollRef.current = distanceFromBottom < 80;
    setShowJumpToBottom(distanceFromBottom > 180);
  }

  async function handlePickImage() {
    setShowAttachSheet(false);
    try {
      setErrorText("");
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        setErrorText(
          "Photo library permission is required to attach an image.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsEditing: true,
        selectionLimit: 1,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPendingImageUri(result.assets[0].uri);
      }
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not select the image."),
      );
    }
  }

  async function handleCaptureImage() {
    setShowAttachSheet(false);
    try {
      setErrorText("");
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (permission.status !== "granted") {
        setErrorText("Camera permission is required to take a photo.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPendingImageUri(result.assets[0].uri);
      }
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not open the camera."),
      );
    }
  }

  async function handleRefresh() {
    if (currentCase?.id) {
      await supportCaseQuery.refetch();
      return;
    }

    await latestCaseQuery.refetch();
  }

  async function uploadPendingAttachment(imageUri?: string | null) {
    if (!imageUri) {
      return [] as CustomerSupportCaseAttachment[];
    }

    const signature = await uploadSignatureMutation.mutateAsync({
      folder: "foodbela/customer/support",
      resourceType: "image",
    });

    const fileName = imageUri.split("/").pop() || `support-${Date.now()}.jpg`;
    const formData = new FormData();
    formData.append("file", {
      uri: imageUri,
      type: "image/jpeg",
      name: fileName,
    } as unknown as Blob);
    formData.append("api_key", signature.apiKey);
    formData.append("timestamp", String(signature.timestamp));
    formData.append("signature", signature.signature);
    formData.append("folder", signature.folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
      {
        method: "POST",
        body: formData,
      },
    );

    const payload = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.secure_url) {
      throw new Error(payload.error?.message ?? "Could not upload the image.");
    }

    return [
      {
        url: payload.secure_url,
        publicId: payload.public_id,
        fileName,
        fileType: "image/jpeg",
      },
    ];
  }

  async function handleSendMessage() {
    const trimmedMessage = draftMessage.trim();
    if (!trimmedMessage && !pendingImageUri) {
      return;
    }
    if (!isOnline) {
      setErrorText("Reconnect to send messages.");
      return;
    }

    const nextPendingMessage = {
      id: `pending-${Date.now()}`,
      message: trimmedMessage || "Attached an image for support.",
      imageUri: pendingImageUri,
      status: "sending" as const,
      createdAt: new Date().toISOString(),
    };

    try {
      setErrorText("");
      shouldAutoScrollRef.current = true;
      setPendingMessage(nextPendingMessage);
      setDraftMessage("");
      setPendingImageUri(null);
      scrollToLatest(false);
      const attachments = await uploadPendingAttachment(
        nextPendingMessage.imageUri,
      );
      const message = nextPendingMessage.message;

      if (currentCase?.id) {
        const updatedCase = await postSupportMessageMutation.mutateAsync({
          supportCaseId: currentCase.id,
          message,
          attachments,
        });
        setActiveCaseId(updatedCase.id);
      } else {
        const createdCase = await createSupportCaseMutation.mutateAsync({
          message,
          attachments,
        });
        setActiveCaseId(createdCase.id);
      }

      setPendingMessage(null);
      scrollToLatest(false);
    } catch (error) {
      setPendingMessage({
        ...nextPendingMessage,
        status: "failed",
      });
      setErrorText(
        getCustomerAuthErrorMessage(
          error,
          "Could not send your message right now.",
        ),
      );
    }
  }

  function handleRetryPendingMessage() {
    if (!pendingMessage || pendingMessage.status !== "failed") {
      return;
    }

    setDraftMessage(
      pendingMessage.message === "Attached an image for support."
        ? ""
        : pendingMessage.message,
    );
    setPendingImageUri(pendingMessage.imageUri ?? null);
    setPendingMessage(null);
    setErrorText("");
  }

  function renderMessageItem({ item }: { item: DatedSupportMessage }) {
    const isUser = item.senderType === "customer";

    return (
      <View>
        {item.showDayLabel ? (
          <View style={styles.dayRow}>
            <View style={styles.dayChip}>
              <Text style={styles.dayChipText}>{item.dayLabel}</Text>
            </View>
          </View>
        ) : null}
        {item.showUnreadDivider ? (
          <View style={styles.unreadRow}>
            <View style={styles.unreadLine} />
            <View style={styles.unreadChip}>
              <Text style={styles.unreadChipText}>New replies</Text>
            </View>
            <View style={styles.unreadLine} />
          </View>
        ) : null}
        <View
          style={[
            styles.messageRow,
            isUser ? styles.messageRowUser : styles.messageRowSupport,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.messageBubbleUser : styles.messageBubbleSupport,
            ]}
          >
            {item.message ? (
              <Text
                style={[
                  styles.messageText,
                  isUser ? styles.messageTextUser : null,
                ]}
              >
                {item.message}
              </Text>
            ) : null}
            {item.localImageUri ? (
              <Pressable
                onPress={() => setPreviewImageUri(item.localImageUri ?? null)}
              >
                <RemoteImage
                  uri={item.localImageUri}
                  style={styles.messageImage}
                  fallbackIcon="image-outline"
                  accessibilityLabel="Support chat image"
                />
              </Pressable>
            ) : null}
            {item.attachments.map((attachment) => (
              <Pressable
                key={`${item.id}-${attachment.url}`}
                onPress={() => setPreviewImageUri(attachment.url)}
              >
                <RemoteImage
                  uri={attachment.url}
                  style={styles.messageImage}
                  fallbackIcon="image-outline"
                  accessibilityLabel="Support chat attachment"
                />
              </Pressable>
            ))}
            <Text
              style={[
                styles.messageTime,
                isUser ? styles.messageTimeUser : null,
              ]}
            >
              {formatMessageTime(item.createdAt)}
            </Text>
            {item.clientStatus ? (
              <Text
                style={[
                  styles.messageMeta,
                  isUser ? styles.messageMetaUser : null,
                  item.clientStatus === "failed"
                    ? styles.messageMetaFailed
                    : null,
                ]}
              >
                {item.clientStatus === "sending" ? "Sending..." : "Not sent"}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={[styles.header, { paddingTop: 2 }]}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Ionicons
                name="chevron-back"
                size={18}
                color={palette.foreground}
              />
            </Pressable>
            <View style={styles.headerCopy}>
              <View style={styles.titleRow}>
                <View style={styles.titleIcon}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={palette.secondary}
                  />
                </View>
                <Text style={styles.title}>Support chat</Text>
              </View>
            </View>
          </View>

          {!isOnline ? (
            <View style={styles.offlineNoticeWrap}>
              <OfflineNoticeCard description="You can read earlier messages now. Reconnect to send new messages or receive live updates." />
            </View>
          ) : null}

          <FlatList
            ref={flatListRef}
            data={datedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            style={styles.list}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (shouldAutoScrollRef.current) {
                scrollToLatest(false);
              }
            }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => {
                  void handleRefresh();
                }}
                tintColor={palette.secondary}
                colors={[palette.secondary]}
              />
            }
            contentContainerStyle={[
              styles.chatContent,
              messages.length
                ? styles.chatContentWithMessages
                : styles.chatContentEmpty,
            ]}
            ListEmptyComponent={
              latestCaseQuery.isLoading || supportCaseQuery.isLoading ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="small" color={palette.secondary} />
                  <Text style={styles.emptyTitle}>
                    Opening your support chat
                  </Text>
                  <Text style={styles.emptyDescription}>
                    Your messages will appear here once the conversation starts.
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={20}
                      color={palette.secondary}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>Start the conversation</Text>
                  <Text style={styles.emptyDescription}>
                    Tell us what happened and our support team will respond
                    here.
                  </Text>
                  <View style={styles.quickChipRow}>
                    {[
                      "Order issue",
                      "Payment issue",
                      "Refund help",
                      "App problem",
                    ].map((chip) => (
                      <Pressable
                        key={chip}
                        style={styles.quickChip}
                        onPress={() => setDraftMessage(chip)}
                      >
                        <Text style={styles.quickChipText}>{chip}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )
            }
          />

          <View
            style={[
              styles.composerWrap,
              {
                marginBottom:
                  Platform.OS === "android" && isKeyboardVisible
                    ? Math.max(keyboardHeight + 12, 0)
                    : 0,
                paddingBottom: isKeyboardVisible
                  ? 8
                  : Math.max(insets.bottom, 12),
              },
            ]}
          >
            {pendingImageUri ? (
              <View style={styles.previewCard}>
                <RemoteImage
                  uri={pendingImageUri}
                  style={styles.previewImage}
                  fallbackIcon="image-outline"
                  accessibilityLabel="Pending support photo"
                />
                {isUploading ? (
                  <View style={styles.previewOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.previewOverlayText}>
                      Uploading photo...
                    </Text>
                  </View>
                ) : null}
                <Pressable
                  style={styles.previewRemove}
                  onPress={() => setPendingImageUri(null)}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ) : null}

            {errorText ? (
              <Text style={styles.errorText}>{errorText}</Text>
            ) : null}
            {pendingMessage?.status === "failed" ? (
              <Pressable
                style={styles.retryRow}
                onPress={handleRetryPendingMessage}
              >
                <Ionicons name="refresh" size={14} color={palette.secondary} />
                <Text style={styles.retryText}>Retry the failed message</Text>
              </Pressable>
            ) : null}
            {isAdminTyping ? (
              <View style={styles.typingRow}>
                <Text style={styles.typingText}>typing...</Text>
              </View>
            ) : null}

            <View style={styles.composerCard}>
              <Pressable
                style={styles.attachButton}
                onPress={() => setShowAttachSheet(true)}
                disabled={isSending}
              >
                <Ionicons
                  name="image-outline"
                  size={18}
                  color={palette.foreground}
                />
              </Pressable>
              <TextInput
                value={draftMessage}
                onChangeText={setDraftMessage}
                placeholder="Describe the issue"
                placeholderTextColor={palette.placeholder}
                style={styles.input}
                multiline
                textAlignVertical="top"
              />
              <Pressable
                style={[
                  styles.sendButton,
                  !canSend ? styles.sendButtonDisabled : null,
                ]}
                disabled={!canSend}
                onPress={handleSendMessage}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>

          {showJumpToBottom ? (
            <Pressable
              style={[
                styles.jumpToBottomButton,
                {
                  bottom:
                    (isKeyboardVisible
                      ? keyboardHeight
                      : Math.max(insets.bottom, 12)) + 88,
                },
              ]}
              onPress={() => {
                shouldAutoScrollRef.current = true;
                setShowJumpToBottom(false);
                scrollToLatest(true);
              }}
            >
              <Ionicons name="chevron-down" size={18} color="#fff" />
            </Pressable>
          ) : null}

          <Modal
            visible={showAttachSheet}
            transparent
            animationType="fade"
            onRequestClose={() => setShowAttachSheet(false)}
          >
            <Pressable
              style={styles.sheetBackdrop}
              onPress={() => setShowAttachSheet(false)}
            >
              <Pressable style={styles.sheetCard} onPress={() => undefined}>
                <Text style={styles.sheetTitle}>Attach a photo</Text>
                <Pressable
                  style={styles.sheetAction}
                  onPress={handleCaptureImage}
                >
                  <View style={styles.sheetActionIcon}>
                    <Ionicons
                      name="camera-outline"
                      size={18}
                      color={palette.secondary}
                    />
                  </View>
                  <View style={styles.sheetActionCopy}>
                    <Text style={styles.sheetActionTitle}>Take a photo</Text>
                    <Text style={styles.sheetActionText}>
                      Open the camera and attach it here.
                    </Text>
                  </View>
                </Pressable>
                <Pressable style={styles.sheetAction} onPress={handlePickImage}>
                  <View style={styles.sheetActionIcon}>
                    <Ionicons
                      name="image-outline"
                      size={18}
                      color={palette.secondary}
                    />
                  </View>
                  <View style={styles.sheetActionCopy}>
                    <Text style={styles.sheetActionTitle}>
                      Choose from gallery
                    </Text>
                    <Text style={styles.sheetActionText}>
                      Pick an existing screenshot or photo.
                    </Text>
                  </View>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={Boolean(previewImageUri)}
            transparent
            animationType="fade"
            onRequestClose={() => setPreviewImageUri(null)}
          >
            <View style={styles.previewModalBackdrop}>
              <Pressable
                style={styles.previewModalClose}
                onPress={() => setPreviewImageUri(null)}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
              {previewImageUri ? (
                <RemoteImage
                  uri={previewImageUri}
                  style={styles.previewModalImage}
                  contentFit="contain"
                  fallbackIcon="image-outline"
                  accessibilityLabel="Support photo preview"
                />
              ) : null}
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
