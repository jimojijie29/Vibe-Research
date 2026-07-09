import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Globe, TrendingUp, TrendingDown, Plus, X, Loader2, BarChart3, Wallet, CalendarDays } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { api, type MarketSnapshot, type MarginRank, type GlobalBatchQuote, type Quote, type GanzhiCalendar } from "@/lib/api";
import { loadWatch, saveWatch, addCodes, isAShare, isGlobal } from "@/lib/watchlist";
import { cn, pctColor, fmt, yi } from "@/lib/utils";

type MorningViewMode = "premarket" | "review";

interface MorningViewProps {
  mode?: MorningViewMode;
  showOnlyWatchlist?: boolean;  // 仅显示关注股票
}

export function MorningView({ mode = "premarket", showOnlyWatchlist = false }: MorningViewProps) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [snapErr, setSnapErr] = useState(false);
  const [stockRank, setStockRank] = useState<MarginRank | null>(null);
  const [sectorRank, setSectorRank] = useState<MarginRank | null>(null);
  const [rankDone, setRankDone] = useState(false);
  const [rankErr, setRankErr] = useState(false);
  const [rankDate, setRankDate] = useState<string>("");
  const rankReqRef = useRef(0);

  // 干支日历（新增）
  const [ganzhi, setGanzhi] = useState<GanzhiCalendar | null>(null);

  // 关注股票（自选，存本地）
  const [watchCodes, setWatchCodes] = useState<string[]>(() => loadWatch(mode));
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
    // 根据 mode 过滤股票
    const filteredCodes = mode === "premarket"
      ? codes.filter(isGlobal)  // 盘前准备：仅美港股
      : codes.filter(isAShare);  // 今日复盘：仅A股

    const aShares = filteredCodes.filter(isAShare);
    const globals = filteredCodes.filter(isGlobal);
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
    refreshWatch(watchCodes);
    // 加载干支日历
    api.ganzhiCalendar().then(setGanzhi).catch(() => {});
    // mode 变化时重新加载自选股
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const addWatch = () => {
    const { next, added } = addCodes(watchCodes, watchInput);
    setWatchInput("");
    if (!added) return;
    setWatchCodes(next);
    saveWatch(mode, next);
    refreshWatch(next);
  };

  const removeWatch = (c: string) => {
    const next = watchCodes.filter((x) => x !== c);
    setWatchCodes(next);
    saveWatch(mode, next);
    refreshWatch(next);
  };

  const marginBalance = snapshot?.margin_balance;
  const totalRzye =
    (marginBalance?.sh_rzye ?? 0) + (marginBalance?.sz_rzye ?? 0);

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
      {/* 仅显示关注股票时跳过其他区块 */}
      {!showOnlyWatchlist && (
        <>
          {/* 0. 干支日历（新增） */}
          {ganzhi && (
        <GlassCard>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            干支日历
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">年</p>
              <div className="flex flex-col items-center">
                <p className="text-2xl font-semibold leading-tight">{ganzhi.year_gz[0]}</p>
                <p className="text-2xl font-semibold leading-tight">{ganzhi.year_gz[1]}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{ganzhi.zodiac}年</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">月</p>
              <div className="flex flex-col items-center">
                <p className="text-2xl font-semibold leading-tight">{ganzhi.month_gz[0]}</p>
                <p className="text-2xl font-semibold leading-tight">{ganzhi.month_gz[1]}</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">日</p>
              <div className="flex flex-col items-center">
                <p className="text-2xl font-semibold leading-tight">{ganzhi.day_gz[0]}</p>
                <p className="text-2xl font-semibold leading-tight">{ganzhi.day_gz[1]}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{ganzhi.lunar_date}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">时</p>
              <div className="flex flex-col items-center">
                <p className="text-2xl font-semibold leading-tight">{ganzhi.hour_gz[0]}</p>
                <p className="text-2xl font-semibold leading-tight">{ganzhi.hour_gz[1]}</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">节气</p>
              <div className="flex flex-col items-center justify-center h-[56px]">
                {ganzhi.solar_term ? (
                  <p className="text-xl font-semibold text-primary">{ganzhi.solar_term}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/50">—</p>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            更新时间：{ganzhi.update_time.split(' ')[1].slice(0, 5)}
          </p>
        </GlassCard>
      )}

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
        </>
      )}

      {/* 3. 关注股票 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">关注股票</h3>
            <span className="text-[11px] text-muted-foreground/50">
              {mode === "premarket" ? "仅美港股（A股未开盘）" : "仅A股"}
            </span>
          </div>
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

      {/* 仅显示关注股票时跳过后续区块 */}
      {!showOnlyWatchlist && (
        <>
      {/* 4. 行业板块融资净买入/卖出前 10 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Wallet className="h-4 w-4" /> 融资排名（行业 + 个股）
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

        {/* 行业融资排名 */}
        <h4 className="mb-2 text-xs font-semibold text-muted-foreground/70">行业板块 Top10</h4>
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

        {/* 6. 个股融资净买入/卖出前 10 */}
        <h4 className="mb-2 mt-6 text-xs font-semibold text-muted-foreground/70">个股 Top10</h4>
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
        </>
      )}
    </div>
  );
}
