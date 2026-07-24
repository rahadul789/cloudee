import { appStateStorage } from "@/src/lib/app-storage";

// Locally remembers which polls this device has already voted on, so the poll modal never
// re-nags a user who already responded. The backend (pollId, deviceId) unique index is the
// real guard; this is purely for a snappy UX that doesn't wait on a round-trip.
const VOTED_POLLS_KEY = "foodbela.customer.votedPolls";

export async function getVotedPollIds(): Promise<string[]> {
  try {
    const raw = await appStateStorage.getItem(VOTED_POLLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export async function hasVotedPoll(pollId: string): Promise<boolean> {
  if (!pollId) return false;
  const ids = await getVotedPollIds();
  return ids.includes(pollId);
}

export async function markPollVoted(pollId: string): Promise<void> {
  if (!pollId) return;
  try {
    const ids = await getVotedPollIds();
    if (ids.includes(pollId)) return;
    // Cap the history so it can't grow without bound across many polls over time.
    const next = [...ids, pollId].slice(-50);
    await appStateStorage.setItem(VOTED_POLLS_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal — losing the local flag only means the modal could reappear once; the
    // backend still rejects the duplicate vote.
  }
}
