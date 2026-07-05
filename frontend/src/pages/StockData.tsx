import { useRef, useState } from "react";
import {
  Search, FileText, Newspaper, Loader2, AlertCircle, LineChart, BarChart3, Megaphone,
  Wallet, Trophy, CalendarClock, Boxes, MessageSquare,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { EarningsSnapshot } from "@/components/ui/EarningsSnapshot";
import { Disclaimer } from "@/components/ui/Disclaimer";
import {
  api, ApiError, type Valuation, type Report, type NewsItem, type ValPercentile, type ValMetric,
  type Financials, type Announcement, type MarginRow, type BlockTradeRow, type HolderRow,
  type DividendRow, type FundFlowRow, type DragonTiger, type Lockup, type Blocks, type HotConcept, type QaRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// 金额格式化（后端资金单位：元 / 万元）
const yi = (v: number) => `${(v / 1e8).toFixed(2)} 亿`;

const fmt = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined ? "—" : `${v}${suffix}`;

// 百分比：后端偶发给 null/缺字段时显示 —，不出现 "NaN%" / 误导性 "0.00%"
const pct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(2)}%`;

// 小指标块（复用于资金面/筹码卡）
function Metric({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="mt-0.5 font-mono text-base font-bold">{v}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// 估值历史分位带（理杏仁式）：绿=低估区 / 灰=合理区 / 红=高估区；只给位置，不划买卖。
function ValBand({ label, m }: { label: string; m: ValMetric }) {
  const span = Math.max(m.max - m.min, 1e-6);
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - m.min) / span) * 100));
  const p20 = pos(m.p20), p80 = pos(m.p80), cur = pos(m.current);
  const zoneColor = m.percentile < 20 ? "text-success" : m.percentile > 80 ? "text-danger" : "text-muted-foreground";
  const zoneLabel = m.percentile < 20 ? "低估区" : m.percentile > 80 ? "高估区" : "合理区";
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1 text-sm">
        <span className="font-medium">{label} <span className="text-xs text-muted-foreground/60">{m.n} 点</span></span>
        <span className="text-muted-foreground">当前 <b className="font-mono text-foreground">{m.current}</b> · 近5年 <b className={cn("font-mono", zoneColor)}>{m.percentile}%</b> 分位（<span className={zoneColor}>{zoneLabel}</span>）</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <div className="bg-success/35" style={{ width: `${p20}%` }} />
          <div className="bg-muted" style={{ width: `${p80 - p20}%` }} />
          <div className="flex-1 bg-danger/35" />
        </div>
        <div className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-foreground shadow" style={{ left: `${cur}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground/60">
        <span>低 {m.min}</span><span>20% {m.p20}</span><span>中 {m.p50}</span><span>80% {m.p80}</span><span>高 {m.max}</span>
      </div>
    </div>
  );
}

