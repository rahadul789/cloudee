import { format } from "date-fns"

import type { AdminFinancePayoutStatement } from "@/lib/admin-api"
import { escapeHtml } from "@/lib/export-utils"

function formatMoney(value: number) {
  return `${Math.round(Number(value) || 0).toLocaleString("en-BD")}tk`
}

function formatDate(value?: string | null) {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return format(date, "dd MMM yyyy, hh:mm a")
}

function formatShortDate(value?: string | null) {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return format(date, "dd MMM yyyy")
}

export function getAdminPayoutStatementTitle(statement: AdminFinancePayoutStatement) {
  return `Payout statement - ${statement.restaurant.name}`
}

export function buildAdminPayoutStatementHtml(statement: AdminFinancePayoutStatement) {
  const transactionRows = statement.entries.length
    ? statement.entries
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(entry.orderNumber || entry.sourceLabel || entry.id)}</td>
              <td>${escapeHtml(entry.sourceLabel || entry.entryType)}</td>
              <td>${escapeHtml(entry.paymentMethod || "--")}</td>
              <td>${escapeHtml(formatShortDate(entry.deliveredAt || entry.createdAt))}</td>
              <td class="right">${escapeHtml(formatMoney(entry.grossAmount))}</td>
              <td class="right">${escapeHtml(formatMoney(entry.commission))}</td>
              <td class="right">${escapeHtml(formatMoney(entry.discountCost))}</td>
              <td class="right">${escapeHtml(formatMoney(entry.deliveryCost))}</td>
              <td class="right">${escapeHtml(formatMoney(entry.netAmount))}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="9" class="muted">No included transaction rows were found.</td></tr>`

  const payoutRows = statement.payoutEntries.length
    ? statement.payoutEntries
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(entry.id)}</td>
              <td>${escapeHtml(entry.sourceLabel || entry.entryType)}</td>
              <td>${escapeHtml(formatDate(entry.createdAt))}</td>
              <td class="right">${escapeHtml(formatMoney(entry.netAmount))}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">No payout movement row has been created yet.</td></tr>`

  const residualRows = statement.residualEntries.length
    ? statement.residualEntries
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(entry.id)}</td>
              <td>${escapeHtml(entry.sourceLabel || "Carry-forward")}</td>
              <td>${escapeHtml(entry.settlementStatus || "--")}</td>
              <td class="right">${escapeHtml(formatMoney(entry.netAmount))}</td>
            </tr>
          `,
        )
        .join("")
    : statement.summary.residualAmount > 0
      ? `<tr><td colspan="4" class="muted">This payout will create ${escapeHtml(formatMoney(statement.summary.residualAmount))} carry-forward for the next payout.</td></tr>`
      : `<tr><td colspan="4" class="muted">No carry-forward residual.</td></tr>`

  return `
    <div class="header">
      <div>
        <div class="muted">Foodbela Restaurant Payout</div>
        <h1>${escapeHtml(statement.restaurant.name)}</h1>
        <div class="muted">Owner: ${escapeHtml(statement.owner.fullName || "Restaurant owner")} ${escapeHtml(statement.owner.phone || "")}</div>
        <div class="muted">Generated: ${escapeHtml(formatDate(statement.generatedAt))}</div>
      </div>
      <div>
        <div class="muted">Statement checksum</div>
        <strong>${escapeHtml(statement.statementChecksum.slice(0, 16))}</strong>
        <div class="amount">${escapeHtml(formatMoney(statement.amount))}</div>
      </div>
    </div>
    <div class="grid">
      <div class="metric"><span class="muted">Payout amount</span><strong>${escapeHtml(formatMoney(statement.summary.payoutAmount))}</strong></div>
      <div class="metric"><span class="muted">Included entries</span><strong>${escapeHtml(statement.summary.entryCount)}</strong></div>
      <div class="metric"><span class="muted">Food sales</span><strong>${escapeHtml(formatMoney(statement.summary.grossAmount))}</strong></div>
      <div class="metric"><span class="muted">Owner earning</span><strong>${escapeHtml(formatMoney(statement.summary.netAmount))}</strong></div>
      <div class="metric"><span class="muted">Commission</span><strong>${escapeHtml(formatMoney(statement.summary.commission))}</strong></div>
      <div class="metric"><span class="muted">Owner discount</span><strong>${escapeHtml(formatMoney(statement.summary.discountCost))}</strong></div>
      <div class="metric"><span class="muted">Selected total</span><strong>${escapeHtml(formatMoney(statement.summary.selectedTotal))}</strong></div>
      <div class="metric"><span class="muted">Carry-forward</span><strong>${escapeHtml(formatMoney(statement.summary.residualAmount))}</strong></div>
    </div>
    <h2>Included order transactions</h2>
    <table>
      <thead>
        <tr>
          <th>Order</th>
          <th>Type</th>
          <th>Payment</th>
          <th>Delivered</th>
          <th class="right">Food sales</th>
          <th class="right">Commission</th>
          <th class="right">Owner discount</th>
          <th class="right">Delivery cost</th>
          <th class="right">Owner earning</th>
        </tr>
      </thead>
      <tbody>${transactionRows}</tbody>
      <tfoot>
        <tr>
          <th colspan="4">Total</th>
          <th class="right">${escapeHtml(formatMoney(statement.summary.grossAmount))}</th>
          <th class="right">${escapeHtml(formatMoney(statement.summary.commission))}</th>
          <th class="right">${escapeHtml(formatMoney(statement.summary.discountCost))}</th>
          <th class="right">${escapeHtml(formatMoney(statement.summary.deliveryCost))}</th>
          <th class="right">${escapeHtml(formatMoney(statement.summary.netAmount))}</th>
        </tr>
      </tfoot>
    </table>
    <h2>Payout ledger movement</h2>
    <table>
      <thead><tr><th>Ledger row</th><th>Type</th><th>Created</th><th class="right">Net movement</th></tr></thead>
      <tbody>${payoutRows}</tbody>
    </table>
    <h2>Carry-forward residual</h2>
    <table>
      <thead><tr><th>Ledger row</th><th>Type</th><th>Status</th><th class="right">Amount</th></tr></thead>
      <tbody>${residualRows}</tbody>
    </table>
  `
}
