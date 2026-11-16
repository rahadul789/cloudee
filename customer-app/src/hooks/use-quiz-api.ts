import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiProtectedGet, apiProtectedPost } from "@/src/lib/api";
import { useCustomerAuthStore } from "@/src/store/auth-store";

// Friend quiz ("তুমি আমাকে কতটা চেনো?"): the customer answers about themself, shares a link,
// friends play on the website, and the leaderboard + who-got-what-wrong show up here.

export type QuizPlay = {
  id: string;
  rank: number;
  name: string;
  score: number;
  total: number;
  completedAt: string | null;
  titleKey: string;
  title: string;
  titleEmoji: string;
  misses: { question: string; theirAnswer: string; correctAnswer: string }[];
};

export type OwnerQuiz = {
  id: string;
  code: string;
  shareUrl: string;
  ownerName: string;
  createdAt: string;
  expiresAt: string;
  live: boolean;
  viewCount: number;
  playCount: number;
  questions: { text: string; answer: string }[];
  plays: QuizPlay[];
};

export type CustomerQuizHome = {
  enabled: boolean;
  deliveredPrompt: boolean;
  questionCount: number;
  /** Customers may suggest questions (admin on/off; missing on older backends). */
  submissionsEnabled?: boolean;
  quiz: OwnerQuiz | null;
};

export type QuizBankQuestion = {
  id: string;
  text: string;
  category: string;
  /** "✍️ প্রশ্ন: রাকিব" for customer-made questions ("" otherwise). */
  authorName?: string;
  /** This customer's own approved question (shown first, labelled "✍️ তোমার প্রশ্ন"). */
  mine?: boolean;
  options: { id: string; label: string }[];
};

export type QuizSubmission = {
  id: string;
  text: string;
  options: string[];
  category: string;
  status: "pending" | "approved" | "rejected";
  rejectReason: string;
  autoApproved: boolean;
  rewardCoins: number;
  createdAt: string | null;
  reviewedAt: string | null;
  useCount: number;
};

export type QuizSubmissionsResponse = {
  enabled: boolean;
  pendingLimit: number;
  rewardCoins: number;
  items: QuizSubmission[];
};

export const QUIZ_HOME_KEY = ["customer", "quiz"] as const;

export function useCustomerQuizQuery(enabled = true) {
  const customerId = useCustomerAuthStore((state) => state.customer?.id ?? null);
  return useQuery({
    queryKey: [...QUIZ_HOME_KEY, customerId],
    enabled: enabled && Boolean(customerId),
    staleTime: 30_000,
    queryFn: async () => (await apiProtectedGet<CustomerQuizHome>("/customer/quiz")).data,
  });
}

export function useQuizBankQuery(enabled = true) {
  return useQuery({
    queryKey: ["customer", "quiz-bank"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await apiProtectedGet<{ questionCount: number; questions: QuizBankQuestion[] }>("/customer/quiz/bank")).data,
  });
}

export function useCreateQuizMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { answers: { questionId: string; optionId: string }[]; displayName?: string }) =>
      (await apiProtectedPost<OwnerQuiz>("/customer/quiz", body)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUIZ_HOME_KEY });
    },
  });
}

export function useCloseQuizMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiDelete<{ closed: number }>("/customer/quiz")).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUIZ_HOME_KEY });
    },
  });
}

/** The message friends see in Messenger / WhatsApp along with the link preview. */
export function quizShareMessage(quiz: Pick<OwnerQuiz, "shareUrl" | "questions">) {
  return `দেখি তুই আমাকে কতটা চিনিস 😏🍕\n${quiz.questions.length}টা প্রশ্ন — খেলে দেখ তুই আসল দোস্ত কিনা!\n${quiz.shareUrl}`;
}

/** Picks `count` random questions (Fisher–Yates on a copy). */
export function pickRandomQuestions<T>(bank: T[], count: number, exclude: Set<string> = new Set(), idOf: (item: T) => string) {
  const pool = bank.filter((item) => !exclude.has(idOf(item)));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const QUIZ_SUBMISSIONS_KEY = ["customer", "quiz-submissions"] as const;

export function useQuizSubmissionsQuery(enabled = true) {
  const customerId = useCustomerAuthStore((state) => state.customer?.id ?? null);
  return useQuery({
    queryKey: [...QUIZ_SUBMISSIONS_KEY, customerId],
    enabled: enabled && Boolean(customerId),
    staleTime: 30_000,
    queryFn: async () => (await apiProtectedGet<QuizSubmissionsResponse>("/customer/quiz/submissions")).data,
  });
}

export function useSubmitQuizQuestionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { text: string; options: string[]; category?: string }) =>
      (await apiProtectedPost<QuizSubmission>("/customer/quiz/submissions", body)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUIZ_SUBMISSIONS_KEY });
    },
  });
}
