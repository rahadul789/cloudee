let currentRiderExpoPushToken = "";

export function setCurrentRiderExpoPushToken(token: string) {
  currentRiderExpoPushToken = token.trim();
}

export function getCurrentRiderExpoPushToken() {
  return currentRiderExpoPushToken;
}

export function clearCurrentRiderExpoPushToken() {
  currentRiderExpoPushToken = "";
}
