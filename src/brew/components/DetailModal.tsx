import React, { useState, useEffect } from 'react';
import { Token, Language } from '../types.ts';
import { I18N } from '../i18n.ts';
import { formatUsd, formatPct, truncateAddr, copyToClipboard } from '../utils/format.ts';
import { TokenAvatar } from './TokenAvatar.tsx';
import { TradingViewChart } from './TradingViewChart.tsx';
import { X, Copy, ExternalLink, Sparkles, TrendingUp, ArrowUpRight, ArrowDownRight, Activity, Star } from 'lucide-react';

interface DetailModalProps {
  token: Token | null;
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onTrade: (token: Token) => void;
  onSelectAnotherToken: (token: Token) => void;
  allTokens: Token[];
  onShowToast: (msg: string) => void;
  watchlist?: string[];
  onToggleWatchlist?: (tokenAddress: string) => void;
  onSetFavoriteToken?: (token: Token) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  token,
  isOpen,
  onClose,
  lang,
  onTrade,
  onSelectAnotherToken,
  allTokens,
  onShowToast,
  watchlist: _watchlist = [],
  onToggleWatchlist: _onToggleWatchlist,
  onSetFavoriteToken,
}) => {
  const dict = I18N[lang] || I18N.en;
  const [simCapital, setSimCapital] = useState<number>(50);
  const [liveSecurity, setLiveSecurity] = useState<any>(null);
  const [livePair, setLivePair] = useState<any>(null);
  const [liveChanges, setLiveChanges] = useState<{ m5: number | null; h1: number | null; h6: number | null; h24: number | null } | null>(null);
  const [liveTxns, setLiveTxns] = useState<any>(null);
  const [livePool, setLivePool] = useState<string>('');
  const [activeTimeframe, setActiveTimeframe] = useState<'5m' | '1h' | '6h' | '24h'>('24h');
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  const fetchLiveDetails = async () => {
    if (!token) return;
    setIsLoadingLive(true);
    try {
      const url = `/api/inspect?address=${encodeURIComponent(token.address)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.pair) setLivePair(data.pair);
        if (data.security) setLiveSecurity(data.security);
        if (data.changes) setLiveChanges(data.changes);
        if (data.transactions) setLiveTxns(data.transactions);
        if (data.poolAddress) setLivePool(data.poolAddress);
      }
    } catch (err) {
      console.error('Live fetch error:', err);
    } finally {
      setIsLoadingLive(false);
    }
  };

  useEffect(() => {
    if (!token || !isOpen) return;
    setLiveSecurity(null);
    setLivePair(null);
    setLiveChanges(null);
    setLiveTxns(null);
    setLivePool('');
    fetchLiveDetails();
  }, [token?.address, isOpen]);

  if (!isOpen || !token) return null;

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) onShowToast(`${label} copied!`);
  };

  // Live or fallback metrics
  const price = livePair ? parseFloat(livePair.priceUsd) || token.priceUsd : token.priceUsd;
  const priceChange = livePair?.priceChange?.h24 != null ? Number(livePair.priceChange.h24) : token.priceChange24h;
  const marketCap = livePair ? Number(livePair.marketCap || livePair.fdv || token.marketCap) : token.marketCap;
  const volume24h = livePair?.volume?.h24 != null ? Number(livePair.volume.h24) : token.volume24h;
  const liquidity = livePair?.liquidity?.usd != null ? Number(livePair.liquidity.usd) : token.liquidityUsd;
  const buys = livePair?.txns?.h24?.buys ?? token.buys24h;
  const sells = livePair?.txns?.h24?.sells ?? token.sells24h;
  const totalTx = buys + sells;
  const buyPct = totalTx > 0 ? Math.round((buys / totalTx) * 100) : 50;
  const sellPct = 100 - buyPct;

  // Multi-timeframe price changes (5M, 1H, 6H, 24H)
  const chg5m = liveChanges?.m5 ?? token.priceChange5m ?? livePair?.priceChange?.m5 ?? null;
  const chg1h = liveChanges?.h1 ?? token.priceChange1h ?? livePair?.priceChange?.h1 ?? null;
  const chg6h = liveChanges?.h6 ?? token.priceChange6h ?? livePair?.priceChange?.h6 ?? null;
  const chg24h = liveChanges?.h24 ?? priceChange ?? null;

  // Multi-timeframe transactions (buys & sells)
  const tx5m = liveTxns?.m5 ?? { buys: token.buys5m ?? 0, sells: token.sells5m ?? 0 };
  const tx1h = liveTxns?.h1 ?? { buys: token.buys1h ?? 0, sells: token.sells1h ?? 0 };
  const tx6h = liveTxns?.h6 ?? { buys: token.buys6h ?? 0, sells: token.sells6h ?? 0 };
  const tx24h = liveTxns?.h24 ?? { buys, sells };

  // Active selected timeframe metrics
  const activeTx = activeTimeframe === '5m' ? tx5m : activeTimeframe === '1h' ? tx1h : activeTimeframe === '6h' ? tx6h : tx24h;
  const activeBuys = activeTx.buys;
  const activeSells = activeTx.sells;
  const activeTotal = activeBuys + activeSells;
  const activeBuyPct = activeTotal > 0 ? Math.round((activeBuys / activeTotal) * 100) : 50;
  const activeSellPct = 100 - activeBuyPct;
  const activeRatio = activeSells > 0 ? (activeBuys / activeSells).toFixed(2) : activeBuys > 0 ? activeBuys.toFixed(1) : '1.00';

  // Overall total buy and total sell across DEX & CoinGecko Terminal
  const totalBuysCount = liveTxns?.totalBuys ?? token.totalBuys ?? buys;
  const totalSellsCount = liveTxns?.totalSells ?? token.totalSells ?? sells;
  const grandTotalTx = totalBuysCount + totalSellsCount;
  const grandBuyPct = grandTotalTx > 0 ? Math.round((totalBuysCount / grandTotalTx) * 100) : 50;

  const currentPool = livePool || token.pool || livePair?.pairAddress || '';

  // Other tokens by this dev
  const devAddr = token.creator.toLowerCase();
  const otherTokensByDev = allTokens.filter(t =>
    t.creator && t.creator.toLowerCase() === devAddr && t.address.toLowerCase() !== token.address.toLowerCase()
  );

  // Security parsing - Base Token
  const isHoneypot = liveSecurity?.is_honeypot === '1';
  const cannotSellAll = liveSecurity?.cannot_sell_all === '1';
  const buyTax = parseFloat(liveSecurity?.buy_tax || '0') * 100;
  const sellTax = parseFloat(liveSecurity?.sell_tax || '0') * 100;
  const devHoldingPct = liveSecurity?.creator_percent != null ? parseFloat(liveSecurity.creator_percent) * 100 : 0;
  const top10Percent = liveSecurity?.top10_holder_percent != null ? parseFloat(liveSecurity.top10_holder_percent) * 100 : 0;
  const holders = Array.isArray(liveSecurity?.holders) ? liveSecurity.holders.slice(0, 10) : [];

  // Dynamic Simulator targets based on current MC
  const baseMc = marketCap || 10000;
  const simTargets = baseMc < 30000
    ? [
        { label: 'Target $25K MC', mc: 25000 },
        { label: 'Target $50K MC', mc: 50000 },
        { label: 'Target $100K MC', mc: 100000 },
        { label: 'Target $250K MC', mc: 250000 },
        { label: 'Target $500K MC', mc: 500000 },
        { label: 'Target $1M MC', mc: 1000000 }
      ]
    : baseMc < 300000
    ? [
        { label: 'Target $100K MC', mc: 100000 },
        { label: 'Target $250K MC', mc: 250000 },
        { label: 'Target $500K MC', mc: 500000 },
        { label: 'Target $1M MC', mc: 1000000 },
        { label: 'Target $2.5M MC', mc: 2500000 },
        { label: 'Target $5M MC', mc: 5000000 }
      ]
    : [
        { label: 'Target 1.5x', mc: Math.round(baseMc * 1.5) },
        { label: 'Target 2.0x', mc: Math.round(baseMc * 2.0) },
        { label: 'Target 3.0x', mc: Math.round(baseMc * 3.0) },
        { label: 'Target 5.0x', mc: Math.round(baseMc * 5.0) },
        { label: 'Target 10x', mc: Math.round(baseMc * 10) },
        { label: 'Target 25x', mc: Math.round(baseMc * 25) }
      ];

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 z-50 overflow-y-auto">
      <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl max-w-2xl w-full p-5 shadow-2xl shadow-black/90 max-h-[92vh] overflow-y-auto space-y-4 text-[var(--color-ink)]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
          <div className="flex items-center gap-3">
            <TokenAvatar
              symbol={token.symbol}
              address={token.address}
              logoUrl={token.logoUrl}
              fallbackLogoUrl={token.fallbackLogoUrl}
              onchainArtworkContract={token.onchainArtworkContract}
              size="md"
            />
            <div>
              <div className="font-extrabold text-[var(--color-ink)] text-base flex items-center gap-2">
                <span className="font-mono">{token.name} ({token.symbol})</span>
                <span className="text-[10px] font-mono text-[var(--color-muted)] bg-[var(--color-field)] border border-[var(--color-line)] px-1.5 py-0.5 rounded">
                  /{token.quoteSymbol || 'WBNB'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSetFavoriteToken && (
              <button
                type="button"
                onClick={() => {
                  onSetFavoriteToken(token);
                  onShowToast(`Saved ${token.symbol} as your favorite thesis token.`);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20"
              >
                <Star className="h-3.5 w-3.5" />
                Favorite token
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-ink)] rounded-lg hover:bg-[var(--color-line)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TradingView Real-Time Chart (CoinGecko Terminal & DexScreener) */}
        <TradingViewChart
          poolAddress={currentPool}
          tokenAddress={token.address}
          symbol={token.symbol}
          quoteSymbol={token.quoteSymbol || 'WBNB'}
          height={380}
        />

        {/* Multi-Timeframe Price Changes (5M, 1H, 6H, 24H) */}
        <div className="bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--color-copper)] uppercase tracking-wider font-mono">
            <div className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-500" />
              <span>{dict.multiTimeframeTitle}</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-muted)] font-normal">
              CoinGecko Terminal Data
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            {/* 5M */}
            <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
              chg5m == null
                ? 'bg-[var(--color-surface)] border-[var(--color-line)]'
                : chg5m >= 0
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                <span>5M CHANGE</span>
                {chg5m != null && (chg5m >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />)}
              </div>
              <div className={`text-base font-bold my-1 ${chg5m == null ? 'text-[var(--color-muted)]' : chg5m >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {chg5m != null ? formatPct(chg5m) : '0.00%'}
              </div>
              <div className="text-[10px] text-[var(--color-muted)] flex justify-between">
                <span>5m Tx:</span>
                <span><span className="text-emerald-400 font-bold">{tx5m.buys}B</span> / <span className="text-rose-400 font-bold">{tx5m.sells}S</span></span>
              </div>
            </div>

            {/* 1H */}
            <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
              chg1h == null
                ? 'bg-[var(--color-surface)] border-[var(--color-line)]'
                : chg1h >= 0
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                <span>1H CHANGE</span>
                {chg1h != null && (chg1h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />)}
              </div>
              <div className={`text-base font-bold my-1 ${chg1h == null ? 'text-[var(--color-muted)]' : chg1h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {chg1h != null ? formatPct(chg1h) : '0.00%'}
              </div>
              <div className="text-[10px] text-[var(--color-muted)] flex justify-between">
                <span>1h Tx:</span>
                <span><span className="text-emerald-400 font-bold">{tx1h.buys}B</span> / <span className="text-rose-400 font-bold">{tx1h.sells}S</span></span>
              </div>
            </div>

            {/* 6H */}
            <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
              chg6h == null
                ? 'bg-[var(--color-surface)] border-[var(--color-line)]'
                : chg6h >= 0
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                <span>6H CHANGE</span>
                {chg6h != null && (chg6h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />)}
              </div>
              <div className={`text-base font-bold my-1 ${chg6h == null ? 'text-[var(--color-muted)]' : chg6h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {chg6h != null ? formatPct(chg6h) : '0.00%'}
              </div>
              <div className="text-[10px] text-[var(--color-muted)] flex justify-between">
                <span>6h Tx:</span>
                <span><span className="text-emerald-400 font-bold">{tx6h.buys}B</span> / <span className="text-rose-400 font-bold">{tx6h.sells}S</span></span>
              </div>
            </div>

            {/* 24H */}
            <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
              chg24h == null
                ? 'bg-[var(--color-surface)] border-[var(--color-line)]'
                : chg24h >= 0
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                <span>24H CHANGE</span>
                {chg24h != null && (chg24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />)}
              </div>
              <div className={`text-base font-bold my-1 ${chg24h == null ? 'text-[var(--color-muted)]' : chg24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {chg24h != null ? formatPct(chg24h) : '0.00%'}
              </div>
              <div className="text-[10px] text-[var(--color-muted)] flex justify-between">
                <span>24h Tx:</span>
                <span><span className="text-emerald-400 font-bold">{tx24h.buys}B</span> / <span className="text-rose-400 font-bold">{tx24h.sells}S</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Buys & Total Sells Order Flow Hub */}
        <div className="bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-[var(--color-copper)] uppercase tracking-wider font-mono flex items-center gap-1.5">
              <span>📊 TOTAL BUYS &amp; TOTAL SELLS (COINGECKO TERMINAL &amp; DEX)</span>
            </div>

            {/* Timeframe Filter Pills */}
            <div className="flex items-center gap-1 bg-[var(--color-surface)] p-0.5 rounded-lg border border-[var(--color-line)] font-mono text-[11px]">
              {(['5m', '1h', '6h', '24h'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setActiveTimeframe(tf)}
                  className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer uppercase ${
                    activeTimeframe === tf
                      ? 'bg-amber-500 text-stone-950 shadow-xs'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Cards for Active Timeframe & Overall Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            {/* Total Buys Card */}
            <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40">
              <span className="text-[10px] text-emerald-400/80 uppercase font-semibold block">
                {dict.totalBuysLabel} ({activeTimeframe.toUpperCase()})
              </span>
              <div className="text-lg font-extrabold text-emerald-400 mt-0.5">
                +{activeBuys.toLocaleString()} <span className="text-xs font-normal text-emerald-500">Buys</span>
              </div>
              <div className="text-[10px] text-emerald-400/70 mt-1">
                Total All-Time: {totalBuysCount.toLocaleString()} Buys
              </div>
            </div>

            {/* Total Sells Card */}
            <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/40">
              <span className="text-[10px] text-rose-400/80 uppercase font-semibold block">
                {dict.totalSellsLabel} ({activeTimeframe.toUpperCase()})
              </span>
              <div className="text-lg font-extrabold text-rose-400 mt-0.5">
                -{activeSells.toLocaleString()} <span className="text-xs font-normal text-rose-500">Sells</span>
              </div>
              <div className="text-[10px] text-rose-400/70 mt-1">
                Total All-Time: {totalSellsCount.toLocaleString()} Sells
              </div>
            </div>

            {/* Buy Pressure & Order Ratio */}
            <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-line)] flex flex-col justify-between">
              <span className="text-[10px] text-[var(--color-muted)] uppercase font-semibold block">
                Buy/Sell Pressure ({activeTimeframe.toUpperCase()})
              </span>
              <div className="text-lg font-extrabold text-amber-400 mt-0.5">
                {activeRatio}x {activeBuyPct >= 50 ? '🟢 Accumulation' : '🔴 Sell Pressure'}
              </div>
              <div className="text-[10px] text-[var(--color-muted)] mt-1">
                {activeBuyPct}% Buys vs {activeSellPct}% Sells
              </div>
            </div>
          </div>

          {/* Visual Order Flow Distribution Bar */}
          <div className="space-y-1 font-mono">
            <div className="flex justify-between text-[11px] font-semibold">
              <span className="text-emerald-400">{activeBuys} Buys ({activeBuyPct}%)</span>
              <span className="text-[var(--color-muted)] text-[10px]">{activeTotal} txns in {activeTimeframe.toUpperCase()}</span>
              <span className="text-rose-400">{activeSells} Sells ({activeSellPct}%)</span>
            </div>
            <div className="w-full h-2.5 bg-rose-950/80 rounded-full overflow-hidden flex border border-[var(--color-line)]">
              <div
                style={{ width: `${activeBuyPct}%` }}
                className="h-full bg-emerald-500 transition-all duration-300"
              />
            </div>
          </div>
        </div>

        {/* Section 1: Market Metrics & Order Flow */}
        <div className="bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--color-copper)] uppercase tracking-wider font-mono">
            <span>{dict.sec1Title}</span>
            <span className="font-mono text-[var(--color-up)] text-[11px] bg-emerald-950 px-2 py-0.5 rounded border border-emerald-600/40">
              ★ Score: {token.agentScore}/100
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="flex justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Current Price</span>
              <span className="font-mono font-bold text-[var(--color-ink)]">{formatUsd(price)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">24h Change</span>
              <span className={`font-mono font-bold ${(priceChange ?? 0) >= 0 ? 'text-[var(--color-up)]' : 'text-[var(--color-down)]'}`}>
                {formatPct(priceChange)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Market Cap / FDV</span>
              <span className="font-mono font-bold text-[var(--color-ink)]">{formatUsd(marketCap)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">24h Volume</span>
              <span className="font-mono font-bold text-[var(--color-ink)]">{formatUsd(volume24h)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">DEX Liquidity</span>
              <span className="font-mono font-bold text-[var(--color-ink)]">{formatUsd(liquidity)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">24h Transactions</span>
              <span className="font-mono text-[var(--color-ink)]">{buys} Buys / {sells} Sells</span>
            </div>
          </div>

          {/* Order Flow Bar */}
          <div className="pt-1.5 space-y-1">
            <div className="flex justify-between text-[11px] font-semibold font-mono">
              <span className="text-[var(--color-up)]">{buys} Buys ({buyPct}%)</span>
              <span className="text-[var(--color-down)]">{sells} Sells ({sellPct}%)</span>
            </div>
            <div className="w-full h-2 bg-rose-950 rounded-full overflow-hidden flex border border-amber-950/40">
              <div style={{ width: `${buyPct}%` }} className="h-full bg-emerald-500 transition-all"></div>
            </div>
          </div>
        </div>

        {/* Section 2: Agent BREW Tactical Verdict & Security Audit */}
        <div className="bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl p-3.5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--color-copper)] uppercase tracking-wider font-mono">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--color-copper)]" />
              <span>{dict.sec2Title}</span>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--color-surface)] border border-amber-600/50 text-[var(--color-copper)] font-bold">
              {token.agentVerdict}
            </span>
          </div>

          <div className="text-xs space-y-1.5 text-[var(--color-muted)] pt-1">
            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Token Honeypot &amp; Tax Audit (GoPlus)</span>
              <span>
                {isLoadingLive ? (
                  <span className="text-[var(--color-copper)] animate-pulse font-mono">Auditing...</span>
                ) : isHoneypot ? (
                  <span className="text-[var(--color-down)] font-bold">🚨 HONEYPOT DETECTED!</span>
                ) : cannotSellAll ? (
                  <span className="text-[var(--color-down)] font-bold">⚠️ Cannot Sell All Tokens</span>
                ) : (
                  <span className="text-[var(--color-up)] font-semibold">
                    ✓ Verified Clean (Buy {buyTax.toFixed(0)}% / Sell {sellTax.toFixed(0)}%)
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Recommended Position Sizing</span>
              <span className="font-mono font-bold text-[var(--color-copper)]">0.05 - 0.15 BNB ($30 - $100)</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Recommended Stop-Loss</span>
              <span className="font-mono font-bold text-[var(--color-down)]">-25% from entry / if LP pulled</span>
            </div>

            <div className="pt-1">
              <span className="text-[var(--color-muted)] block mb-1">Key Tactical Signals:</span>
              <div className="flex flex-wrap gap-1.5">
                {(token.agentSignals || []).map((sig, i) => (
                  <span key={i} className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-muted)]">
                    • {sig}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Developer & Top Holders Intel */}
        <div className="bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl p-3.5 space-y-2">
          <div className="text-xs font-bold text-[var(--color-copper)] uppercase tracking-wider font-mono">
            {dict.sec3Title}
          </div>

          <div className="text-xs space-y-1.5 text-[var(--color-muted)]">
            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Developer (Deployer)</span>
              <button
                onClick={() => handleCopy(token.creator, 'Dev Address')}
                className="font-mono text-[var(--color-copper)] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{truncateAddr(token.creator)}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Dev Wallet Holding</span>
              <span className="font-mono font-bold">
                {devHoldingPct > 10 ? (
                  <span className="text-[var(--color-down)]">🚨 {devHoldingPct.toFixed(2)}% (Dump Risk)</span>
                ) : devHoldingPct > 0 ? (
                  <span className="text-[var(--color-copper)]">{devHoldingPct.toFixed(2)}% of supply</span>
                ) : (
                  <span className="text-[var(--color-up)]">✓ 0.00% (Clean / Divested)</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Top 10 Holders Share</span>
              <span className="font-mono font-bold text-[var(--color-ink)]">
                {top10Percent > 0 ? `${top10Percent.toFixed(2)}% of supply` : 'Locked in Launchpad'}
              </span>
            </div>

            {holders.length > 0 && (
              <div className="pt-2">
                <span className="text-[var(--color-muted)] text-[11px] block mb-1.5 font-semibold uppercase font-mono">
                  Top Holders Distribution (GoPlus On-Chain Audit)
                </span>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {holders.map((h: any, idx: number) => {
                    const pct = (parseFloat(h.percent || '0') * 100);
                    const isLp = h.tag?.toLowerCase().includes('pancake') || h.address?.toLowerCase() === token.pool?.toLowerCase();
                    const isBurn = h.address?.toLowerCase().includes('dead') || h.address === '0x0000000000000000000000000000000000000000';
                    const isDev = h.address?.toLowerCase() === token.creator?.toLowerCase();

                    return (
                      <div key={idx} className="flex items-center justify-between text-[11px] py-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--color-muted)] font-mono w-4">#{idx + 1}</span>
                          <span className="font-mono text-[var(--color-muted)]">{truncateAddr(h.address)}</span>
                          {isLp && <span className="px-1 bg-amber-950/80 border border-[var(--color-line)] text-[var(--color-copper)] text-[9px] rounded font-bold font-mono">LP POOL</span>}
                          {isBurn && <span className="px-1 bg-rose-950/80 border border-rose-600/40 text-[var(--color-down)] text-[9px] rounded font-bold font-mono">BURN 🔥</span>}
                          {isDev && <span className="px-1 bg-stone-900 border border-[var(--color-line)] text-[var(--color-copper)] text-[9px] rounded font-bold font-mono">DEV</span>}
                        </div>
                        <span className="font-mono font-bold text-[var(--color-copper)]">{pct.toFixed(2)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Other tokens by same dev */}
            {otherTokensByDev.length > 0 && (
              <div className="mt-2 p-2.5 rounded-lg bg-[var(--color-line)] border border-[var(--color-line)]">
                <span className="text-[11px] text-[var(--color-copper)] font-bold block mb-1 font-mono">
                  ⚠️ Other Tokens Launched by this Developer ({otherTokensByDev.length}):
                </span>
                <div className="flex flex-wrap gap-1">
                  {otherTokensByDev.map(other => (
                    <button
                      key={other.address}
                      onClick={() => onSelectAnotherToken(other)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)] hover:bg-amber-600 hover:text-stone-950 transition-colors cursor-pointer"
                    >
                      {other.symbol} ↗
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Dynamic Profit Simulator */}
        <div className="bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-copper)] uppercase tracking-wider font-mono">
              <TrendingUp className="w-4 h-4 text-[var(--color-up)]" />
              <span>{dict.sec4Title}</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[var(--color-muted)] text-[11px]">Capital:</span>
              {[20, 50, 100, 250].map(amt => (
                <button
                  key={amt}
                  onClick={() => setSimCapital(amt)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                    simCapital === amt
                      ? 'bg-amber-400 text-stone-950 font-bold'
                      : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-line)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {simTargets.map((target, idx) => {
              const multiplier = baseMc > 0 ? Math.max(1, target.mc / baseMc) : 2;
              const projected = simCapital * multiplier;
              const profit = projected - simCapital;

              return (
                <div key={idx} className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-2 text-center">
                  <div className="text-[10px] text-[var(--color-muted)] truncate font-mono">{target.label}</div>
                  <div className="font-mono text-xs font-bold text-[var(--color-up)]">
                    +{formatUsd(profit)}
                  </div>
                  <div className="text-[9px] font-mono text-[var(--color-muted)]">
                    {multiplier.toFixed(1)}x ROI · Total {formatUsd(projected)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 5: Contract Identity & Links */}
        <div className="bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl p-3.5 space-y-2">
          <div className="text-xs font-bold text-[var(--color-copper)] uppercase tracking-wider font-mono">
            {dict.sec5Title}
          </div>

          <div className="text-xs space-y-1.5 text-[var(--color-muted)]">
            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
              <span className="text-[var(--color-muted)]">Token Contract (Base)</span>
              <button
                onClick={() => handleCopy(token.address, 'Token Address')}
                className="font-mono text-[var(--color-ink)] hover:text-[var(--color-copper)] inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{truncateAddr(token.address)}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>

            {token.quoteAddress && (
              <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
                <span className="text-[var(--color-muted)]">Paired Quote Contract</span>
                <button
                  onClick={() => handleCopy(token.quoteAddress || '', 'Quote Address')}
                  className="font-mono text-[var(--color-copper)] hover:underline inline-flex items-center gap-1 cursor-pointer font-bold"
                >
                  <span>{truncateAddr(token.quoteAddress)} ({token.quoteSymbol || 'WBNB'})</span>
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}

            {token.pool && (
              <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
                <span className="text-[var(--color-muted)]">Pair / Pool Contract</span>
                <button
                  onClick={() => handleCopy(token.pool, 'Pool Address')}
                  className="font-mono text-[var(--color-ink)] hover:text-[var(--color-copper)] inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{truncateAddr(token.pool)}</span>
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}

            {token.onchainArtworkContract && (
              <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]">
                <span className="text-[var(--color-muted)]">On-Chain Artwork Contract</span>
                <button
                  onClick={() => handleCopy(token.onchainArtworkContract!, 'Artwork Address')}
                  className="font-mono text-[var(--color-ink)] hover:text-[var(--color-copper)] inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{truncateAddr(token.onchainArtworkContract)}</span>
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}

            {token.description && (
              <div className="pt-1 text-[11px] text-[var(--color-muted)]">
                <span className="text-[var(--color-muted)] font-semibold block mb-0.5">Description:</span>
                <p className="leading-relaxed">{token.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => onTrade(token)}
            className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl font-mono font-bold text-xs bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 hover:brightness-110 transition-all shadow-lg shadow-amber-950/40 text-center cursor-pointer"
          >
            {dict.btnSwap} ({token.symbol})
          </button>

          <a
            href={token.dexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 py-2 px-3 rounded-lg font-mono font-semibold text-xs bg-[var(--color-field)] border border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:border-amber-600/50"
          >
            <span>DexScreener</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <a
            href={token.bubblemapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 py-2 px-3 rounded-lg font-mono font-semibold text-xs bg-[var(--color-field)] border border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:border-amber-600/50"
          >
            <span>BubbleMaps</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <a
            href={`${token.bscscanTokenUrl}#balances`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 py-2 px-3 rounded-lg font-mono font-semibold text-xs bg-[var(--color-field)] border border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:border-amber-600/50"
          >
            <span>BscScan</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <a
            href={token.brewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 py-2 px-3 rounded-lg font-mono font-semibold text-xs bg-[var(--color-field)] border border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:border-amber-600/50"
          >
            <span>Brew.family</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
