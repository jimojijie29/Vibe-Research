import { useEffect, useMemo, useState } from "react";
import { Plus, X, RefreshCw, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { api, type Quote, type GlobalBatchQuote } from "@/lib/api";
import { loadWatch, saveWatch, addCodes, isAShare, isGlobal, type WatchlistMode } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

// A 股红涨绿跌（与整个看板一致）。
const color = (v: number | null | undefined) =>
  v == null ? "text-muted-foreground" : v > 0 ? "text-danger" : v < 0 ? "text-success" : "text-muted-foreground";
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);

export function Watchlist() {
  const [mode, setMode] = useState<WatchlistMode>("premarket");
  const [codes, setCodes] = useState<string[]>(() => loadWatch(mode));
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [globals, setGlobals] = useState<GlobalBatchQuote[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = (cs: string[]) => {
    const aShares = cs.filter(isAShare);
    const globalSymbols = cs.filter(isGlobal);
    setQuotes({});
    setGlobals([]);
    if (!aShares.length && !globalSymbols.length) return;
    setLoading(true);
    const jobs: Promise<void>[] = [];
    if (aShares.length) {
      jobs.push(api.quote(aShares.join(",")).then(setQuotes).catch(() => {}));
    }
    if (globalSymbols.length) {
      jobs.push(api.globalQuotes(globalSymbols.join(",")).then(setGlobals).catch(() => {}));
    }
    Promise.all(jobs).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(loadWatch(mode)); }, [mode]);

  const add = () => {
    const { next, added } = addCodes(codes, input);
    if (added === 0) {
      setHint(input.trim() ? "没识别到新的有效代码（可能已在自选里）" : null);
      setInput("");
      return;
    }
    setCodes(next); saveWatch(mode, next); setInput(""); setHint(`已添加 ${added} 只`);
    refresh(next);
  };
  const remove = (c: string) => {
    const next = codes.filter((x) => x !== c);
    setCodes(next); saveWatch(mode, next); refresh(next);
  };

  // mode 切换时重新加载
  useEffect(() => {
    const newCodes = loadWatch(mode);
    setCodes(newCodes);
    refresh(newCodes);
  }, [mode]);

  const aiContext = useMemo(() => {
    if (!codes.length) return "还没有自选股。";
    const lines = codes.map((c) => {
      if (isAShare(c)) {
        const q = quotes[c];
        return q
          ? `${q.name}(${c}) 现价${q.price} ${pct(q.change_pct)} PE(TTM)${q.pe_ttm ?? "—"} 换手${q.turnover_pct ?? "—"}%`
          : `${c}（行情未取到）`;
      }
      const g = globals.find((x) => x.symbol === c);
      const q = g?.quote;
      return q?.price != null
        ? `${g?.name || c}(${c}) 现价${q.price} ${pct(q.change_pct)}`
        : `${c}（行情未取到）`;
    });
    return "我的自选股（本地）：\n" + lines.join("\n");
  }, [codes, quotes, globals]);

  return (
    <div>
      <PageHeader
        title="自选股"
        subtitle="批量添加、一屏总览你关注的标的。数据只存本地、不上传。"
        actions={
          codes.length > 0 && (
            <AskAiButton
              context={aiContext}
              label="让 AI 读自选"
              suggestions={["这几只里哪些估值偏高", "帮我按赛道分组看看", "各自最大的风险点是什么"]}
            />
          )
        }
      />

      {/* Tab 切换 */}
      <div className="mb-4 flex gap-2">
        {[
          { value: "premarket" as const, label: "美港股自选", hint: "盘前准备用" },
          { value: "review" as const, label: "A股自选", hint: "今日复盘用" },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setMode(t.value)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              mode === t.value
                ? "bg-primary/20 text-primary shadow-glow"
                : "bg-black/20 text-muted-foreground hover:bg-black/30"
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] opacity-60">({t.hint})</span>
          </button>
        ))}
      </div>

      <GlassCard className="mb-4">
        <label className="mb-1.5 block text-xs text-muted-foreground">
          批量添加 —— 粘贴一串代码即可（逗号 / 空格 / 换行都行，自动识别 A 股 6 位代码与全球代码如 AAPL / 00700 / 005930.KS）
        </label>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
            }}
            rows={2}
            placeholder={"如：600519 000858, 002463\n300750 688017"}
            className="flex-1 resize-y rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <button
            onClick={add}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg bg-primary/15 px-4 text-sm font-medium text-primary shadow-glow hover:bg-primary/25"
          >
            <Plus className="h-4 w-4" /> 添加
          </button>
        </div>
        {hint && <p className="mt-2 text-xs text-muted-foreground/70">{hint}</p>}
      </GlassCard>

      <GlassCard glow>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Star className="h-4 w-4 text-primary" /> 自选总览
            <span className="text-xs font-normal text-muted-foreground">（{codes.length}）</span>
          </h3>
          <button
            onClick={() => refresh(codes)}
            disabled={loading}
            className="text-muted-foreground hover:text-primary"
            title="刷新价格"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
        {codes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground/60">
            还没有自选股，用上面的框粘贴一串代码批量添加。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  {["名称", "代码", "现价", "涨跌%", "PE(TTM)", "PB", "换手%", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  if (isAShare(c)) {
                    const q = quotes[c];
                    return (
                      <tr key={c} className="border-b border-border/30">
                        <td className="px-2 py-2.5 font-medium">{q?.name || "—"}</td>
                        <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">{c}</td>
                        <td className={cn("px-2 py-2.5 font-mono", color(q?.change_pct))}>{q ? q.price : "—"}</td>
                        <td className={cn("px-2 py-2.5 font-mono", color(q?.change_pct))}>{q ? pct(q.change_pct) : "—"}</td>
                        <td className="px-2 py-2.5 font-mono text-muted-foreground">{q?.pe_ttm ?? "—"}</td>
                        <td className="px-2 py-2.5 font-mono text-muted-foreground">{q?.pb ?? "—"}</td>
                        <td className="px-2 py-2.5 font-mono text-muted-foreground">{q?.turnover_pct ?? "—"}</td>
                        <td className="px-2 py-2.5">
                          <button
                            onClick={() => remove(c)}
                            className="text-muted-foreground/50 hover:text-destructive"
                            title="移除"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  const g = globals.find((x) => x.symbol === c);
                  const q = g?.quote;
                  return (
                    <tr key={c} className="border-b border-border/30">
                      <td className="px-2 py-2.5 font-medium">{g?.name || "—"}</td>
                      <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">{c}</td>
                      <td className={cn("px-2 py-2.5 font-mono", color(q?.change_pct ?? 0))}>{q?.price ?? "—"}</td>
                      <td className={cn("px-2 py-2.5 font-mono", color(q?.change_pct ?? 0))}>
                        {q?.price == null ? "—" : pct(q.change_pct)}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-muted-foreground">—</td>
                      <td className="px-2 py-2.5 font-mono text-muted-foreground">—</td>
                      <td className="px-2 py-2.5 font-mono text-muted-foreground">—</td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => remove(c)}
                          className="text-muted-foreground/50 hover:text-destructive"
                          title="移除"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Disclaimer />
    </div>
  );
}
