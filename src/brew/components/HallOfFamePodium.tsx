import React, { useState, useMemo } from 'react';
import { Token, Language } from '../types.ts';
import { I18N } from '../i18n.ts';
import { formatUsd, formatPct, truncateAddr } from '../utils/format.ts';
import { TokenAvatar } from './TokenAvatar.tsx';

interface HallOfFamePodiumProps {
  tokens: Token[];
  lang: Language;
  onAnalyze: (token: Token) => void;
  onTrade: (token: Token) => void;
}

type PodiumCriteria = 'volume' | 'change' | 'mcap' | 'buys';

export const HallOfFamePodium: React.FC<HallOfFamePodiumProps> = ({
  tokens,
  lang,
  onAnalyze,
  onTrade,
}) => {
  const [criteria, setCriteria] = useState<PodiumCriteria>('volume');
  const dict = I18N[lang] || I18N.en;

  // Rank tokens according to selected criteria
  const topThree = useMemo(() => {
    let list = [...tokens].filter((t) => {
      if (criteria === 'volume') return (t.volume24h || 0) > 0;
      if (criteria === 'change') {
        const chg = t.priceChange24h || 0;
        const price = t.priceUsd || 0;
        const liq = t.liquidityUsd || 0;
        const vol = t.volume24h || 0;
        const mcap = t.marketCap || 0;
        return chg > 0 && price > 0 && (liq > 30 || vol > 5 || mcap > 500);
      }
      if (criteria === 'buys') {
        return (t.buys24h || 0) > 0 || (t.buyRatio || 0) > 1;
      }
      return (t.marketCap || 0) > 0;
    });

    if (criteria === 'change' && list.length < 3) {
      list = [...tokens].filter((t) => (t.priceChange24h || 0) > 0 && (t.priceUsd || 0) > 0);
    }
    if (list.length < 3) {
      // Fallback to top volume or non-zero market caps
      list = [...tokens].filter((t) => (t.volume24h || 0) > 0 || (t.marketCap || 0) > 0);
    }

    if (criteria === 'volume') {
      list.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    } else if (criteria === 'change') {
      list.sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0));
    } else if (criteria === 'buys') {
      list.sort((a, b) => (b.buyRatio || 1) * (b.buys24h || 1) - (a.buyRatio || 1) * (a.buys24h || 1));
    } else {
      list.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    }

    return list.slice(0, 3);
  }, [tokens, criteria]);

  // Classic podium visual ordering:
  // Left: 2nd place (runner up)
  // Center: 1st place (champion, elevated)
  // Right: 3rd place (third)
  const podiumOrder = useMemo(() => {
    if (topThree.length === 0) return [];
    const first = topThree[0];
    const second = topThree[1];
    const third = topThree[2];

    return [
      { token: second, rank: 2, label: dict.hofRank2Badge || '2ND PLACE', place: '2nd', roman: 'II' },
      { token: first, rank: 1, label: dict.hofRank1Badge || '1ST CHAMPION', place: '1st', roman: 'I' },
      { token: third, rank: 3, label: dict.hofRank3Badge || '3RD PLACE', place: '3rd', roman: 'III' },
    ];
  }, [topThree, dict]);

  const tabs: { id: PodiumCriteria; label: string; icon: string }[] = [
    { id: 'volume', label: dict.hofCritVol || 'Volume 24H', icon: '📊' },
    { id: 'change', label: dict.hofCritChange || 'Top Gainers', icon: '🚀' },
    { id: 'mcap', label: dict.hofCritMcap || 'Market Cap', icon: '💎' },
    { id: 'buys', label: 'Buy Pressure', icon: '🔥' },
  ];

  const getHighlightStat = (token?: Token) => {
    if (!token) return { value: '-', sub: '-' };
    if (criteria === 'volume') {
      return {
        value: formatUsd(token.volume24h || 0),
        sub: '24h Volume',
      };
    }
    if (criteria === 'change') {
      const chg = token.priceChange24h || 0;
      return {
        value: formatPct(chg),
        sub: '24h Price Surge',
        isPositive: chg >= 0,
      };
    }
    if (criteria === 'buys') {
      const ratio = token.buyRatio || (token.sells24h ? token.buys24h / token.sells24h : 1);
      return {
        value: `${ratio.toFixed(1)}x Buys`,
        sub: `${token.buys24h || 0} Buys / ${token.sells24h || 0} Sells`,
      };
    }
    return {
      value: formatUsd(token.marketCap || 0),
      sub: 'Market Cap',
    };
  };

  return (
    <section className="panel mb-6 overflow-hidden p-4 sm:p-6 relative bg-gradient-to-b from-[var(--color-field)] via-[var(--color-paper)] to-[var(--color-paper)] border border-[var(--color-line)] shadow-xl">
      {/* Background ambient stage spotlight glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 max-w-2xl h-48 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* Header & Criteria Filter Bar */}
      <div className="relative z-10 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--color-line)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <h2 className="text-[17px] sm:text-[19px] font-bold tracking-tight text-[var(--color-ink)]">
              {dict.hofTitle || 'Hall of Fame · Podium'}
            </h2>
            <span className="chip px-2 py-0.5 text-[10px] font-mono uppercase bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold">
              Live Tape
            </span>
          </div>
          <p className="mt-1 text-[12px] sm:text-[13px] text-[var(--color-muted)]">
            {dict.hofSubtitle || 'Top three tokens on brew.family & BSC ranked by real-time on-chain metrics.'}
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--color-field)] border border-[var(--color-line)] rounded-xl shadow-inner">
          {tabs.map((tab) => {
            const active = criteria === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCriteria(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  active
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-500/20 scale-[1.02]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-line)]/50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {topThree.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-[var(--color-muted)]">
          <div className="text-3xl mb-2">⏳</div>
          Menghubungkan ke tape transaksi DexScreener & CoinGecko BSC...
        </div>
      ) : (
        /* The 3D Championship Podium Structure */
        <div className="relative z-10 pt-4 pb-2">
          {/* Main 3-Column Podium Flex/Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 items-end">
            {podiumOrder.map(({ token, rank, label, place, roman }) => {
              if (!token) return null;
              const isFirst = rank === 1;
              const isSecond = rank === 2;
              const isThird = rank === 3;
              const stat = getHighlightStat(token);

              return (
                <div
                  key={token.address || rank}
                  className={`flex flex-col transition-all duration-300 ${
                    isFirst
                      ? 'order-1 md:order-2 md:-translate-y-4 z-20'
                      : isSecond
                      ? 'order-2 md:order-1 z-10'
                      : 'order-3 md:order-3 z-10'
                  }`}
                >
                  {/* Top Rank Badge / Crown */}
                  <div className="flex items-center justify-center mb-2">
                    {isFirst && (
                      <div className="animate-float-badge flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-stone-950 text-[11px] font-extrabold shadow-lg shadow-amber-500/30 tracking-wider uppercase border border-amber-300">
                        <span className="text-[14px]">👑</span>
                        <span>{label}</span>
                        <span className="text-[14px]">🥇</span>
                      </div>
                    )}
                    {isSecond && (
                      <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-800 text-slate-200 text-[11px] font-bold border border-slate-600/80 shadow-md tracking-wider uppercase">
                        <span>🥈</span>
                        <span>{label}</span>
                      </div>
                    )}
                    {isThird && (
                      <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-stone-800 text-amber-500 text-[11px] font-bold border border-amber-800/80 shadow-md tracking-wider uppercase">
                        <span>🥉</span>
                        <span>{label}</span>
                      </div>
                    )}
                  </div>

                  {/* Token Card */}
                  <div
                    className={`rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all backdrop-blur-md relative overflow-hidden ${
                      isFirst
                        ? 'bg-gradient-to-b from-amber-500/10 via-[var(--color-field)] to-[var(--color-paper)] border-2 border-amber-400/80 shadow-2xl shadow-amber-500/20 light-sweep-effect'
                        : isSecond
                        ? 'bg-gradient-to-b from-slate-500/10 via-[var(--color-field)] to-[var(--color-paper)] border border-slate-400/50 shadow-lg shadow-slate-500/10'
                        : 'bg-gradient-to-b from-amber-900/10 via-[var(--color-field)] to-[var(--color-paper)] border border-amber-700/40 shadow-lg shadow-amber-900/10'
                    }`}
                  >
                    {/* Corner Position Watermark */}
                    <div
                      className={`absolute top-2 right-3 font-black text-[32px] sm:text-[38px] select-none pointer-events-none opacity-15 font-mono ${
                        isFirst ? 'text-amber-400' : isSecond ? 'text-slate-300' : 'text-amber-600'
                      }`}
                    >
                      {roman}
                    </div>

                    {/* Token Identity Header */}
                    <div className="flex items-start gap-3.5 mb-3.5 relative z-10">
                      <div className="relative">
                        <div
                          className={`rounded-full p-0.5 ${
                            isFirst
                              ? 'ring-2 ring-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                              : isSecond
                              ? 'ring-2 ring-slate-300'
                              : 'ring-2 ring-amber-700'
                          }`}
                        >
                          <TokenAvatar
                            symbol={token.symbol}
                            address={token.address}
                            logoUrl={token.logoUrl}
                            fallbackLogoUrl={token.fallbackLogoUrl}
                            onchainArtworkContract={token.onchainArtworkContract}
                            size={isFirst ? 'lg' : 'md'}
                          />
                        </div>
                        <span
                          className={`absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black font-mono shadow-sm ${
                            isFirst
                              ? 'bg-amber-400 text-stone-950 ring-2 ring-stone-900'
                              : isSecond
                              ? 'bg-slate-300 text-stone-900 ring-2 ring-stone-900'
                              : 'bg-amber-700 text-stone-100 ring-2 ring-stone-900'
                          }`}
                        >
                          {rank}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[15px] sm:text-[17px] text-[var(--color-ink)] truncate max-w-[130px]">
                            {token.symbol}
                          </span>
                          {token.creatorLaunchCount === 1 ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-mono font-medium border border-emerald-500/30">
                              Solo Dev
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 font-mono font-medium border border-amber-500/30">
                              {token.creatorLaunchCount} Tokens
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[12px] text-[var(--color-muted)] mt-0.5">
                          {token.name}
                        </div>
                      </div>
                    </div>

                    {/* Primary Highlight Metric Box */}
                    <div
                      className={`p-3 rounded-xl mb-3 border text-center transition-all ${
                        isFirst
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : isSecond
                          ? 'bg-slate-800/40 border-slate-700/60 text-slate-200'
                          : 'bg-stone-900/40 border-stone-800 text-amber-500'
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-75">
                        {stat.sub}
                      </div>
                      <div
                        className={`text-[20px] sm:text-[23px] font-black tracking-tight font-mono my-0.5 ${
                          stat.isPositive !== undefined
                            ? stat.isPositive
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                            : ''
                        }`}
                      >
                        {stat.value}
                      </div>
                    </div>

                    {/* Key Stats Matrix */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] mb-3.5 bg-[var(--color-field)]/60 rounded-xl p-2.5 border border-[var(--color-line)]">
                      <div>
                        <span className="text-[var(--color-muted)] block text-[10px]">Price</span>
                        <span className="font-mono font-semibold text-[var(--color-ink)] truncate block">
                          {token.priceUsd ? formatUsd(token.priceUsd) : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--color-muted)] block text-[10px]">Market Cap</span>
                        <span className="font-mono font-semibold text-[var(--color-ink)] truncate block">
                          {token.marketCap ? formatUsd(token.marketCap) : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--color-muted)] block text-[10px]">Liquidity</span>
                        <span className="font-mono font-semibold text-[var(--color-ink)] truncate block">
                          {token.liquidityUsd ? formatUsd(token.liquidityUsd) : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--color-muted)] block text-[10px]">Safety / Agent</span>
                        <span
                          className={`font-semibold text-[10px] px-1.5 py-0.5 rounded inline-block ${
                            token.agentVerdict === 'SAFE'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : token.agentVerdict === 'HIGH RISK'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {token.agentVerdict || 'NEUTRAL'} ({token.agentScore})
                        </span>
                      </div>
                    </div>

                    {/* External DEX & CoinGecko Links */}
                    <div className="flex items-center justify-between gap-1 text-[11px] mb-3 px-1">
                      <span className="text-[10px] text-[var(--color-muted)] font-mono">
                        CA: {truncateAddr(token.address)}
                      </span>
                      <div className="flex items-center gap-2">
                        {token.dexUrl && (
                          <a
                            href={token.dexUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-amber-400 hover:text-amber-300 underline font-mono flex items-center gap-0.5"
                            title="Buka di DexScreener"
                          >
                            DexScreener ↗
                          </a>
                        )}
                        <a
                          href={`https://www.geckoterminal.com/bsc/tokens/${token.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono flex items-center gap-0.5"
                          title="Buka di CoinGecko / GeckoTerminal"
                        >
                          CoinGecko ↗
                        </a>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 relative z-10">
                      <button
                        className="btn h-9 flex-1 justify-center text-[12px] font-medium"
                        onClick={() => onAnalyze(token)}
                      >
                        {dict.btnAnalyze || 'Analisis'}
                      </button>
                      <button
                        className={`btn h-9 flex-1 justify-center text-[12px] font-bold ${
                          isFirst
                            ? 'bg-amber-500 text-stone-950 hover:bg-amber-400 shadow-md shadow-amber-500/20'
                            : 'btn-solid'
                        }`}
                        onClick={() => onTrade(token)}
                      >
                        {dict.btnSwap || 'Swap / Trade'}
                      </button>
                    </div>
                  </div>

                  {/* Physical 3D Stepped Pedestal Base */}
                  <div
                    className={`relative rounded-b-2xl flex flex-col items-center justify-center border-x shadow-2xl transition-all ${
                      isFirst
                        ? 'h-24 sm:h-32 bg-gradient-to-t from-amber-950/80 via-amber-900/40 to-amber-500/25 border-amber-500/50 border-t-4 border-t-amber-400 shadow-[0_10px_30px_rgba(245,158,11,0.25)]'
                        : isSecond
                        ? 'h-16 sm:h-22 bg-gradient-to-t from-slate-950/80 via-slate-900/40 to-slate-400/20 border-slate-500/40 border-t-4 border-t-slate-300 shadow-[0_10px_25px_rgba(148,163,184,0.15)]'
                        : 'h-12 sm:h-16 bg-gradient-to-t from-stone-950/90 via-amber-950/40 to-amber-700/20 border-amber-800/40 border-t-4 border-t-amber-700 shadow-[0_10px_20px_rgba(180,83,9,0.15)]'
                    }`}
                  >
                    {/* Pedestal Surface Spotlight Reflection */}
                    <div
                      className={`absolute top-0 left-1/4 right-1/4 h-[1px] blur-sm ${
                        isFirst ? 'bg-amber-300' : isSecond ? 'bg-slate-200' : 'bg-amber-500'
                      }`}
                    />

                    {/* Metallic 3D Embossed Pedestal Number */}
                    <div className="flex flex-col items-center justify-center select-none">
                      <span
                        className={`font-black font-mono tracking-tighter drop-shadow-md leading-none ${
                          isFirst
                            ? 'text-3xl sm:text-4xl text-amber-400'
                            : isSecond
                            ? 'text-2xl sm:text-3xl text-slate-300'
                            : 'text-xl sm:text-2xl text-amber-600'
                        }`}
                      >
                        {place.toUpperCase()}
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.2em] font-mono text-[var(--color-muted)] mt-1 font-semibold">
                        {isFirst ? '★ 1st Place ★' : isSecond ? '2nd Place' : '3rd Place'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ground Stage Reflection Bar */}
          <div className="mt-2 h-1.5 w-full bg-gradient-to-r from-transparent via-[var(--color-line)] to-transparent rounded-full opacity-60" />
        </div>
      )}
    </section>
  );
};