export function StockData() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [val, setVal] = useState<Valuation | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [pctl, setPctl] = useState<ValPercentile | null>(null);
  const [fin, setFin] = useState<Financials | null>(null);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [depNote, setDepNote] = useState<string | null>(null);
  // 资金面 / 筹码 / 信号（v3.3 并入）
  const [margin, setMargin] = useState<MarginRow[]>([]);
  const [blockT, setBlockT] = useState<BlockTradeRow[]>([]);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [dividend, setDividend] = useState<DividendRow[]>([]);
  const [fundFlow, setFundFlow] = useState<FundFlowRow[]>([]);
  const [dt, setDt] = useState<DragonTiger | null>(null);
  const [lockup, setLockup] = useState<Lockup | null>(null);
  const [blocks, setBlocks] = useState<Blocks | null>(null);
  const [hotCon, setHotCon] = useState<HotConcept[]>([]);
  const [qa, setQa] = useState<QaRow[]>([]);
  const runIdRef = useRef(0);

  const run = async () => {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) { setErr("请输入 6 位股票代码"); return; }
    // 竞态守卫：快速换代码再查时，只让最新一次查询回填页面——
    // 否则前一只股的慢响应会覆盖后一只股已显示的数据（东财串行限流下常见）
    const rid = ++runIdRef.current;
    const ok = <T,>(set: (v: T) => void) => (v: T) => { if (rid === runIdRef.current) set(v); };
    setLoading(true); setErr(null); setDepNote(null); setVal(null); setReports([]); setNews([]); setPctl(null); setFin(null); setAnns([]);
    setMargin([]); setBlockT([]); setHolders([]); setDividend([]); setFundFlow([]); setDt(null); setLockup(null); setBlocks(null); setHotCon([]); setQa([]);
    // 资金面/筹码/信号：独立回填、不阻塞主数据（后端对东财串行限流，卡片依次填入）
    api.margin(c).then(ok(setMargin)).catch(() => {});
    api.blockTrade(c).then(ok(setBlockT)).catch(() => {});
    api.holders(c).then(ok(setHolders)).catch(() => {});
    api.dividend(c).then(ok(setDividend)).catch(() => {});
    api.fundFlow(c).then(ok(setFundFlow)).catch(() => {});
    api.dragonTiger(c).then(ok(setDt)).catch(() => {});
    api.lockup(c).then(ok(setLockup)).catch(() => {});
    api.blocks(c).then(ok(setBlocks)).catch(() => {});
    api.hotConcepts(c).then(ok(setHotCon)).catch(() => {});
    api.investorQa(c).then(ok(setQa)).catch(() => {});
    try {
      // 行情+估值+研报+历史分位+财务+公告（新闻单独降级）
      const [v, r, p, f, a] = await Promise.all([
        api.valuation(c),
        api.reports(c).catch(() => []),
        api.percentile(c).catch(() => null),
        api.financials(c).catch(() => null),
        api.announcements(c).catch(() => []),
      ]);
      if (rid !== runIdRef.current) return;
      setVal(v);
      setReports(r);
      setPctl(p);
      setFin(f);
      setAnns(a);
      try {
        const n = await api.news(c);
        if (rid === runIdRef.current) setNews(n);
      } catch (e) {
        if (rid === runIdRef.current && e instanceof ApiError && e.status === 501) setDepNote(e.message);
      }
    } catch (e) {
      if (rid !== runIdRef.current) return;
      setErr(e instanceof ApiError ? e.message : "查询失败");
    } finally {
      if (rid === runIdRef.current) setLoading(false);
    }
  };

  const metrics = val ? [
    { k: "现价", v: fmt(val.price) },
    { k: "PE(TTM)", v: fmt(val.pe_ttm) },
    { k: "PB", v: fmt(val.pb) },
    { k: "总市值", v: fmt(val.mcap_yi, " 亿") },
    { k: "26E EPS", v: fmt(val.eps_26e) },
    { k: "前向PE", v: fmt(val.pe_26e) },
    { k: "PEG", v: fmt(val.peg) },
    { k: "消化年数", v: fmt(val.digest_years, " 年") },
  ] : [];

  const aiContext = val
    ? `个股：${val.name}（${val.code}）\n现价 ${val.price} · PE(TTM) ${val.pe_ttm} · PB ${val.pb} · 市值 ${val.mcap_yi}亿\n` +
      `26E EPS ${val.eps_26e ?? "—"} · 前向PE ${val.pe_26e ?? "—"} · PEG ${val.peg ?? "—"} · 消化 ${val.digest_years ?? "—"}年 · 机构覆盖 ${val.analyst_count} 家\n` +
      (pctl?.metrics.pe_ttm ? `估值历史分位(近5年)：PE-TTM 处于 ${pctl.metrics.pe_ttm.percentile}% 分位、PB 处于 ${pctl.metrics.pb?.percentile ?? "—"}% 分位\n` : "") +
      (fin?.revenue ? `财务(${fin.period ?? "—"})：营收 ${fin.revenue}(同比${fin.revenue_yoy ?? "—"})、净利 ${fin.net_profit ?? "—"}(同比${fin.net_profit_yoy ?? "—"})、ROE ${fin.roe ?? "—"}、毛利率 ${fin.gross_margin ?? "—"}\n` : "") +
      (anns.length ? `近期公告：${anns.slice(0, 5).map((a) => a.title.replace(/^[^:：]*[:：]/, "")).join("；")}\n` : "") +
      `近期研报：${reports.slice(0, 5).map((r) => r.title).join("；") || "无"}`
    : "还没查询个股。输入 6 位代码后可让 AI 基于客观数据帮你分析。";

  return (
    <div>
      <PageHeader
        title="个股数据"
        subtitle="行情 · 估值 · 研报 · 新闻 —— 客观数据配齐，判断交给你的 AI"
        actions={val && (
          <AskAiButton
            context={aiContext}
            label="让 AI 读这些数据"
            suggestions={["这个估值贵不贵", "机构一致预期怎么看", "近期研报的分歧点", "有什么风险"]}
          />
        )}
      />

      {/* 查询框 */}
      <div className="mb-5 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="输入 6 位股票代码，回车查询"
          className="w-56 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          查询
        </button>
      </div>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}

      {val && (
        <>
          <GlassCard glow className="mb-4">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-xl font-bold">{val.name}</h2>
              <span className="font-mono text-sm text-muted-foreground">{val.code}</span>
              {val.analyst_count > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">机构覆盖 {val.analyst_count} 家</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.k} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{m.k}</p>
                  <p className="mt-0.5 font-mono text-lg font-bold">{m.v}</p>
                </div>
              ))}
            </div>
            {val.forecast_note && (
              <p className="mt-3 text-xs text-warning">{val.forecast_note}</p>
            )}
          </GlassCard>

          {/* 财报速览（结论先行摘要，借鉴 equity-research 的结构纪律，剔除评级/目标价） */}
          <EarningsSnapshot val={val} fin={fin} pctl={pctl} />

          {pctl && (pctl.metrics.pe_ttm || pctl.metrics.pb) && (
            <GlassCard glow className="mb-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><LineChart className="h-4 w-4 text-primary" /> 估值历史分位 · {pctl.period}</h3>
              <p className="mb-4 text-[11px] text-muted-foreground/60">绿=低估区 / 灰=合理区 / 红=高估区。只显示当前处于历史什么位置，不构成买卖建议。</p>
              <div className="space-y-4">
                {pctl.metrics.pe_ttm && <ValBand label="PE-TTM" m={pctl.metrics.pe_ttm} />}
                {pctl.metrics.pb && <ValBand label="市净率 PB" m={pctl.metrics.pb} />}
              </div>
            </GlassCard>
          )}

          {fin && (fin.revenue || fin.roe) && (
            <GlassCard className="mb-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" /> 财务关键指标{fin.period && <span className="text-xs font-normal text-muted-foreground/60">· {fin.period}</span>}</h3>
              <p className="mb-3 text-[11px] text-muted-foreground/60">同花顺财务摘要,最新报告期。</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "营业总收入", v: fin.revenue, yoy: fin.revenue_yoy },
                  { k: "归母净利润", v: fin.net_profit, yoy: fin.net_profit_yoy },
                  { k: "每股收益", v: fin.eps },
                  { k: "ROE", v: fin.roe },
                  { k: "销售毛利率", v: fin.gross_margin },
                  { k: "销售净利率", v: fin.net_margin },
                  { k: "每股净资产", v: fin.bvps },
                  { k: "每股经营现金流", v: fin.op_cf_ps },
                ].map((m) => (
                  <div key={m.k} className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{m.k}</p>
                    <p className="mt-0.5 font-mono text-base font-bold">{m.v ?? "—"}</p>
                    {m.yoy && <p className="text-[11px] text-muted-foreground">同比 {m.yoy}</p>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {reports.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" /> 近期研报（{reports.length}）</h3>
              <div className="space-y-2">
                {reports.slice(0, 12).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{(r.publishDate || "").slice(0, 10)}</span>
                    <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{r.orgSName}</span>
                    {r.pdfUrl ? (
                      <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="flex-1 truncate hover:text-primary">{r.title}</a>
                    ) : (
                      <span className="flex-1 truncate">{r.title}</span>
                    )}
                    {r.emRatingName && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{r.emRatingName}</span>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {anns.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Megaphone className="h-4 w-4 text-primary" /> 近期公告（{anns.length}）</h3>
              <div className="space-y-2">
                {anns.slice(0, 12).map((a, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{a.date}</span>
                    {a.type && <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{a.type}</span>}
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:text-primary">{a.title.replace(/^[^:：]*[:：]/, "")}</a>
                    ) : (
                      <span className="flex-1 truncate">{a.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Newspaper className="h-4 w-4 text-primary" /> 个股新闻</h3>
            {depNote ? (
              <p className="text-xs text-warning">{depNote}（安装后新闻/公告即可用）</p>
            ) : news.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">暂无新闻</p>
            ) : (
              <div className="space-y-2">
                {news.slice(0, 10).map((n, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{(n.发布时间 || "").slice(0, 16)}</span>
                    {n.新闻链接 ? (
                      <a href={n.新闻链接} target="_blank" rel="noreferrer" className="flex-1 truncate hover:text-primary">{n.新闻标题}</a>
                    ) : (
                      <span className="flex-1 truncate">{n.新闻标题}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* 资金面 · 筹码（融资融券 / 股东户数 / 主力资金流 / 分红 / 大宗交易） */}
          {(margin.length > 0 || holders.length > 0 || fundFlow.length > 0 || dividend.length > 0) && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" /> 资金面 · 筹码</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {margin[0] && <Metric k="融资余额" v={yi(margin[0].rzye)} sub={margin[0].date} />}
                {margin[0] && <Metric k="融券余额" v={yi(margin[0].rqye)} />}
                {holders[0] && <Metric k="股东户数" v={Number(holders[0].holder_num).toLocaleString()} sub={`环比 ${pct(holders[0].change_ratio)}`} />}
                {fundFlow.length > 0 && <Metric k="近20日主力净流入" v={yi(fundFlow.slice(-20).reduce((s, r) => s + r.main_net, 0))} />}
                {dividend[0] && <Metric k="最近派息(每10股)" v={`${dividend[0].bonus_rmb} 元`} sub={dividend[0].date} />}
              </div>
              {blockT.length > 0 && (
                <div className="mt-3 border-t border-border/40 pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">近期大宗交易（{blockT.length}）</p>
                  <div className="space-y-1.5">
                    {blockT.slice(0, 5).map((b, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <span className="w-20 shrink-0 font-mono text-muted-foreground">{b.date}</span>
                        <span className="w-14 shrink-0">{b.price} 元</span>
                        <span className={cn("w-20 shrink-0", b.premium_pct >= 0 ? "text-danger" : "text-success")}>折溢 {b.premium_pct}%</span>
                        <span className="flex-1 truncate text-muted-foreground">买 {b.buyer} · 卖 {b.seller}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground/60">资金/筹码为公开客观数据，仅供了解该股当前状态，不构成任何买卖建议。</p>
            </GlassCard>
          )}

          {/* 龙虎榜 */}
          {dt && dt.records.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> 龙虎榜（近30日 {dt.records.length} 次）</h3>
              <div className="space-y-2">
                {dt.records.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{r.date}</span>
                    <span className="flex-1 truncate">{r.reason}</span>
                    <span className={cn("shrink-0 font-mono text-xs", r.net_buy >= 0 ? "text-danger" : "text-success")}>净买 {r.net_buy} 万</span>
                  </div>
                ))}
              </div>
              {(dt.seats.buy.length > 0 || dt.seats.sell.length > 0) && (
                <div className="mt-3 grid gap-4 border-t border-border/40 pt-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-danger">买入席位 TOP</p>
                    {dt.seats.buy.map((s, i) => (
                      <div key={i} className="flex justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{s.name}</span><span className="shrink-0 font-mono">净{s.net}万</span></div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-success">卖出席位 TOP</p>
                    {dt.seats.sell.map((s, i) => (
                      <div key={i} className="flex justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{s.name}</span><span className="shrink-0 font-mono">净{s.net}万</span></div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* 限售解禁 */}
          {lockup && (lockup.upcoming.length > 0 || lockup.history.length > 0) && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> 限售解禁</h3>
              {lockup.upcoming.length > 0 ? (
                <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="mb-1.5 text-xs font-medium text-warning">未来 90 天待解禁（{lockup.upcoming.length}）</p>
                  {lockup.upcoming.slice(0, 4).map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs"><span className="w-20 shrink-0 font-mono text-muted-foreground">{h.date}</span><span className="flex-1 truncate">{h.type}</span><span className="shrink-0 text-muted-foreground">占比 {pct(h.ratio)}</span></div>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-xs text-muted-foreground/70">未来 90 天无待解禁。</p>
              )}
              {lockup.history.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">历史解禁（近 {Math.min(lockup.history.length, 5)}）</p>
                  {lockup.history.slice(0, 5).map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs"><span className="w-20 shrink-0 font-mono text-muted-foreground">{h.date}</span><span className="flex-1 truncate text-muted-foreground">{h.type}</span></div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* 板块归属 · 概念 */}
          {((blocks && blocks.concept_tags.length > 0) || hotCon.length > 0) && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Boxes className="h-4 w-4 text-primary" /> 板块归属 · 概念</h3>
              {blocks && blocks.concept_tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {blocks.concept_tags.slice(0, 24).map((t, i) => (
                    <span key={i} className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">{t}</span>
                  ))}
                </div>
              )}
              {hotCon.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">当下热门概念命中</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hotCon.slice(0, 12).map((h, i) => (
                      <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{h.concept}</span>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* 投资者互动（互动易） */}
          {qa.filter((q) => q.answer).length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-primary" /> 投资者互动（互动易）</h3>
              <div className="space-y-3">
                {qa.filter((q) => q.answer).slice(0, 5).map((q, i) => (
                  <div key={i} className="border-b border-border/40 pb-3 text-sm last:border-0">
                    <p className="text-muted-foreground"><span className="mr-1.5 rounded bg-muted/50 px-1.5 py-0.5 text-[10px]">问</span>{q.question}</p>
                    <p className="mt-1"><span className="mr-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">答</span>{q.answer}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">{q.ask_time}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}

      {!val && !err && !loading && (
        <GlassCard>
          <div className="py-10 text-center text-sm text-muted-foreground">
            输入一个 6 位股票代码，拉取它的行情、估值、研报与新闻。<br />
            <span className="text-xs text-muted-foreground/60">数据来自公开源（腾讯行情 / 东财研报 / akshare）；Vibe-Research 不预置任何标的、不做推荐。</span>
          </div>
        </GlassCard>
      )}

      <Disclaimer />
    </div>
  );
}
