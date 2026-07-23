import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Filter, Tag } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useExpenses, expensesStore } from "@/lib/expenses-store";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses - Dhipos" },
      { name: "description", content: "Track all your expenses in one place." },
    ],
  }),
  component: ExpensesPage,
});

const months = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

const emptyForm = {
  description: "",
  category: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
};

function ExpensesPage() {
  const expenses = useExpenses();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const categories = Array.from(new Set(expenses.map((e) => e.category))).sort();
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const filtered = expenses.filter(
    (e) =>
      (categoryFilter === "all" || e.category === categoryFilter) &&
      (!search.trim() ||
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase())),
  );

  async function addExpense() {
    const amount = parseFloat(form.amount) || 0;
    await expensesStore.create({
      description: form.description,
      category: form.category || "Uncategorised",
      amount,
      date: form.date,
    });
    toast.success(`Expense "${form.description}" added`);
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Tabs defaultValue="expenses">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="expenses" className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
                <p className="text-sm text-muted-foreground">
                  Track all your expenses in one place.
                </p>
              </div>
              <Button className="gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Add Expense
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">{total.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">vs 0.00 previous period</p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Entries
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">{expenses.length}</p>
                <p className="text-xs text-muted-foreground">
                  {expenses.length ? "in this period" : "no entries yet"}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg Per Month
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">{total.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">trailing 6 months</p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Outstanding
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">0.00</p>
                <p className="text-xs text-muted-foreground">nothing outstanding this period</p>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">Monthly total - by category</p>
                    <p className="text-sm text-muted-foreground">
                      Last 6 months - current month highlighted
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Jul 2026{" "}
                    <span className="font-semibold text-foreground">MVR{total.toFixed(2)}</span>
                  </p>
                </div>
                <div className="mt-6 flex h-40 flex-col items-center justify-center gap-1 border-t border-border pt-4 text-sm text-muted-foreground">
                  <p>{expenses.length ? "Trend chart coming soon" : "No data yet"}</p>
                  <p className="text-xs">
                    {expenses.length ? "" : "Log an expense to start the trend"}
                  </p>
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  {months.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <p className="font-semibold text-foreground">By category</p>
                <p className="text-sm text-muted-foreground">This month - share of total</p>
                <div className="mt-8 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Tag className="h-4 w-4" />
                  </span>
                  <p className="font-medium text-foreground">
                    {expenses.length
                      ? `${new Set(expenses.map((e) => e.category)).size} categories logged`
                      : "Nothing logged this month"}
                  </p>
                  <p className="text-center text-xs">
                    Add an expense to start the category breakdown.
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-foreground">Entries</p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search description or vendor"
                      className="w-64 pl-8"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-44 gap-1.5">
                      <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.description}</TableCell>
                        <TableCell>{e.category}</TableCell>
                        <TableCell>{e.amount.toFixed(2)}</TableCell>
                        <TableCell>{e.date}</TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                          No expenses logged yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <Card className="p-10 text-center text-sm text-muted-foreground">
              No categories created yet.
            </Card>
          </TabsContent>
          <TabsContent value="vendors" className="mt-4">
            <Card className="p-10 text-center text-sm text-muted-foreground">
              No vendors added yet.
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Electricity bill"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Utilities"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!form.description.trim() || !form.amount} onClick={addExpense}>
              Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
