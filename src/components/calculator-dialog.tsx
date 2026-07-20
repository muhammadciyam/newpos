import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

// Left-to-right with * and / resolved before + and - (no parentheses) — enough for tallying
// a stock count like "24*5+3" without pulling in a full expression-parser dependency, and
// safer/simpler than eval()'ing a string since input only ever comes from the keypad below.
function evaluateExpression(expr: string): number | null {
  const tokens = expr.match(/\d+\.?\d*|[+\-*/]/g);
  if (!tokens || tokens.length === 0) return null;

  const values: number[] = [];
  const operators: string[] = [];
  for (const t of tokens) {
    if (t === "+" || t === "-" || t === "*" || t === "/") operators.push(t);
    else values.push(parseFloat(t));
  }
  if (values.length === 0) return null;

  const reducedValues: number[] = [values[0]];
  const reducedOps: string[] = [];
  for (let i = 0; i < operators.length; i++) {
    const next = values[i + 1];
    if (next === undefined) break;
    const op = operators[i];
    if (op === "*" || op === "/") {
      const last = reducedValues.pop() as number;
      reducedValues.push(op === "*" ? last * next : last / next);
    } else {
      reducedValues.push(next);
      reducedOps.push(op);
    }
  }

  let result = reducedValues[0];
  for (let i = 0; i < reducedOps.length; i++) {
    result = reducedOps[i] === "+" ? result + reducedValues[i + 1] : result - reducedValues[i + 1];
  }
  return Number.isFinite(result) ? result : null;
}

const KEYS = [
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "=", "+"],
];

export function CalculatorDialog({
  open,
  onOpenChange,
  title,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onApply: (value: number) => void;
}) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setExpr("");
      setResult(null);
    }
  }, [open]);

  function pressKey(key: string) {
    if (key === "=") {
      setResult(evaluateExpression(expr));
      return;
    }
    // Starting a fresh expression right after a result — continue from that result
    // (e.g. "24" -> "=" -> "+5" reads as continuing the tally) rather than replacing it.
    if (result !== null) {
      setExpr(String(result) + key);
      setResult(null);
      return;
    }
    setExpr((e) => e + key);
  }

  function backspace() {
    setResult(null);
    setExpr((e) => e.slice(0, -1));
  }

  function clear() {
    setExpr("");
    setResult(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Calculator{title ? ` — ${title}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted p-3 text-right">
          <p className="min-h-6 truncate text-sm text-muted-foreground">{expr || "0"}</p>
          <p className="truncate text-2xl font-bold text-foreground">
            {result !== null ? result : expr || "0"}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Button type="button" variant="outline" className="col-span-3" onClick={clear}>
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={backspace} title="Backspace">
            <Delete className="h-4 w-4" />
          </Button>
          {KEYS.flat().map((k) => (
            <Button
              key={k}
              type="button"
              variant={k === "=" ? "default" : /[+\-*/]/.test(k) ? "secondary" : "outline"}
              onClick={() => pressKey(k)}
            >
              {k === "*" ? "×" : k === "-" ? "−" : k === "/" ? "÷" : k}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={result === null && evaluateExpression(expr) === null}
            onClick={() => {
              const value = result !== null ? result : evaluateExpression(expr);
              if (value === null) return;
              onApply(value);
              onOpenChange(false);
            }}
          >
            Use This Value
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
