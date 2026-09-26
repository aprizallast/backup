import React, { useState, useMemo, useEffect } from 'react';
import { Token, FilterType, SortKey, Language } from '../types.ts';
import { I18N } from '../i18n.ts';
import { formatUsd, formatPct, truncateAddr } from '../utils/format.ts';
import { TokenAvatar } from './TokenAvatar.tsx';
import { Search, Plus, ArrowUpDown, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { ThesisEntry } from '@/lib/thesis/thesis-store';

const TIMEFRAMES = [
  { key: 'priceChange5m' as const, title: '5M CHANGE', tx: '5m', buys: 'buys5m' as const, sells: 'sells5m' as const },
  { key: 'priceChange1h' as const, title: '1H CHANGE', tx: '1h', buys: 'buys1h' as const, sells: 'sells1h' as const },
  { key: 'priceChange6h' as const, title: '6H CHANGE', tx: '6h', buys: 'buys6h' as const, sells: 'sells6h' as const },
  { key: 'priceChange24h' as const, title: '24H CHANGE', tx: '24h', buys: 'buys24h' as const, sells: 'sells24h' as const },
];

function ChangeCell({ title, change, txLabel, buys, sells }: { title: string; change: number | null | undefined; txLabel: string; buys?: number; sells?: number }) {
  const value = change == null || Number.isNaN(Number(change)) ? 0 : Number(change);
  const color = value > 0 ? 'var(--color-up)' : value < 0 ? 'var(--color-down)' : 'var(--color-muted)';
  return (
    <td className="px-3 py-3 whitespace-nowrap align-top">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{title}</div>
      <div className="num mt-0.5 text-[13px] font-semibold" style={{ color }}>
        {formatPct(value)}
      </div>
      <div className="mt-0.5 font-mono text-[10px] tracking-tight text-[var(--color-muted)]">
        {txLabel} Tx:<span className="text-[var(--color-up)]">{buys ?? 0} BUY</span>
        {' / '}
        <span className="text-[var(--color-down)]">{sells ?? 0} SELL</span>
      </div>
    </td>
  );
}

function getInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'A';
}

interface TokenRadarProps {
  tokens: Token[];
  totalLaunches: number;
  lang: Language;
  thesisByToken?: Record<string, ThesisEntry[]>;
  onAddThesis?: (token: Token, title: string, content: string) => void;
  onLikeThesis?: (token: Token, thesisId: string) => void;
  currentUserId?: string | null;
  onAnalyze: (token: Token) => void;
  onTrade: (token: Token) => void;
  onFilterByDev: (devAddress: string) => void;
  onTrackCustom: (contractAddress: string) => Promise<void>;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onLiveSearch: (query: string) => Promise<void>;
  onVisibleTokens?: (tokens: Token[]) => void;
  initialSearch?: string;
  onClearSearch?: () => void;
  onOpenTokenSniffer?: (token?: Token) => void;
}

