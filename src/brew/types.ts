export interface Token {
  index: number;
  address: string;
  pool: string;
  creator: string;
  creatorLaunchCount: number;
  name: string;
  symbol: string;
  quoteSymbol: string;
  quoteAddress?: string;
  quoteName?: string;
  launchedAt: number;
  blockNumber: number;
  txHash: string;
  lastBuyAt?: number;
  lastBuyBlockNumber?: number;
  lastBuyLogIndex?: number;
  logoUrl: string;
  fallbackLogoUrl: string;
  onchainArtworkContract?: string;
  description?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
  priceUsd: number;
  /** Null until a 24h quote exists. brew.family does not publish this field. */
  priceChange5m?: number | null;
  priceChange1h?: number | null;
  priceChange6h?: number | null;
  priceChange24h: number | null;
  volume24h: number;
  liquidityUsd: number;
  marketCap: number;
  buys5m?: number;
  sells5m?: number;
  buys1h?: number;
  sells1h?: number;
  buys6h?: number;
  sells6h?: number;
  buys24h: number;
  sells24h: number;
  totalBuys?: number;
  totalSells?: number;
  buyRatio: number;
  agentScore: number;
  potentialScore?: number;
  agentVerdict: string;
  agentSignals: string[];
  dexUrl: string;
  brewUrl: string;
  bubblemapsUrl: string;
  bscscanTokenUrl: string;
  bscscanCreatorUrl: string;
  bscscanTxUrl: string;
  otherDevTokens?: any[];
}

export interface QuoteSecurityInfo {
  address: string;
  symbol: string;
  name: string;
  is_honeypot?: string;
  cannot_sell_all?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_airdrop_scam?: string;
  is_blacklisted?: string;
  is_open_source?: string;
  creator_address?: string;
  creator_percent?: string;
  holder_count?: string;
}

export interface MarketStats {
  totalTrackedVol: number;
  totalTrackedMcap: number;
  activePairs: number;
  multiTokenDevs: number;
}

export interface TokensPayload {
  totalLaunches: number;
  factory: string;
  updatedAt: number;
  stats: MarketStats;
  tokens: Token[];
}

export type ViewTab = 'radar' | 'copilot' | 'picks' | 'devs' | 'chat';
export type FilterType = 'all' | 'newest' | 'recent-buy' | 'dex-active' | 'top10-gainers' | 'top10-mcap' | 'top10-vol' | 'top10-potential' | 'serial-dev' | 'watchlist';
export type SortKey = 'rank' | 'priceUsd' | 'priceChange5m' | 'priceChange1h' | 'priceChange6h' | 'priceChange24h' | 'marketCap' | 'volume24h' | 'liquidityUsd' | 'creatorLaunchCount' | 'agentScore';
export type Language = 'en' | 'zh' | 'ja';

export interface VisitorStats {
  activeVisitors: number;
  totalVisits: number;
  uniqueVisitors: number;
  lastVisitAt?: string;
}

export interface AudioAlertConfig {
  enabled: boolean;
  volume: number; // 0.05 to 1.0
  filter: 'all' | 'liq500' | 'singleDev';
}

export interface TimeframeChanges {
  m5: number | null;
  h1: number | null;
  h6: number | null;
  h24: number | null;
}

export interface TimeframeTransactions {
  m5: { buys: number; sells: number };
  h1: { buys: number; sells: number };
  h6: { buys: number; sells: number };
  h24: { buys: number; sells: number };
  totalBuys: number;
  totalSells: number;
}

