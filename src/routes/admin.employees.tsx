import { createFileRoute } from "@tanstack/react-router";
import { UserSquare2 } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/admin/employees")({
  head: () => ({ meta: [{ title: "Employees — Dhipos" }] }),
  component: () => (
    <PlaceholderPage
      title="Employees"
      description="Manage employee records and register access."
      icon={UserSquare2}
      empty="No employees added yet."
    />
  ),
});
