import { createFileRoute } from "@tanstack/react-router";
import { Puzzle } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Integrations"
      description="Connect Dhipos with WooCommerce, accounting tools and more."
      icon={Puzzle}
      empty="No integrations connected yet."
    />
  ),
});
