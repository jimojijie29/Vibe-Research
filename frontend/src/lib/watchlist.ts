// 关注股票（自选股）—— 只存本地 localStorage，不上传、不进仓库。
// 支持 A 股 6 位代码 + 美股/港股/韩股等全球代码（如 AAPL / BABA / 00700 / 005930.KS）。
// 行情复用 /api/quote（A股）与 /api/global/quotes（全球）；复盘时把关注股行情一并喂给用户自己的 AI。

const KEY = "vr-watchlist";

// A 股：6 位数字。全球：1-16 位字母/数字/点，至少含一个字母或点（区分于 A 股纯 6 位数字）。
const A_SHARE_RE = /^\d{6}$/;
const GLOBAL_RE = /^[A-Z0-9.]{1,16}$/i;

export function isAShare(code: string): boolean {
  return A_SHARE_RE.test(code);
}

export function isGlobal(code: string): boolean {
  return !isAShare(code) && GLOBAL_RE.test(code);
}

export function loadWatch(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((c) => isAShare(c) || isGlobal(c)) : [];
  } catch {
    return [];
  }
}

export function saveWatch(codes: string[]) {
  localStorage.setItem(KEY, JSON.stringify(codes));
}

// 从任意文本里抽取自选股代码：
// - 6 位连续数字视为 A 股
// - 字母数字组合（如 AAPL、BABA、00700、005930.KS）视为全球代码
// 支持逗号 / 空格 / 换行 / 顿号分隔，方便一次粘贴一串。
export function parseCodes(raw: string): string[] {
  const tokens = raw.split(/[,，\s、]+/).filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const u = t.toUpperCase().trim();
    if (isAShare(u) || isGlobal(u)) out.push(u);
  }
  return Array.from(new Set(out));
}

// 把用户输入的一串代码并入已有自选，返回去重后的新列表 + 实际新增数量。
export function addCodes(existing: string[], raw: string): { next: string[]; added: number } {
  const incoming = parseCodes(raw).filter((c) => !existing.includes(c));
  return { next: [...existing, ...incoming], added: incoming.length };
}
