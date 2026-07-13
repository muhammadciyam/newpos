import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/admin/notification")({
  head: () => ({ meta: [{ title: "Notification — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Notification"
      description="Configure alerts for low stock, register activity and more."
      icon={Bell}
      empty="No notification rules configured yet."
    />
  ),
});
