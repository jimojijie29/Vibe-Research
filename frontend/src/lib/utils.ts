import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// A股红涨绿跌。全球市场（美股/港股指数）**也沿用红涨**——与整个看板及东财等中国平台一致。
export const pctColor = (p: number) =>
  p > 0 ? "text-danger" : p < 0 ? "text-success" : "text-muted-foreground";
export const fmt = (v: number) =>
  v.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
export const yi = (v: number | null) =>
  v == null ? "—" : `${fmt(v / 1e8)} 亿`; // 元 → 亿
