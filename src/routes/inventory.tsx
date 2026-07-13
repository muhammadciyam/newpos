import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Inventory"
      description="Manage stock levels, purchase orders and suppliers."
      icon={Database}
      empty="No inventory items yet."
    />
  ),
});
