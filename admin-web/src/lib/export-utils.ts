export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function printReport(title: string, bodyHtml: string) {
  const popup = window.open("", "_blank", "width=1100,height=800")
  if (!popup) return false
  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
          h1 { font-size: 22px; margin: 0 0 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
          th { background: #f9fafb; }
          .muted { color: #6b7280; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
          .metric { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
          .metric strong { display: block; font-size: 16px; margin-top: 4px; }
          @media print { body { margin: 12mm; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${bodyHtml}
      </body>
    </html>
  `)
  popup.document.close()
  popup.focus()
  popup.print()
  return true
}

export function printReportInFrame(title: string, bodyHtml: string) {
  if (typeof document === "undefined") return false
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
          h1 { font-size: 22px; margin: 0 0 16px; }
          h2 { font-size: 16px; margin: 22px 0 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #e5e7eb; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f9fafb; }
          tfoot th { background: #f3f4f6; }
          .muted { color: #6b7280; }
          .right { text-align: right; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
          .metric { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
          .metric strong { display: block; font-size: 15px; margin-top: 4px; }
          .header { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
          .amount { font-size: 24px; font-weight: 700; margin-top: 8px; text-align: right; }
          @media print { body { margin: 12mm; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${bodyHtml}
      </body>
    </html>
  `
  const frame = document.createElement("iframe")
  const objectUrl = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" })
  )
  let cleanupTimer: number | undefined
  let cleaned = false

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (cleanupTimer) window.clearTimeout(cleanupTimer)
    URL.revokeObjectURL(objectUrl)
    frame.remove()
  }

  frame.title = title
  frame.setAttribute("aria-hidden", "true")
  frame.style.position = "fixed"
  frame.style.right = "0"
  frame.style.bottom = "0"
  frame.style.width = "0"
  frame.style.height = "0"
  frame.style.border = "0"
  frame.onload = () => {
    const printWindow = frame.contentWindow
    if (!printWindow) {
      cleanup()
      return
    }
    printWindow.addEventListener("afterprint", cleanup, { once: true })
    cleanupTimer = window.setTimeout(cleanup, 120_000)
    try {
      printWindow.focus()
      printWindow.print()
    } catch {
      cleanup()
    }
  }
  frame.onerror = cleanup
  frame.src = objectUrl
  document.body.appendChild(frame)
  return true
}

export function printTableReport(params: {
  title: string
  subtitle?: string
  metrics?: Array<{ label: string; value: string | number }>
  headers: string[]
  rows: Array<Array<string | number | null | undefined>>
}) {
  const metricsHtml = params.metrics?.length
    ? `<div class="grid">${params.metrics
        .map(
          (metric) =>
            `<div class="metric"><span class="muted">${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></div>`
        )
        .join("")}</div>`
    : ""
  const tableHtml = `
    ${params.subtitle ? `<p class="muted">${escapeHtml(params.subtitle)}</p>` : ""}
    ${metricsHtml}
    <table>
      <thead>
        <tr>${params.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${params.rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
  `
  return printReport(params.title, tableHtml)
}
