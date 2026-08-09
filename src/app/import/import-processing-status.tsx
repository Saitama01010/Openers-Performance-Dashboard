"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { StatusBanner } from "@/components/dashboard/dashboard-primitives";

export function ImportProcessingStatus({
  status,
  failureReason,
}: {
  status: "queued" | "processing" | "failed" | "cancelled";
  failureReason?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "queued" && status !== "processing") return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [router, status]);

  if (status === "failed" || status === "cancelled") {
    return (
      <StatusBanner tone="danger">
        {failureReason ?? "The import could not be processed. Upload the file again or contact an administrator."}
      </StatusBanner>
    );
  }

  return (
    <StatusBanner tone="info">
      {status === "queued"
        ? "The CSV is queued for background validation. This page will update automatically."
        : "The background worker is validating and staging the CSV. This page will update automatically."}
    </StatusBanner>
  );
}