export const TokenRadar: React.FC<TokenRadarProps> = ({
  tokens,
  totalLaunches,
  lang,
  thesisByToken,
  onAddThesis,
  onLikeThesis,
  currentUserId,
  onAnalyze,
  onTrade,
  onFilterByDev,
  onTrackCustom,
  audioEnabled,
  onToggleAudio,
  onLiveSearch,
  onVisibleTokens,
  initialSearch,
  onClearSearch,
  onOpenTokenSniffer
}) => {
  const dict = I18N[lang];
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
      setCurrentPage(1);
    }
  }, [initialSearch]);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Quick filters
  const [minLiq1k, setMinLiq1k] = useState(false);
  const [minVol5k, setMinVol5k] = useState(false);
  const [singleDevOnly, setSingleDevOnly] = useState(false);

  // Custom contract tracking
  const [customInput, setCustomInput] = useState('');
  const [isTracking, setIsTracking] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [openThesisComposer, setOpenThesisComposer] = useState<Record<string, boolean>>({});
  const [thesisDrafts, setThesisDrafts] = useState<Record<string, { title: string; content: string }>>({});
  const pageSize = 30;

  // Accurately compute creator launch counts across all active tokens
  const devCounts = useMemo(() => {
    const map: Record<string, number> = {};
    tokens.forEach(t => {
      const c = (t.creator || '').toLowerCase().trim();
      if (c) map[c] = (map[c] || 0) + 1;
    });
    return map;
  }, [tokens]);

  const totalSerialTokens = useMemo(() => {
    let count = 0;
    tokens.forEach(t => {
      const c = (t.creator || '').toLowerCase().trim();
      const launchCount = Math.max(t.creatorLaunchCount || 1, devCounts[c] || 1);
      if (launchCount > 1) count++;
    });
    return count;
  }, [tokens, devCounts]);

  const getRecentBuyMomentum = (token: Token) => {
    const score =
      (token.buys5m || 0) * 100 +
      (token.buys1h || 0) * 30 +
      (token.buys6h || 0) * 8 +
      (token.buys24h || 0) * 2;

    const recencyBoost =
      (token.priceChange5m || 0) * 0.3 +
      (token.priceChange1h || 0) * 0.15 +
      (token.priceChange6h || 0) * 0.05;

    return score + Math.max(recencyBoost, 0);
  };

  const categoryCounts = useMemo(() => {
    let dexActive = 0;
    let gainersPositive = 0;
    let mcapActive = 0;
    let volActive = 0;
    for (const t of tokens) {
      if ((t.liquidityUsd || 0) > 0) dexActive++;
      if ((t.priceChange24h || 0) > 0) gainersPositive++;
      if ((t.marketCap || 0) > 5000) mcapActive++;
      if ((t.volume24h || 0) > 0) volActive++;
    }
    return {
      total: tokens.length,
      dex: tokens.length,
      gainers: tokens.length,
      mcap: tokens.length,
      vol: tokens.length,
      dexActive,
      gainersPositive,
      mcapActive,
      volActive,
    };
  }, [tokens]);

  // Filter & Sort logic
  const filteredTokens = useMemo(() => {
    let list = [...tokens];
    const q = searchQuery.toLowerCase().trim();

    if (q) {
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q) ||
        t.creator.toLowerCase().includes(q)
      );
    }

    if (minLiq1k) list = list.filter(t => t.liquidityUsd >= 1000);
    if (minVol5k) list = list.filter(t => t.volume24h >= 5000);
    if (singleDevOnly) {
      list = list.filter(t => {
        const c = (t.creator || '').toLowerCase().trim();
        const cnt = c ? Math.max(t.creatorLaunchCount || 1, devCounts[c] || 1) : (t.creatorLaunchCount || 1);
        return cnt === 1;
      });
    }

    if (filterType === 'newest') {
      list.sort((a, b) => (b.launchedAt || b.blockNumber || 0) - (a.launchedAt || a.blockNumber || 0));
    } else if (filterType === 'recent-buy') {
      list.sort((a, b) => {
        if ((b.lastBuyAt || 0) !== (a.lastBuyAt || 0)) {
          return (b.lastBuyAt || 0) - (a.lastBuyAt || 0);
        }
        if ((b.lastBuyBlockNumber || 0) !== (a.lastBuyBlockNumber || 0)) {
          return (b.lastBuyBlockNumber || 0) - (a.lastBuyBlockNumber || 0);
        }
        if ((b.lastBuyLogIndex || 0) !== (a.lastBuyLogIndex || 0)) {
          return (b.lastBuyLogIndex || 0) - (a.lastBuyLogIndex || 0);
        }
        return getRecentBuyMomentum(b) - getRecentBuyMomentum(a);
      });
    } else if (filterType === 'top10-mcap') {
      // Display ALL tokens sorted descending by Market Cap
      list.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    } else if (filterType === 'top10-vol') {
      // Display ALL tokens sorted descending by 24h Volume
      list.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    } else if (filterType === 'top10-gainers') {
      // Display ALL tokens sorted descending by 24h % price change (top gainers first)
      list.sort((a, b) => {
        const chgA = a.priceChange24h != null ? a.priceChange24h : -999999;
        const chgB = b.priceChange24h != null ? b.priceChange24h : -999999;
        if (chgB !== chgA) return chgB - chgA;
        return (b.volume24h || 0) - (a.volume24h || 0);
      });
    } else if (filterType === 'top10-potential') {
      list.sort((a, b) => (b.agentScore || 0) - (a.agentScore || 0));
    } else if (filterType === 'dex-active') {
      // Display ALL tokens sorted descending by DEX Liquidity and volume (all tokens have PancakeSwap DEX pools)
      list.sort((a, b) => {
        const liqA = a.liquidityUsd || 0;
        const liqB = b.liquidityUsd || 0;
        if (liqB !== liqA) return liqB - liqA;
        return (b.volume24h || 0) - (a.volume24h || 0);
      });
    } else if (filterType === 'serial-dev') {
      list = list.filter(t => {
        const c = (t.creator || '').toLowerCase().trim();
        const cnt = c ? Math.max(t.creatorLaunchCount || 1, devCounts[c] || 1) : (t.creatorLaunchCount || 1);
        return cnt > 1;
      });
      list.sort((a, b) => {
        const cA = (a.creator || '').toLowerCase().trim();
        const cB = (b.creator || '').toLowerCase().trim();
        const countA = cA ? Math.max(a.creatorLaunchCount || 1, devCounts[cA] || 1) : (a.creatorLaunchCount || 1);
        const countB = cB ? Math.max(b.creatorLaunchCount || 1, devCounts[cB] || 1) : (b.creatorLaunchCount || 1);
        return countB - countA;
      });
    } else if (filterType === 'all') {
      const dir = sortDir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const valA: any = sortKey === 'rank' ? (a.launchedAt || a.blockNumber || 0) : (a as any)[sortKey];
        const valB: any = sortKey === 'rank' ? (b.launchedAt || b.blockNumber || 0) : (b as any)[sortKey];
        if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
        return ((valA || 0) - (valB || 0)) * dir;
      });
    }

    return list;
  }, [tokens, devCounts, searchQuery, filterType, sortKey, sortDir, minLiq1k, minVol5k, singleDevOnly]);

  const totalPages = Math.ceil(filteredTokens.length / pageSize) || 1;
  const validPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIdx = (validPage - 1) * pageSize;
  const pagedTokens = filteredTokens.slice(startIdx, startIdx + pageSize);

  useEffect(() => {
    if (onVisibleTokens && pagedTokens.length > 0) {
      onVisibleTokens(pagedTokens);
    }
  }, [pagedTokens, onVisibleTokens]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setFilterType('all');
    setCurrentPage(1);
  };

  const handleTrack = async () => {
    const addr = customInput.trim();
    if (!addr) return;
    setIsTracking(true);
    try {
      await onTrackCustom(addr);
      setCustomInput('');
    } finally {
      setIsTracking(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = searchQuery.trim();
      if (q) onLiveSearch(q);
    }
  };

  return (
    <div className="mb-6 space-y-4">
      <div className="panel space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={dict.searchPh}
              suppressHydrationWarning
              className="field with-icon"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  if (onClearSearch) onClearSearch();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-ink)] text-xs px-1 cursor-pointer"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Meta Status & Result Count */}
          <div className="flex items-center gap-2.5 text-xs text-[var(--color-muted)]">
            {searchQuery.startsWith('0x') && searchQuery.length >= 20 && (
              <span className="bg-[var(--color-field)] border border-[var(--color-line)] text-[var(--color-copper)] px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5">
                <span>Dev: {truncateAddr(searchQuery)}</span>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    if (onClearSearch) onClearSearch();
                  }}
                  className="hover:text-[var(--color-ink)]"
                >
                  ✕
                </button>
              </span>
            )}
            <div className="font-mono text-[11px]">
              <strong className="text-[var(--color-ink)]">{filteredTokens.length}</strong> / {totalLaunches.toLocaleString()}
            </div>
            {onOpenTokenSniffer && (
              <button
                onClick={() => onOpenTokenSniffer()}
                className="btn text-xs px-2.5 py-1 flex items-center gap-1.5 cursor-pointer text-amber-500 hover:text-amber-400 border border-amber-500/30 hover:border-amber-500/60 rounded"
                title="Open GoPlus Contract Auditor & Token Sniffer"
              >
                <span>🛡️ Sniffer</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <button
            onClick={() => { setFilterType('all'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'all'}
          >
            {dict.allTokens}
          </button>
          <button
            onClick={() => { setFilterType('newest'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'newest'}
          >
            {dict.newestReleases}
          </button>
          <button
            onClick={() => { setFilterType('recent-buy'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'recent-buy'}
          >
            {dict.recentBuy}
          </button>
          <button
            onClick={() => { setFilterType('dex-active'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'dex-active'}
          >
            {dict.withDexLiq} {categoryCounts.dex > 0 && <span className="opacity-80 font-normal">({categoryCounts.dex})</span>}
          </button>
          <button
            onClick={() => { setFilterType('top10-gainers'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'top10-gainers'}
          >
            {dict.topGainers} {categoryCounts.gainers > 0 && <span className="opacity-80 font-normal">({categoryCounts.gainers})</span>}
          </button>
          <button
            onClick={() => { setFilterType('top10-mcap'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'top10-mcap'}
          >
            {dict.topMcap} {categoryCounts.mcap > 0 && <span className="opacity-80 font-normal">({categoryCounts.mcap})</span>}
          </button>
          <button
            onClick={() => { setFilterType('top10-vol'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'top10-vol'}
          >
            {dict.topVol} {categoryCounts.vol > 0 && <span className="opacity-80 font-normal">({categoryCounts.vol})</span>}
          </button>
          <button
            onClick={() => { setFilterType('top10-potential'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'top10-potential'}
          >
            {dict.highestScore}
          </button>
          <button
            onClick={() => { setFilterType('serial-dev'); setCurrentPage(1); }}
            className="chip"
            data-on={filterType === 'serial-dev'}
          >
            {lang === 'zh' ? '开发者聚类' : lang === 'ja' ? '開発者クラスター' : 'Dev clusters'} ({totalSerialTokens > 0 ? `${totalSerialTokens}` : '>1'})
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-[var(--color-muted)]">{dict.quickFilters}</span>
            <button onClick={() => { setMinLiq1k(!minLiq1k); setCurrentPage(1); }} className="chip" data-on={minLiq1k}>{"Liq > $1K"}</button>
            <button onClick={() => { setMinVol5k(!minVol5k); setCurrentPage(1); }} className="chip" data-on={minVol5k}>{"Vol 24h > $5K"}</button>
            <button onClick={() => { setSingleDevOnly(!singleDevOnly); setCurrentPage(1); }} className="chip" data-on={singleDevOnly}>{dict.singleDev}</button>
            <button onClick={onToggleAudio} className="chip" data-on={audioEnabled}>{audioEnabled ? dict.alertAudioOn : dict.alertAudioOff}</button>
          </div>

          {/* Quick Track BSC Contract */}
          <div className="flex items-center gap-1.5 flex-1 max-w-sm">
            <input
              type="text"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrack()}
              placeholder={dict.trackCustomPh}
              suppressHydrationWarning
              className="field h-10"
            />
            <button
              onClick={handleTrack}
              disabled={isTracking || !customInput.trim()}
              className="btn btn-solid h-10"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isTracking ? '...' : dict.trackContractBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="panel overflow-hidden">
        {/* Active Filter Mode Status Indicator */}
        <div className="px-4 py-2 bg-[var(--color-field)] border-b border-[var(--color-line)] flex items-center justify-between text-xs text-[var(--color-muted)] font-mono">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-[var(--color-ink)]">
              {filterType === 'dex-active' && `💧 With DEX Liquidity: Displaying all ${filteredTokens.length} tokens sorted by DEX pool liquidity & activity`}
              {filterType === 'top10-gainers' && `🚀 Top Gainers: Displaying all ${filteredTokens.length} tokens ranked by 24h price percentage change`}
              {filterType === 'top10-mcap' && `🏆 Top Market Cap: Displaying all ${filteredTokens.length} tokens sorted from highest to lowest valuation`}
              {filterType === 'top10-vol' && `⚡ Top 24h Volume: Displaying all ${filteredTokens.length} tokens sorted by PancakeSwap & BSC volume`}
              {filterType === 'newest' && `🆕 Newest Releases: Displaying all ${filteredTokens.length} tokens sorted by launch block`}
              {filterType === 'recent-buy' && `💸 Recent Buy: Displaying ${filteredTokens.length} tokens ordered by latest recorded buy transaction`}
              {filterType === 'all' && `🌐 All Tokens: Displaying ${filteredTokens.length} tokens (Page ${validPage} of ${totalPages})`}
              {filterType === 'serial-dev' && `🚨 Dev Clusters: Displaying ${filteredTokens.length} tokens from multi-token deployers`}
              {filterType === 'top10-potential' && `🤖 Agent Score: Displaying ${filteredTokens.length} tokens sorted by composite AI rating`}
            </span>
          </div>
          <span className="text-[11px] opacity-75 hidden sm:inline">
            Page {validPage} of {totalPages} ({filteredTokens.length} total)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left text-[13px] text-[var(--color-ink)]">
            <thead className="border-b border-[var(--color-line)] text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
              <tr>
                <th
                  onClick={() => handleSort('rank')}
                  className="sticky left-0 z-20 bg-[var(--color-field)] px-4 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{dict.thRank}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th className="px-4 py-3 text-[var(--color-muted)]">
                  <div className="flex items-center gap-1.5">
                    <span>Thesis</span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('priceUsd')}
                  className="px-4 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{dict.thPrice}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                {TIMEFRAMES.map((tf) => (
                  <th
                    key={tf.key}
                    onClick={() => handleSort(tf.key)}
                    className="px-3 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>{tf.title}</span>
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </div>
                  </th>
                ))}
                <th
                  onClick={() => handleSort('marketCap')}
                  className="px-4 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{dict.thMcap}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('volume24h')}
                  className="px-4 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{dict.thVol}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('liquidityUsd')}
                  className="px-4 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{dict.thLiq}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('creatorLaunchCount')}
                  className="px-4 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{dict.thDev}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('agentScore')}
                  className="px-4 py-3 cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{dict.thScore}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-right font-mono">{dict.thActions}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--color-line)]">
              {pagedTokens.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-[var(--color-muted)]">
                    <div className="text-sm font-medium text-[var(--color-muted)]">
                      {filterType === 'top10-gainers'
                        ? 'No priced 24h gainers yet. brew.family does not publish change, so this list fills from DexScreener quotes.'
                        : 'No tokens found matching the current search filters.'}
                    </div>
                    {searchQuery && (
                      <button
                        onClick={() => onLiveSearch(searchQuery)}
                        className="mt-3.5 px-4 py-2 text-xs font-mono font-bold rounded-lg btn btn-solid"
                      >
                        Search Live on Brew.family &amp; BSC
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                pagedTokens.map((t, idx) => {
                  const globalIdx = startIdx + idx + 1;
                  const cAddr = (t.creator || '').toLowerCase().trim();
                  const devCount = cAddr ? Math.max(t.creatorLaunchCount || 1, devCounts[cAddr] || 1) : (t.creatorLaunchCount || 1);
                  const thesisEntries = thesisByToken?.[t.address.toLowerCase()] ?? [];
                  const isExpanded = expandedToken === t.address.toLowerCase();
                  const isComposerOpen = !!openThesisComposer[t.address.toLowerCase()];
                  const sortedEntries = [...thesisEntries].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
                  const featuredEntry = sortedEntries[0] ?? null;
                  const hiddenEntries = sortedEntries.slice(1);

                  return (
                    <React.Fragment key={t.address}>
                      <tr className="transition-colors hover:bg-white/[0.03]">
                        <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-4 py-3 shadow-[1px_0_0_rgba(244,241,234,0.08)]">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-[var(--color-muted)] text-[11px] w-6 font-bold group-hover:text-[var(--color-copper)] transition-colors">
                              #{globalIdx}
                            </span>
                            <TokenAvatar
                              symbol={t.symbol}
                              address={t.address}
                              logoUrl={t.logoUrl}
                              fallbackLogoUrl={t.fallbackLogoUrl}
                              onchainArtworkContract={t.onchainArtworkContract}
                              size="md"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[var(--color-ink)] flex items-center gap-1.5 flex-wrap">
                                <span className="group-hover:text-[var(--color-copper)] transition-colors font-mono font-black">{t.symbol}</span>
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-[var(--color-field)] text-[var(--color-muted)] border-[var(--color-line)]">
                                  /{t.quoteSymbol || 'WBNB'}
                                </span>
                                {globalIdx <= 3 && filterType === 'newest' && (
                                  <span className="text-[9px] font-mono font-extrabold px-1.5 py-0.2 rounded bg-emerald-950 text-[var(--color-up)] border border-emerald-500/50">
                                    NEW
                                  </span>
                                )}
                                {filterType === 'top10-gainers' && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500 text-stone-950 shadow-sm">
                                    #{globalIdx}
                                  </span>
                                )}
                                {filterType === 'dex-active' && (t.liquidityUsd > 0 || (t.pool && t.pool !== '')) && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                                    DEX
                                  </span>
                                )}
                                {filterType === 'top10-mcap' && globalIdx <= 5 && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-950 text-[var(--color-copper)] border border-[var(--color-line)]">
                                    #{globalIdx}
                                  </span>
                                )}
                                {filterType === 'top10-vol' && globalIdx <= 5 && (
                                  <span className="num text-[11px] text-[var(--color-muted)]">
                                    #{globalIdx}
                                  </span>
                                )}
                              </div>
                              <div className="max-w-[160px] truncate text-[12px] text-[var(--color-muted)]" title={t.name}>
                                {t.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="align-top px-3 py-3">
                          <div className="min-w-[260px] max-w-[340px] rounded-xl border border-[var(--color-line)] bg-[var(--color-field)] p-2.5">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="text-[9px] font-mono font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                {thesisEntries.length > 0 ? 'Recent thesis' : 'No thesis'}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setExpandedToken((current) => current === t.address.toLowerCase() ? null : t.address.toLowerCase())}
                                  className="text-[9px] font-mono text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                                >
                                  {isExpanded ? 'Hide thesis' : 'View all thesis'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const key = t.address.toLowerCase();
                                    setOpenThesisComposer(prev => ({ ...prev, [key]: !prev[key] }));
                                    setExpandedToken(key);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md bg-[var(--color-copper)] px-2 py-1 text-[9px] font-bold text-stone-950"
                                >
                                  <Plus className="h-3 w-3" />
                                  Create
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {featuredEntry ? (
                                <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="rounded-full bg-[var(--color-copper)] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-stone-950">
                                      Top thesis
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (featuredEntry && !!currentUserId && featuredEntry.createdById !== currentUserId && !(featuredEntry.likedBy ?? []).includes(currentUserId)) {
                                          onLikeThesis?.(t, featuredEntry.id);
                                        }
                                      }}
                                      disabled={!!currentUserId && (featuredEntry.createdById === currentUserId || (featuredEntry.likedBy ?? []).includes(currentUserId))}
                                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${
                                        !!currentUserId && featuredEntry.createdById !== currentUserId && !(featuredEntry.likedBy ?? []).includes(currentUserId)
                                          ? 'border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-copper)]'
                                          : 'cursor-not-allowed border-[var(--color-line)] text-[var(--color-muted)] opacity-70'
                                      }`}
                                    >
                                      <span className={(featuredEntry.likes ?? 0) > 0 ? 'text-[var(--color-copper)]' : 'text-[var(--color-muted)]'}>♥</span>
                                      <span>{featuredEntry.likes ?? 0}</span>
                                    </button>
                                  </div>

                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <div className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-field)] text-[8px] font-bold text-[var(--color-copper)]">
                                        {featuredEntry.createdByAvatarUrl ? (
                                          <img src={featuredEntry.createdByAvatarUrl} alt={featuredEntry.createdByDisplayName || featuredEntry.createdBy || 'Anonymous'} className="h-full w-full object-cover" />
                                        ) : (
                                          getInitials(featuredEntry.createdByDisplayName || featuredEntry.createdBy || 'Anonymous')
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="truncate text-[9px] font-bold text-[var(--color-ink)]">{featuredEntry.createdByDisplayName || featuredEntry.createdBy || 'Anonymous'}</div>
                                        <div className="text-[8px] text-[var(--color-muted)]">
                                          {new Date(featuredEntry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-1 text-[9px] font-bold text-[var(--color-ink)]">{featuredEntry.title}</div>
                                  <div className="mt-1 max-h-20 overflow-hidden text-[9px] leading-4 text-[var(--color-muted)]">{featuredEntry.content}</div>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2 text-[9px] text-[var(--color-muted)]">
                                  No thesis yet for {t.symbol}
                                </div>
                              )}

                              {isExpanded && hiddenEntries.length > 0 && (
                                <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                                  {hiddenEntries.map((entry) => {
                                    const authorDisplayName = entry.createdByDisplayName || entry.createdBy || 'Anonymous';
                                    const authorAvatar = entry.createdByAvatarUrl || '';
                                    const hasUserLiked = !!currentUserId && (entry.likedBy ?? []).includes(currentUserId);
                                    const isOwnThesis = !!currentUserId && entry.createdById === currentUserId;
                                    const canLike = !!currentUserId && !isOwnThesis && !hasUserLiked;
                                    const isLiked = (entry.likes ?? 0) > 0;
                                    return (
                                      <div key={entry.id} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                          <span className="text-[7px] font-mono uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                            Thesis
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (canLike) onLikeThesis?.(t, entry.id);
                                            }}
                                            disabled={!canLike}
                                            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${
                                              canLike
                                                ? 'border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-copper)]'
                                                : 'cursor-not-allowed border-[var(--color-line)] text-[var(--color-muted)] opacity-70'
                                            }`}
                                          >
                                            <span className={isLiked ? 'text-[var(--color-copper)]' : 'text-[var(--color-muted)]'}>♥</span>
                                            <span>{entry.likes ?? 0}</span>
                                          </button>
                                        </div>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <div className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-field)] text-[8px] font-bold text-[var(--color-copper)]">
                                              {authorAvatar ? (
                                                <img src={authorAvatar} alt={authorDisplayName} className="h-full w-full object-cover" />
                                              ) : (
                                                getInitials(authorDisplayName)
                                              )}
                                            </div>
                                            <div className="min-w-0">
                                              <div className="truncate text-[9px] font-bold text-[var(--color-ink)]">{authorDisplayName}</div>
                                              <div className="text-[8px] text-[var(--color-muted)]">
                                                {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="mt-1 text-[9px] font-bold text-[var(--color-ink)]">{entry.title}</div>
                                        <div className="mt-1 max-h-20 overflow-hidden text-[9px] leading-4 text-[var(--color-muted)]">{entry.content}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {isComposerOpen && (
                                <div className="space-y-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
                                  <input
                                    value={thesisDrafts[t.address]?.title ?? ''}
                                    onChange={(event) => {
                                      const next = { ...(thesisDrafts[t.address] ?? { title: '', content: '' }), title: event.target.value };
                                      setThesisDrafts(prev => ({ ...prev, [t.address]: next }));
                                    }}
                                    placeholder="Thesis title"
                                    className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-field)] px-2 py-1 text-[9px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)]"
                                  />
                                  <textarea
                                    value={thesisDrafts[t.address]?.content ?? ''}
                                    onChange={(event) => {
                                      const next = { ...(thesisDrafts[t.address] ?? { title: '', content: '' }), content: event.target.value };
                                      setThesisDrafts(prev => ({ ...prev, [t.address]: next }));
                                    }}
                                    rows={2}
                                    placeholder="Add a thesis for this token..."
                                    className="w-full resize-none rounded-md border border-[var(--color-line)] bg-[var(--color-field)] px-2 py-1 text-[9px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const draft = thesisDrafts[t.address] ?? { title: '', content: '' };
                                      onAddThesis?.(t, draft.title, draft.content);
                                      setThesisDrafts(prev => ({ ...prev, [t.address]: { title: '', content: '' } }));
                                      setOpenThesisComposer(prev => ({ ...prev, [t.address.toLowerCase()]: false }));
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md bg-[var(--color-copper)] px-2 py-1 text-[9px] font-bold text-stone-950"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Save thesis
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono font-bold text-[var(--color-ink)]">
                          {formatUsd(t.priceUsd > 0 ? t.priceUsd : (t.marketCap > 0 ? t.marketCap / 1000000000 : 0))}
                        </td>

                        {TIMEFRAMES.map((tf) => (
                          <ChangeCell
                            key={tf.key}
                            title={tf.title}
                            change={t[tf.key]}
                            txLabel={tf.tx}
                            buys={t[tf.buys]}
                            sells={t[tf.sells]}
                          />
                        ))}

                        <td className="px-4 py-3 font-mono font-semibold text-[var(--color-ink)]">{formatUsd(t.marketCap)}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-[var(--color-ink)]">{formatUsd(t.volume24h)}</td>
                        <td className="px-4 py-3">
                          <div className="font-mono font-semibold text-[var(--color-ink)]">
                            {t.liquidityUsd > 0 ? formatUsd(t.liquidityUsd) : <span className="text-[var(--color-muted)] text-[11px] font-normal">$4.9K Base</span>}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <a
                              href={t.dexUrl || `https://dexscreener.com/bsc/${t.pool || t.address}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 hover:underline"
                              title={`DEX Pool: ${t.pool || t.address}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>DEX Pool</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div
                            onClick={() => t.creator && onFilterByDev(t.creator)}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            title="Click to filter by developer"
                          >
                            {devCount >= 4 ? (
                              <span className="num text-[12px] text-[var(--color-down)]">Serial {devCount}</span>
                            ) : devCount > 1 ? (
                              <span className="num text-[12px] text-[var(--color-copper)]">Multi {devCount}</span>
                            ) : (
                              <span className="num text-[12px] text-[var(--color-up)]">Single</span>
                            )}
                            <div className="text-[10px] font-mono text-[var(--color-muted)] mt-0.5">
                              {truncateAddr(t.creator)}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="num text-[13px] text-[var(--color-ink)]">{t.agentScore}</div>
                          <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full bg-[var(--color-copper)]"
                              style={{ width: `${Math.min(t.agentScore, 100)}%` }}
                            />
                          </div>
                        </td>

                        <td className="bg-[var(--color-surface)] px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {onOpenTokenSniffer && (
                              <button
                                onClick={() => onOpenTokenSniffer(t)}
                                className="btn h-8 px-2 text-[12px] text-amber-400 hover:text-amber-300"
                                title="GoPlus Security & Pair Audit"
                              >
                                🛡️
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedToken((current) => current === t.address.toLowerCase() ? null : t.address.toLowerCase())}
                              className="btn h-8 px-2.5 text-[11px] text-[var(--color-ink)] border border-[var(--color-line)]"
                            >
                              Thesis {thesisEntries.length > 0 ? `(${thesisEntries.length})` : ''}
                            </button>
                            <button
                              onClick={() => onAnalyze(t)}
                              className="btn h-8 px-3 text-[12px]"
                            >
                              {dict.btnAnalyze}
                            </button>
                            <button
                              onClick={() => onTrade(t)}
                              className="btn btn-solid h-8 px-3 text-[12px]"
                            >
                              {dict.btnSwap}
                            </button>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-xs font-mono text-[var(--color-muted)]">
          Page <strong className="text-[var(--color-ink)]">{validPage}</strong> of {totalPages} ({filteredTokens.length.toLocaleString()} tokens)
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={validPage <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-bold rounded-lg bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)]/90 hover:text-[var(--color-ink)] hover:bg-[var(--color-line)] hover:border-amber-600/50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{dict.prevPage}</span>
          </button>

          <span className="font-mono text-xs font-bold text-stone-950 bg-amber-400 px-2.5 py-0.5 rounded shadow-sm">
            {validPage} / {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={validPage >= totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-bold rounded-lg bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)]/90 hover:text-[var(--color-ink)] hover:bg-[var(--color-line)] hover:border-amber-600/50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <span>{dict.nextPage}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
