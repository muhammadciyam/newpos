import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { BookText } from "lucide-react";
import { authStore, useCurrentUser } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Log In - Dhipos" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    authStore.hydrate();
    if (authStore.getCurrentUser()) {
      navigate({ to: "/" });
    }
  }, [navigate]);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const matched = authStore.login(email, password);
    if (!matched) {
      setError("Incorrect email or password");
      return;
    }
    logAudit(matched.name, "login", "Session");
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookText className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-foreground">Dhipos</p>
          <p className="text-sm text-muted-foreground">Log in to your account</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" size="lg">
            Log In
          </Button>
        </form>
      </Card>
    </div>
  );
}
