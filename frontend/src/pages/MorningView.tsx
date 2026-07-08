import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Globe, TrendingUp, TrendingDown, Plus, X, Loader2, BarChart3, Wallet, CalendarDays } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { api, type MarketSnapshot, type MarginRank, type GlobalBatchQuote, type Quote } from "@/lib/api";
import { loadWatch, saveWatch, addCodes, isAShare, isGlobal } from "@/lib/watchlist";
import { cn, pctColor, fmt, yi } from "@/lib/utils";

export function MorningView() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [snapErr, setSnapErr] = useState(false);
  const [stockRank, setStockRank] = useState<MarginRank | null>(null);
  const [sectorRank, setSectorRank] = useState<MarginRank | null>(null);
  const [rankDone, setRankDone] = useState(false);
  const [rankErr, setRankErr] = useState(false);
  const [rankDate, setRankDate] = useState<string>("");
  const rankReqRef = useRef(0);

  // 关注股票（自选，存本地）
  const [watchCodes, setWatchCodes] = useState<string[]>(loadWatch);
  const [watchQuotes, setWatchQuotes] = useState<Record<string, Quote>>({});
  const [watchGlobal, setWatchGlobal] = useState<GlobalBatchQuote[]>([]);
  const [watchInput, setWatchInput] = useState("");
  const [watchLoading, setWatchLoading] = useState(false);

  const loadSnapshot = useCallback(() => {
    setSnapErr(false);
    api
      .marketSnapshot()
      .then(setSnapshot)
      .catch(() => setSnapErr(true));
  }, []);

  const loadRanks = useCallback((date?: string, clear = false) => {
    const reqId = ++rankReqRef.current;
    setRankDone(false);
    setRankErr(false);
    if (clear) {
      setRankDate(date || "");
      setStockRank(null);
      setSectorRank(null);
    }
    Promise.allSettled([api.marginStockRank(10, date), api.marginSectorRank(10, date)])
      .then(([s, b]) => {
        if (reqId !== rankReqRef.current) return;
        let nextStock: MarginRank | null = null;
        let nextSector: MarginRank | null = null;
        let hasErr = false;
        if (s.status === "fulfilled") nextStock = s.value;
        else hasErr = true;
        if (b.status === "fulfilled") nextSector = b.value;
        else hasErr = true;
        setStockRank(nextStock);
        setSectorRank(nextSector);
        setRankDate((nextStock?.date || nextSector?.date || date) ?? "");
        setRankErr(hasErr);
      })
      .catch(() => {
        if (reqId !== rankReqRef.current) return;
        setRankErr(true);
      })
      .finally(() => {
        if (reqId !== rankReqRef.current) return;
        setRankDone(true);
      });
  }, []);

  const refreshWatch = (codes: string[]) => {
    const aShares = codes.filter(isAShare);
    const globals = codes.filter(isGlobal);
    setWatchQuotes({});
    setWatchGlobal([]);
    if (!aShares.length && !globals.length) return;
    setWatchLoading(true);
    const jobs: Promise<void>[] = [];
    if (aShares.length) {
      jobs.push(
        api
          .quote(aShares.join(","))
          .then((q) => setWatchQuotes(q))
          .catch(() => {})
      );
    }
    if (globals.length) {
      jobs.push(
        api
          .globalQuotes(globals.join(","))
          .then((q) => setWatchGlobal(q))
          .catch(() => {})
      );
    }
    Promise.all(jobs).finally(() => setWatchLoading(false));
  };

  useEffect(() => {
    loadSnapshot();
    loadRanks();
    refreshWatch(loadWatch());
    // 只在挂载时执行一次；fetch 函数用 useCallback 保持稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addWatch = () => {
    const { next, added } = addCodes(watchCodes, watchInput);
    setWatchInput("");
    if (!added) return;
    setWatchCodes(next);
    saveWatch(next);
    refreshWatch(next);
  };

  const removeWatch = (c: string) => {
    const next = watchCodes.filter((x) => x !== c);
    setWatchCodes(next);
    saveWatch(next);
    refreshWatch(next);
  };

  const marginBalance = snapshot?.margin_balance;
  const totalRzye =
    (marginBalance?.sh_rzye ?? 0) + (marginBalance?.sz_rzye ?? 0);
  const totalRzrqye =
    (marginBalance?.sh_rzrqye ?? 0) + (marginBalance?.sz_rzrqye ?? 0);

  const placeholder = (done: boolean, date: string, err: boolean) => (
    <p className="py-4 text-center text-sm text-muted-foreground/60">
      {done
        ? err
          ? "加载失败，请稍后重试"
          : date
            ? "该日无数据"
            : "暂无数据：可能是非交易时段或数据源暂时不可用"
        : "加载中…"}
    </p>
  );

  return (
    <div className="space-y-6">
      {/* 1. 大盘指数 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">A 股大盘指数</h3>
          <button onClick={loadSnapshot} className="text-muted-foreground hover:text-primary" title="刷新">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {snapshot?.a_indices.length
            ? snapshot.a_indices.map((i) => (
                <GlassCard key={i.name} className="p-3">
                  <p className="truncate text-xs text-muted-foreground">{i.name}</p>
                  <p className={cn("mt-1 font-mono text-lg font-bold", pctColor(i.change_pct))}>{i.price}</p>
                  <p className={cn("text-xs", pctColor(i.change_pct))}>
                    {i.change_pct > 0 ? "+" : ""}
                    {i.change_pct}%
                  </p>
                </GlassCard>
              ))
            : [1, 2, 3, 4, 5, 6].map((i) => (
                <GlassCard key={i} className="p-3">
                  <p className="text-xs text-muted-foreground">{snapErr ? "行情未接通" : "加载中…"}</p>
                  <p className="mt-1 font-mono text-lg font-bold text-muted-foreground/40">—</p>
                </GlassCard>
              ))}
        </div>
      </section>

      {/* 2. 全球市场 */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Globe className="h-4 w-4" /> 全球市场
          </h3>
          <span className="text-[11px] text-muted-foreground/50">隔夜外围 · A 股常看美股 / 港股脸色</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {snapshot?.global_indices.length
            ? snapshot.global_indices.map((g) => (
                <GlassCard key={g.key} className="p-3">
                  <p className="truncate text-xs text-muted-foreground">
                    {g.name} <span className="text-muted-foreground/40">{g.region}</span>
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-lg font-bold",
                      g.change_pct == null ? "text-foreground" : pctColor(g.change_pct)
                    )}
                  >
                    {g.price ?? "—"}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      g.change_pct == null ? "text-muted-foreground" : pctColor(g.change_pct)
                    )}
                  >
                    {g.change_pct == null ? "—" : `${g.change_pct > 0 ? "+" : ""}${g.change_pct}%`}
                  </p>
                </GlassCard>
              ))
            : [1, 2, 3, 4, 5].map((i) => (
                <GlassCard key={i} className="p-3">
                  <p className="text-xs text-muted-foreground">{snapErr ? "行情未接通" : "加载中…"}</p>
                  <p className="mt-1 font-mono text-lg font-bold text-muted-foreground/40">—</p>
                </GlassCard>
              ))}
        </div>
      </section>

      {/* 3. 关注股票 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">关注股票</h3>
          {watchCodes.length > 0 && (
            <button
              onClick={() => refreshWatch(watchCodes)}
              className="text-muted-foreground hover:text-primary"
              title="刷新价格"
            >
              {watchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <GlassCard>
          <div className="mb-3 flex gap-2">
            <input
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value.slice(0, 80))}
              onKeyDown={(e) => e.key === "Enter" && addWatch()}
              placeholder="加自选：A股如 600519，全球如 AAPL 00700 005930.KS"
              className="w-full max-w-md rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <button
              onClick={addWatch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25"
            >
              <Plus className="h-4 w-4" /> 增加
            </button>
          </div>
          {watchCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground/60">
              加上你关注的 A 股或全球股票，随时看实时价格与涨跌。数据存本地，不上传。
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {watchCodes.map((c) => {
                if (isAShare(c)) {
                  const q = watchQuotes[c];
                  return (
                    <div key={c} className="group relative rounded-lg bg-muted/25 p-3">
                      <button
                        onClick={() => removeWatch(c)}
                        title="移除"
                        className="absolute right-1.5 top-1.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <p className="truncate text-xs text-muted-foreground">{q?.name || c}</p>
                      <p
                        className={cn(
                          "mt-1 font-mono text-lg font-bold",
                          q ? pctColor(q.change_pct) : "text-muted-foreground/40"
                        )}
                      >
                        {q ? q.price : "—"}
                      </p>
                      <p className={cn("text-xs", q ? pctColor(q.change_pct) : "text-muted-foreground/40")}>
                        {q ? `${q.change_pct > 0 ? "+" : ""}${q.change_pct}%` : c}
                      </p>
                    </div>
                  );
                }
                const g = watchGlobal.find((x) => x.symbol === c);
                const q = g?.quote;
                return (
                  <div key={c} className="group relative rounded-lg bg-muted/25 p-3">
                    <button
                      onClick={() => removeWatch(c)}
                      title="移除"
                      className="absolute right-1.5 top-1.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {g?.name || c} <span className="text-muted-foreground/40">{g?.market}</span>
                    </p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-lg font-bold",
                        q?.price != null ? pctColor(q.change_pct ?? 0) : "text-muted-foreground/40"
                      )}
                    >
                      {q?.price ?? "—"}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        q?.price != null ? pctColor(q.change_pct ?? 0) : "text-muted-foreground/40"
                      )}
                    >
                      {q?.price == null
                        ? c
                        : `${(q.change_pct ?? 0) > 0 ? "+" : ""}${q.change_pct ?? 0}%`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </section>

      {/* 4. 成交额 / 融资余额 */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <BarChart3 className="h-4 w-4" /> 市场成交与杠杆
          </h3>
          <span className="text-[11px] text-muted-foreground/50">沪深两市成交额 / 融资余额</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">沪深两市总成交额</p>
            <p className="mt-1 font-mono text-2xl font-bold text-primary">
              {snapshot?.turnover?.length ? yi(snapshot.turnover.reduce((s, r) => s + (r.amount ?? 0), 0)) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">取自成交额榜前 20 汇总</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">沪深两市融资余额</p>
            <p className="mt-1 font-mono text-2xl font-bold text-primary">{totalRzye ? yi(totalRzye) : "—"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">沪 + 深</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">沪深两市融资融券余额</p>
            <p className="mt-1 font-mono text-2xl font-bold text-primary">{totalRzrqye ? yi(totalRzrqye) : "—"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">融资 + 融券</p>
          </GlassCard>
        </div>
      </section>

      {/* 5. 行业板块融资净买入/卖出前 10 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Wallet className="h-4 w-4" /> 行业融资净买入 / 卖出 Top10
            </h3>
            {sectorRank?.date && <span className="text-[11px] text-muted-foreground/50">{sectorRank.date}</span>}
          </div>
          <label
            htmlFor="rank-date"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-black/20 px-2 py-1 text-xs text-muted-foreground"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="sr-only">选择融资排名日期</span>
            <input
              id="rank-date"
              type="date"
              value={rankDate}
              onChange={(e) => loadRanks(e.target.value, true)}
              className="border-none bg-transparent p-0 text-xs outline-none"
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { title: "净买入", icon: TrendingUp, color: "text-danger", rows: sectorRank?.buy || [] },
            { title: "净卖出", icon: TrendingDown, color: "text-success", rows: sectorRank?.sell || [] },
          ].map((col) => (
            <GlassCard key={col.title}>
              <h4 className={cn("mb-3 flex items-center gap-1.5 text-sm font-semibold", col.color)}>
                <col.icon className="h-4 w-4" /> {col.title}
              </h4>
              {!col.rows.length ? (
                placeholder(rankDone, rankDate, rankErr)
              ) : (
                <div className="space-y-1.5">
                  {col.rows.map((s, i) => (
                    <div
                      key={s.name}
                      className="flex items-center gap-3 border-b border-border/30 pb-1.5 text-sm last:border-0"
                    >
                      <span className="w-5 text-xs text-muted-foreground/50">{i + 1}</span>
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className={cn("w-24 text-right font-mono text-xs", pctColor(s.rzjme))}>
                        {s.rzjme > 0 ? "+" : ""}
                        {fmt(s.rzjme / 1e8)} 亿
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      </section>

      {/* 6. 个股融资净买入/卖出前 10 */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Wallet className="h-4 w-4" /> 个股融资净买入 / 卖出 Top10
          </h3>
          {stockRank?.date && <span className="text-[11px] text-muted-foreground/50">{stockRank.date}</span>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { title: "净买入", icon: TrendingUp, color: "text-danger", rows: stockRank?.buy || [] },
            { title: "净卖出", icon: TrendingDown, color: "text-success", rows: stockRank?.sell || [] },
          ].map((col) => (
            <GlassCard key={col.title}>
              <h4 className={cn("mb-3 flex items-center gap-1.5 text-sm font-semibold", col.color)}>
                <col.icon className="h-4 w-4" /> {col.title}
              </h4>
              {!col.rows.length ? (
                placeholder(rankDone, rankDate, rankErr)
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                        {["#", "名称", "净买入", "融资余额"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {col.rows.map((s, i) => (
                        <tr key={s.code || s.name} className="border-b border-border/30">
                          <td className="px-2 py-2 font-mono text-xs text-muted-foreground/50">{i + 1}</td>
                          <td className="px-2 py-2">
                            <span className="font-medium">{s.name}</span>{" "}
                            <span className="text-xs text-muted-foreground/50">{s.code}</span>
                          </td>
                          <td className={cn("px-2 py-2 font-mono", pctColor(s.rzjme))}>
                            {s.rzjme > 0 ? "+" : ""}
                            {fmt(s.rzjme / 1e8)} 亿
                          </td>
                          <td className="px-2 py-2 font-mono text-muted-foreground">
                            {s.rzye != null ? yi(s.rzye) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground/50">
        数据更新时间：{snapshot?.updated || "—"}。融资排名数据基于东财最新交易日公开报表。
      </p>
    </div>
  );
}
