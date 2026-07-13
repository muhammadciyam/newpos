import { createFileRoute } from "@tanstack/react-router";
import { Percent } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/admin/taxes")({
  head: () => ({ meta: [{ title: "Taxes — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Taxes"
      description="Manage tax rates applied to products and bills."
      icon={Percent}
      empty="No custom tax rates configured yet."
    />
  ),
});
