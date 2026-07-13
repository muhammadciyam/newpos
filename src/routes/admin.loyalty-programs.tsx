import { createFileRoute } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/admin/loyalty-programs")({
  head: () => ({ meta: [{ title: "Loyalty Programs — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Loyalty Programs"
      description="Create and manage loyalty programs to engage your customers."
      icon={Gift}
      empty="No loyalty programs created yet."
    />
  ),
});
