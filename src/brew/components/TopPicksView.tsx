import React from 'react';
import { Token, Language } from '../types.ts';
import { formatUsd } from '../utils/format.ts';
import { TokenAvatar } from './TokenAvatar.tsx';
import { HallOfFamePodium } from './HallOfFamePodium.tsx';
import { I18N } from '../i18n.ts';
import { Award } from 'lucide-react';

interface TopPicksViewProps {
  tokens: Token[];
  lang?: Language;
  onAnalyze: (token: Token) => void;
  onTrade: (token: Token) => void;
}

export const TopPicksView: React.FC<TopPicksViewProps> = ({
  tokens,
  lang = 'en',
  onAnalyze,
  onTrade
}) => {
  const dict = I18N[lang] || I18N.en;

  const sorted = [...tokens]
    .filter(t => t.volume24h > 0 || t.liquidityUsd > 200 || (t.marketCap || 0) > 0)
    .sort((a, b) => (b.agentScore || 0) - (a.agentScore || 0))
    .slice(0, 15);

  const getRankingsTitle = () => {
    if (lang === 'zh') return '高确定性精选榜单 (Top 15)';
    if (lang === 'ja') return '高確信レーダーランキング (Top 15)';
    return 'High-Conviction Radar Rankings (Top 15)';
  };

  const getRankingsSubtitle = () => {
    if (lang === 'zh') return '综合 AI 评分排序';
    if (lang === 'ja') return '総合AIスコア順';
    return 'Sorted by Composite Agent Score';
  };

  const getVerdictHeader = () => {
    if (lang === 'zh') return 'Agent 研判';
    if (lang === 'ja') return 'Agent 判定';
    return 'Agent Verdict';
  };

  const getSignalsHeader = () => {
    if (lang === 'zh') return '核心战术信号';
    if (lang === 'ja') return '戦術シグナル';
    return 'Primary Signals';
  };

  const getLoadingMsg = () => {
    if (lang === 'zh') return '正在加载精选代币...';
    if (lang === 'ja') return '厳選トークンを読み込み中...';
    return 'Loading Agent top picks...';
  };

  const getActivePairLabel = () => {
    if (lang === 'zh') return '活跃交易对';
    if (lang === 'ja') return 'アクティブ取引ペア';
    return 'Active Pair';
  };

  return (
    <div className="space-y-6 mb-8">
      {/* 3 PODIUM HALL OF FAME SHOWCASE */}
      <HallOfFamePodium
        tokens={tokens}
        lang={lang}
        onAnalyze={onAnalyze}
        onTrade={onTrade}
      />

      {/* Leaderboard Table Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-[var(--color-copper)] border border-amber-500/20">
              <Award className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[var(--color-ink)] uppercase tracking-wide font-mono">
              {getRankingsTitle()}
            </h3>
          </div>
          <span className="text-xs text-[var(--color-muted)]">
            {getRankingsSubtitle()}
          </span>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl overflow-x-auto shadow-2xl shadow-black/60">
          <table className="w-full min-w-[900px] text-left text-xs text-[var(--color-muted)]">
            <thead className="bg-[var(--color-field)] text-[var(--color-copper)]/90 uppercase tracking-wider text-[10px] font-mono font-bold border-b border-[var(--color-line)]">
              <tr>
                <th className="sticky left-0 z-20 bg-[var(--color-field)] px-4 py-3.5">{dict.thToken}</th>
                <th className="px-4 py-3.5">{dict.thPrice}</th>
                <th className="px-4 py-3.5">{dict.thMarketCap}</th>
                <th className="px-4 py-3.5">{dict.thLiquidity}</th>
                <th className="px-4 py-3.5">{dict.thVolume24h}</th>
                <th className="px-4 py-3.5">{getVerdictHeader()}</th>
                <th className="px-4 py-3.5">{getSignalsHeader()}</th>
                <th className="px-4 py-3.5 text-right font-mono">{dict.thActions}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--color-line)]">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-[var(--color-muted)]">
                    {getLoadingMsg()}
                  </td>
                </tr>
              ) : (
                sorted.map(t => {
                  const score = t.agentScore || 40;
                  const price = t.priceUsd > 0 ? t.priceUsd : (t.marketCap > 0 ? t.marketCap / 1000000000 : 0);
                  return (
                    <tr key={t.address} className="hover:bg-[var(--color-line)] transition-colors">
                      <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-4 py-3 shadow-[1px_0_0_rgba(244,241,234,0.08)]">
                        <div className="flex items-center gap-2.5">
                          <TokenAvatar
                            symbol={t.symbol}
                            address={t.address}
                            logoUrl={t.logoUrl}
                            fallbackLogoUrl={t.fallbackLogoUrl}
                            onchainArtworkContract={t.onchainArtworkContract}
                            size="md"
                          />
                          <div>
                            <div className="font-bold text-[var(--color-ink)] font-mono flex items-center gap-1.5">
                              <span>${t.symbol}</span>
                              <span className="text-[9px] font-mono text-[var(--color-muted)] bg-[var(--color-field)] border border-[var(--color-line)] px-1 py-0.2 rounded flex items-center gap-0.5">
                                <span>/{t.quoteSymbol || 'WBNB'}</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              </span>
                            </div>
                            <div className="text-[11px] text-[var(--color-muted)] max-w-[120px] truncate">{t.name}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono font-bold text-[var(--color-ink)]">{formatUsd(price)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--color-ink)]">{formatUsd(t.marketCap)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--color-ink)]">{formatUsd(t.liquidityUsd)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--color-ink)]">{formatUsd(t.volume24h)}</td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 font-mono font-bold text-[10px] px-2 py-0.5 rounded border ${
                            score >= 70
                              ? 'bg-emerald-950 text-[var(--color-up)] border-emerald-600/40'
                              : 'bg-amber-950 text-[var(--color-copper)] border-[var(--color-line)]'
                          }`}
                        >
                          {t.agentVerdict} ({score})
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[var(--color-muted)] text-[11px] max-w-[220px] truncate font-mono">
                        {(t.agentSignals || []).join(' • ') || getActivePairLabel()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => onAnalyze(t)}
                            className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg bg-[var(--color-field)] text-[var(--color-copper)] border border-[var(--color-line)] hover:bg-amber-500 hover:text-stone-950 transition-all cursor-pointer"
                          >
                            {dict.btnAnalyze}
                          </button>
                          <button
                            onClick={() => onTrade(t)}
                            className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg btn btn-solid"
                          >
                            {dict.btnSwap}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
