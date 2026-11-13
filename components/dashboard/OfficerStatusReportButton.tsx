"use client"

import { useRef, useState } from "react"
import { FileSpreadsheet, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function OfficerStatusReportButton() {
  const pending = useRef(false)
  const [downloading, setDownloading] = useState(false)

  async function download() {
    if (pending.current) return
    pending.current = true
    setDownloading(true)
    try {
      const response = await fetch("/api/officers/status-report", { method: "POST", cache: "no-store" })
      if (response.status === 401 || response.redirected) {
        toast.error("Sign in again to download the officer status report.")
        return
      }
      if (response.status === 403) {
        toast.error("Only active admins and executives can download this report.")
        return
      }
      if (!response.ok || !response.headers.get("Content-Type")?.includes("spreadsheetml.sheet")) {
        throw new Error("Report download failed")
      }

      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "TCNP_Officer_Status.xlsx"
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch {
      toast.error("Could not download the officer status report. Try again.")
    } finally {
      pending.current = false
      setDownloading(false)
    }
  }

  const Icon = downloading ? LoaderCircle : FileSpreadsheet
  return (
    <Button type="button" size="sm" onClick={download} disabled={downloading} aria-busy={downloading} className="gap-2 rounded-xl">
      <Icon className={downloading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
      {downloading ? "Generating report…" : "Download officer status report"}
    </Button>
  )
}
