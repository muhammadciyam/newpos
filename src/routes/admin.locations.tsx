import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/admin/locations")({
  head: () => ({ meta: [{ title: "Locations — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Locations"
      description="Manage the outlets and registers for this company."
      icon={MapPin}
      empty="Seven Mart is your only location."
    />
  ),
});
