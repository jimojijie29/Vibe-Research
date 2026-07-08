import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Loader2, AlertCircle, Gauge, ArrowDownUp, TrendingUp, TrendingDown, Flame, BarChart3 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { SaveNoteButton } from "@/components/ui/SaveNoteButton";
import { MorningView } from "@/pages/MorningView";
import { api, ApiError, type IndexQuote, type MarketOverview, type ShortTermEmotion, type TurnoverTop } from "@/lib/api";
import { hasLlm, chatStream } from "@/lib/llm";
import { cn, pctColor, fmt, yi } from "@/lib/utils";

type Tab = "morning" | "review";

export function DailyReview() {
  const [tab, setTab] = useState<Tab>("morning");
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [review, setReview] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [needConfig, setNeedConfig] = useState(false);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [emotion, setEmotion] = useState<ShortTermEmotion | null>(null);
  const [turnover, setTurnover] = useState<TurnoverTop | null>(null);

  const [ovDone, setOvDone] = useState(false);
  const [emoDone, setEmoDone] = useState(false);
  const [toDone, setToDone] = useState(false);

  const loadReviewData = () => {
    api.indices().then(setIndices).catch(() => {});
    api.marketOverview().then(setOverview).catch(() => {}).finally(() => setOvDone(true));
    api.emotion().then(setEmotion).catch(() => {}).finally(() => setEmoDone(true));
    api.turnoverTop().then(setTurnover).catch(() => {}).finally(() => setToDone(true));
  };

  useEffect(() => {
    loadReviewData();
  }, []);

  const pending = (done: boolean) => (
    <p className="py-4 text-center text-sm text-muted-foreground/60">
      {done ? "暂无数据：可能是非交易时段或数据源暂时不可用，可点「刷新」重试" : "加载中…"}
    </p>
  );

  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });

  const dataSummary = indices.length
    ? indices.map((i) => `${i.name} ${i.price}（${i.change_pct > 0 ? "+" : ""}${i.change_pct}%）`).join("；")
    : "（指数数据未取到）";

  const runReview = async () => {
    setReviewErr(null);
    setNeedConfig(false);
    if (!hasLlm()) { setNeedConfig(true); return; }
    setReviewLoading(true);
    setReview("");
    const prompt =
      `以下是今天 A 股大盘的客观数据：\n${dataSummary}\n\n` +
      "请用中文做一段当天大盘复盘：整体涨跌、主要指数表现、盘面值得注意的点。" +
      "只做客观陈述与多视角分析，不预测涨跌、不推荐任何标的、不构成投资建议。";
    try {
      await chatStream([{ role: "user", content: prompt }], `今日大盘数据：${dataSummary}`, {
        onDelta: (t) => setReview((r) => r + t),
      });
    } catch (e) {
      setReviewErr(e instanceof ApiError ? e.message : "复盘失败");
    } finally {
      setReviewLoading(false);
    }
  };

  const sentiment = overview?.sentiment;
  const sectors = overview?.sectors || [];
  const sentCells = sentiment ? [
    { k: "上涨家数", v: sentiment.up, up: true },
    { k: "下跌家数", v: sentiment.down, up: false },
    { k: "平盘", v: sentiment.flat, up: null },
    { k: "涨停", v: sentiment.zt, up: true },
    { k: "真实涨停", v: sentiment.zt_real, up: true },
    { k: "跌停", v: sentiment.dt, up: false },
    { k: "真实跌停", v: sentiment.dt_real, up: false },
    { k: "活跃度", v: sentiment.active, up: null },
  ] : [];

  return (
    <div>
      <PageHeader
        title="每日复盘"
        subtitle={`${today} · 9 点看盘 / AI 复盘 一键切换`}
        actions={
          <div className="flex items-center gap-2">
            <AskAiButton
              context={`今日大盘数据：${dataSummary}`}
              label="问 AI"
              suggestions={["今天大盘怎么走", "哪些指数领涨领跌", "盘面有什么值得注意"]}
            />
          </div>
        }
      />

      {/* Tab 切换 */}
      <div className="mb-6 inline-flex rounded-lg border border-border bg-muted/30 p-1">
        {[
          { key: "morning", label: "9 点看盘" },
          { key: "review", label: "AI 复盘" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "morning" && <MorningView />}

      {tab === "review" && (
        <div className="space-y-6">
          {/* AI 当日复盘 */}
          <GlassCard glow>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> AI 当日复盘
              </h3>
              <button
                onClick={runReview}
                disabled={reviewLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50"
              >
                {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {review ? "重新复盘" : "让 AI 复盘今天"}
              </button>
            </div>
            {needConfig && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                还没接入 AI。<Link to="/settings" className="text-primary">先去接入你的 AI</Link>，之后一键出复盘。
              </div>
            )}
            {reviewErr && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {reviewErr}
              </div>
            )}
            {review ? (
              <>
                <div className="prose prose-sm prose-invert mt-4 max-w-none text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{review}</ReactMarkdown>
                </div>
                {!reviewLoading && (
                  <div className="mt-3">
                    <SaveNoteButton kind="复盘" title={`每日复盘 ${today}`} content={review} />
                  </div>
                )}
              </>
            ) : !needConfig && !reviewErr && !reviewLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">
                点上方按钮，系统把当天客观数据打包给你的 AI，由它生成复盘。
                <b className="text-foreground">分析是它给的，我们只负责喂数据。</b>
              </p>
            ) : null}
          </GlassCard>

          {/* 市场情绪 */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Gauge className="h-4 w-4" /> 市场情绪
              </h3>
              {sentiment?.date && <span className="text-[11px] text-muted-foreground/50">{sentiment.date}</span>}
            </div>
            <GlassCard>
              {!sentiment?.breadth ? (
                pending(ovDone)
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { k: "大盘宽度", v: sentiment.breadth, hint: "冰点 / 偏弱 / 中性 / 偏强 / 普涨" },
                      { k: "题材投机", v: sentiment.speculation, hint: "冰点 / 普通 / 活跃 / 亢奋" },
                    ].map((m) => (
                      <div key={m.k} className="rounded-lg bg-muted/25 p-4">
                        <p className="text-xs text-muted-foreground">{m.k}</p>
                        <p className="mt-1 text-2xl font-bold text-primary">{m.v}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground/60">{m.hint}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {sentCells.map((c) => (
                      <div key={c.k} className="rounded-lg bg-muted/20 p-2 text-center">
                        <p className="truncate text-[11px] text-muted-foreground">{c.k}</p>
                        <p
                          className={cn(
                            "mt-0.5 font-mono text-sm font-bold",
                            c.up === null ? "text-foreground" : c.up ? "text-danger" : "text-success"
                          )}
                        >
                          {c.v}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </GlassCard>
          </section>

          {/* 短线情绪 */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Flame className="h-4 w-4" /> 短线情绪
              </h3>
              <span className="text-[11px] text-muted-foreground/50">连板股 · 打板情绪 · 客观公开榜单</span>
              {emotion?.date && <span className="ml-auto text-[11px] text-muted-foreground/50">{emotion.date}</span>}
            </div>
            <GlassCard>
              {!emotion || emotion.zt_count === undefined ? (
                pending(emoDone)
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { k: "涨停", v: `${emotion.zt_count}`, cls: "text-danger" },
                      { k: "跌停", v: `${emotion.dt_count}`, cls: "text-success" },
                      { k: "最高连板", v: `${emotion.max_boards} 板`, cls: "text-primary" },
                      { k: "连板（2板+）", v: `${emotion.lianban_count} 家`, cls: "text-primary" },
                    ].map((c) => (
                      <div key={c.k} className="rounded-lg bg-muted/25 p-3 text-center">
                        <p className="text-[11px] text-muted-foreground">{c.k}</p>
                        <p className={cn("mt-0.5 font-mono text-xl font-bold", c.cls)}>{c.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      { k: "封板率", v: emotion.seal_rate, hint: "封住 / 尝试涨停", strong: true },
                      { k: "炸板率", v: emotion.break_rate, hint: "炸板 / 尝试涨停", strong: false },
                      { k: "晋级率", v: emotion.promotion_rate, hint: "昨涨停今又停", strong: true },
                    ].map((c) => (
                      <div key={c.k} className="rounded-lg bg-muted/20 p-2.5 text-center">
                        <p className="text-[11px] text-muted-foreground">{c.k}</p>
                        <p className={cn("mt-0.5 font-mono text-sm font-bold", c.strong ? "text-danger" : "text-success")}>
                          {c.v == null ? "—" : `${(c.v * 100).toFixed(1)}%`}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground/50">{c.hint}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">连板股（2 板以上连续涨停）· 客观公开榜单，非推荐 / 非预测</p>
                    {emotion.lianban_stocks.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50">今日无 2 板以上个股</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                              {["名称", "连板", "现价", "涨停%", "成交额", "流通市值", "概念"].map((h) => (
                                <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {emotion.lianban_stocks.map((s) => (
                              <tr key={s.code} className="border-b border-border/30">
                                <td className="px-2 py-2">
                                  <span className="font-medium">{s.name}</span>{" "}
                                  <span className="text-xs text-muted-foreground/50">{s.code}</span>
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 font-mono font-bold text-primary">
                                  {s.boards} 板
                                </td>
                                <td className="px-2 py-2 font-mono">{s.price}</td>
                                <td className="px-2 py-2 font-mono text-danger">+{s.pct}%</td>
                                <td className="whitespace-nowrap px-2 py-2 font-mono text-muted-foreground">{yi(s.amount)}</td>
                                <td className="whitespace-nowrap px-2 py-2 font-mono text-muted-foreground">{yi(s.float_cap)}</td>
                                <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{s.industry}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </GlassCard>
          </section>

          {/* 成交额 TOP20 */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <BarChart3 className="h-4 w-4" /> 全市场成交额 TOP20
              </h3>
              <span className="text-[11px] text-muted-foreground/50">客观公开榜单，非推荐 / 非预测 / 不构成投资建议</span>
              {turnover?.updated && <span className="ml-auto text-[11px] text-muted-foreground/50">{turnover.updated}</span>}
            </div>
            <GlassCard>
              {!turnover || turnover.stocks.length === 0 ? (
                pending(toDone)
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                        {["#", "名称", "现价", "涨跌%", "成交额", "总市值", "行业"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {turnover.stocks.map((s, i) => (
                        <tr key={s.code} className="border-b border-border/30">
                          <td className="px-2 py-2 font-mono text-xs text-muted-foreground/50">{i + 1}</td>
                          <td className="px-2 py-2">
                            <span className="font-medium">{s.name}</span>{" "}
                            <span className="text-xs text-muted-foreground/50">{s.code}</span>
                          </td>
                          <td className="px-2 py-2 font-mono">{s.price ?? "—"}</td>
                          <td className={cn("px-2 py-2 font-mono", s.pct == null ? "text-muted-foreground" : pctColor(s.pct))}>
                            {s.pct == null ? "—" : `${s.pct > 0 ? "+" : ""}${s.pct}%`}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-mono">{yi(s.amount)}</td>
                          <td className="whitespace-nowrap px-2 py-2 font-mono text-muted-foreground">{yi(s.mcap)}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{s.industry}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </section>

          {/* 板块资金 */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <TrendingUp className="h-4 w-4" /> 板块资金趋势榜
              </h3>
              <span className="text-[11px] text-muted-foreground/50">行业 · 按今日净流入排序</span>
            </div>
            <GlassCard className="mb-6">
              {sectors.length === 0 ? (
                pending(ovDone)
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                        {["行业", "涨跌%", "今日净流入", "流入", "流出", "家数"].map((h) => (
                          <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sectors.slice(0, 15).map((s) => (
                        <tr key={s.name} className="border-b border-border/30">
                          <td className="px-2 py-2 font-medium">{s.name}</td>
                          <td className={cn("px-2 py-2 font-mono", pctColor(s.pct))}>
                            {s.pct > 0 ? "+" : ""}
                            {s.pct}%
                          </td>
                          <td className={cn("px-2 py-2 font-mono", pctColor(s.net))}>
                            {s.net > 0 ? "+" : ""}
                            {fmt(s.net)} 亿
                          </td>
                          <td className="px-2 py-2 font-mono text-muted-foreground">{fmt(s.inflow)}</td>
                          <td className="px-2 py-2 font-mono text-muted-foreground">{fmt(s.outflow)}</td>
                          <td className="px-2 py-2 font-mono text-muted-foreground">{s.firms}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </section>

          {/* 资金轮动 */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <ArrowDownUp className="h-4 w-4" /> 资金轮动
              </h3>
              <span className="text-[11px] text-muted-foreground/50">板块级净流入 / 流出</span>
            </div>
            <div className="mb-2 grid gap-4 md:grid-cols-2">
              {[
                { title: "流入 Top", icon: TrendingUp, color: "text-danger", rows: sectors.slice(0, 6) },
                { title: "流出 Top", icon: TrendingDown, color: "text-success", rows: [...sectors].slice(-6).reverse() },
              ].map((col) => (
                <GlassCard key={col.title}>
                  <h4 className={cn("mb-3 flex items-center gap-1.5 text-sm font-semibold", col.color)}>
                    <col.icon className="h-4 w-4" /> {col.title}
                  </h4>
                  {col.rows.length === 0 ? (
                    pending(ovDone)
                  ) : (
                    <div className="space-y-1.5">
                      {col.rows.map((s, i) => (
                        <div
                          key={s.name}
                          className="flex items-center gap-3 border-b border-border/30 pb-1.5 text-sm last:border-0"
                        >
                          <span className="w-5 text-xs text-muted-foreground/50">{i + 1}</span>
                          <span className="flex-1 truncate">{s.name}</span>
                          <span className={cn("font-mono text-xs", pctColor(s.pct))}>
                            {s.pct > 0 ? "+" : ""}
                            {s.pct}%
                          </span>
                          <span className={cn("w-20 text-right font-mono text-xs", pctColor(s.net))}>
                            {s.net > 0 ? "+" : ""}
                            {fmt(s.net)} 亿
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          </section>

          <Disclaimer />
        </div>
      )}
    </div>
  );
}
