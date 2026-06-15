import type { LucideIcon } from "lucide-react"

export type HelpCategory = {
  id: string
  name: string
  description: string
  icon: LucideIcon
}

export type HelpArticleSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
  steps?: string[]
}

export type HelpArticle = {
  id: string
  categoryId: string
  title: string
  excerpt: string
  readTime: string
  sections: HelpArticleSection[]
}

export type FAQ = {
  id: string
  categoryId: string
  question: string
  answer: string
}

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed"
export type SupportTicketPriority = "low" | "medium" | "high"

export type SupportAttachment = {
  url: string
  publicId?: string
  fileName?: string
  fileType?: string
}

export type SupportTicket = {
  id: string
  kind?: "report" | "question"
  subject: string
  categoryId: string
  message: string
  status: SupportTicketStatus
  createdAt: string
  updatedAt: string
  priority: SupportTicketPriority
  attachments?: SupportAttachment[]
  replies?: Array<{
    message: string
    adminName?: string
    createdAt: string
  }>
}
