import type { Token } from "../types.ts";

type VisitorSummary = {
  total_visits: number;
  unique_visitors: number;
  active_visitors: number;
  last_visit_at: string | null;
};

type SaleEvent = {
  tokenAddress: string;
  poolAddress?: string;
  transactionHash: string;
  blockNumber: number;
  blockHash?: string;
  logIndex: number;
  time: number;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

async function supabaseRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<T | null> {
  const config = supabaseConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.prefer ? { prefer: options.prefer } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${message.slice(0, 240)}`);
  }
  if (response.status === 204) return null;
  return (await response.json()) as T;
}

function tokenRow(token: Token) {
  return {
    address: token.address.toLowerCase(),
    token_index: token.index,
    pool: token.pool || "",
    creator: token.creator || "",
    creator_launch_count: token.creatorLaunchCount || 1,
    name: token.name,
    symbol: token.symbol,
    quote_symbol: token.quoteSymbol || "WBNB",
    quote_address: token.quoteAddress || null,
    quote_name: token.quoteName || null,
    launched_at_ms: token.launchedAt,
    block_number: token.blockNumber || 0,
    tx_hash: token.txHash || "",
    last_buy_at_ms: token.lastBuyAt ?? null,
    last_buy_block_number: token.lastBuyBlockNumber ?? null,
    last_buy_log_index: token.lastBuyLogIndex ?? null,
    logo_url: token.logoUrl || "",
    fallback_logo_url: token.fallbackLogoUrl || "",
    onchain_artwork_contract: token.onchainArtworkContract || null,
    description: token.description || null,
    twitter_url: token.twitterUrl || null,
    website_url: token.websiteUrl || null,
    telegram_url: token.telegramUrl || null,
    price_usd: token.priceUsd || 0,
    price_change_5m: token.priceChange5m ?? null,
    price_change_1h: token.priceChange1h ?? null,
    price_change_6h: token.priceChange6h ?? null,
    price_change_24h: token.priceChange24h ?? null,
    volume_24h: token.volume24h || 0,
    liquidity_usd: token.liquidityUsd || 0,
    market_cap_usd: token.marketCap || 0,
    buys_5m: token.buys5m || 0,
    sells_5m: token.sells5m || 0,
    buys_1h: token.buys1h || 0,
    sells_1h: token.sells1h || 0,
    buys_6h: token.buys6h || 0,
    sells_6h: token.sells6h || 0,
    buys_24h: token.buys24h || 0,
    sells_24h: token.sells24h || 0,
    total_buys: token.totalBuys || 0,
    total_sells: token.totalSells || 0,
    buy_ratio: token.buyRatio || 1,
    agent_score: token.agentScore || 0,
    potential_score: token.potentialScore ?? null,
    agent_verdict: token.agentVerdict || "",
    agent_signals: token.agentSignals || [],
    dex_url: token.dexUrl || "",
    brew_url: token.brewUrl || "",
    bubblemaps_url: token.bubblemapsUrl || "",
    bscscan_token_url: token.bscscanTokenUrl || "",
    bscscan_creator_url: token.bscscanCreatorUrl || "",
    bscscan_tx_url: token.bscscanTxUrl || "",
    other_dev_tokens: token.otherDevTokens ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function persistTokenSnapshot(tokens: Token[]): Promise<void> {
  if (!supabaseConfig() || tokens.length === 0) return;
  const rows = tokens.filter((token) => /^0x[a-f0-9]{40}$/i.test(token.address)).map(tokenRow);
  for (let offset = 0; offset < rows.length; offset += 200) {
    await supabaseRequest<null>("tokens?on_conflict=address", {
      method: "POST",
      body: rows.slice(offset, offset + 200),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function readTokenSnapshot() {
  if (!supabaseConfig()) return null;
  const rows = await supabaseRequest<Record<string, unknown>[]>(
    "tokens?select=*&order=launched_at_ms.desc&limit=5000",
  );
  if (!rows?.length) return null;

  const tokens: Token[] = rows.map((row) => ({
    index: numberValue(row.token_index),
    address: String(row.address || ""),
    pool: String(row.pool || ""),
    creator: String(row.creator || ""),
    creatorLaunchCount: numberValue(row.creator_launch_count, 1),
    name: String(row.name || "Brew Token"),
    symbol: String(row.symbol || "BREW"),
    quoteSymbol: String(row.quote_symbol || "WBNB"),
    quoteAddress: typeof row.quote_address === "string" ? row.quote_address : undefined,
    quoteName: typeof row.quote_name === "string" ? row.quote_name : undefined,
    launchedAt: numberValue(row.launched_at_ms, Date.now()),
    blockNumber: numberValue(row.block_number),
    txHash: String(row.tx_hash || ""),
    lastBuyAt: row.last_buy_at_ms == null ? undefined : numberValue(row.last_buy_at_ms),
    lastBuyBlockNumber: row.last_buy_block_number == null ? undefined : numberValue(row.last_buy_block_number),
    lastBuyLogIndex: row.last_buy_log_index == null ? undefined : numberValue(row.last_buy_log_index),
    logoUrl: String(row.logo_url || ""),
    fallbackLogoUrl: String(row.fallback_logo_url || ""),
    onchainArtworkContract: typeof row.onchain_artwork_contract === "string" ? row.onchain_artwork_contract : undefined,
    description: typeof row.description === "string" ? row.description : undefined,
    twitterUrl: typeof row.twitter_url === "string" ? row.twitter_url : undefined,
    websiteUrl: typeof row.website_url === "string" ? row.website_url : undefined,
    telegramUrl: typeof row.telegram_url === "string" ? row.telegram_url : undefined,
    priceUsd: numberValue(row.price_usd),
    priceChange5m: row.price_change_5m == null ? null : numberValue(row.price_change_5m),
    priceChange1h: row.price_change_1h == null ? null : numberValue(row.price_change_1h),
    priceChange6h: row.price_change_6h == null ? null : numberValue(row.price_change_6h),
    priceChange24h: row.price_change_24h == null ? null : numberValue(row.price_change_24h),
    volume24h: numberValue(row.volume_24h),
    liquidityUsd: numberValue(row.liquidity_usd),
    marketCap: numberValue(row.market_cap_usd),
    buys5m: numberValue(row.buys_5m),
    sells5m: numberValue(row.sells_5m),
    buys1h: numberValue(row.buys_1h),
    sells1h: numberValue(row.sells_1h),
    buys6h: numberValue(row.buys_6h),
    sells6h: numberValue(row.sells_6h),
    buys24h: numberValue(row.buys_24h),
    sells24h: numberValue(row.sells_24h),
    totalBuys: numberValue(row.total_buys),
    totalSells: numberValue(row.total_sells),
    buyRatio: numberValue(row.buy_ratio, 1),
    agentScore: numberValue(row.agent_score),
    potentialScore: row.potential_score == null ? undefined : numberValue(row.potential_score),
    agentVerdict: String(row.agent_verdict || ""),
    agentSignals: Array.isArray(row.agent_signals) ? row.agent_signals.map(String) : [],
    dexUrl: String(row.dex_url || ""),
    brewUrl: String(row.brew_url || ""),
    bubblemapsUrl: String(row.bubblemaps_url || ""),
    bscscanTokenUrl: String(row.bscscan_token_url || ""),
    bscscanCreatorUrl: String(row.bscscan_creator_url || ""),
    bscscanTxUrl: String(row.bscscan_tx_url || ""),
    otherDevTokens: Array.isArray(row.other_dev_tokens) ? row.other_dev_tokens : undefined,
  }));

  const summaries = await supabaseRequest<Record<string, unknown>[]>("token_market_stats?select=*&limit=1");
  const summary = summaries?.[0];
  return {
    tokens,
    totalLaunches: numberValue(summary?.total_tokens, tokens.length),
    factory: "0xeea6c3bfb29fd9a35380438956bae7b109c63d85",
    updatedAt: Math.max(...rows.map((row) => Date.parse(String(row.updated_at || "")) || 0)),
    stats: {
      totalTrackedVol: numberValue(summary?.total_tracked_volume_24h),
      totalTrackedMcap: numberValue(summary?.total_tracked_market_cap),
      activePairs: numberValue(summary?.active_pairs),
      multiTokenDevs: numberValue(summary?.multi_token_devs),
    },
    source: "supabase_cache",
  };
}

export async function persistTokenSales(sales: SaleEvent[]): Promise<void> {
  if (!supabaseConfig() || sales.length === 0) return;
  const candidates = sales.filter(
    (sale) => /^0x[a-f0-9]{40}$/i.test(sale.tokenAddress) && sale.transactionHash,
  );
  const addresses = [...new Set(candidates.map((sale) => sale.tokenAddress.toLowerCase()))];
  const addressFilter = addresses.map((address) => `"${address}"`).join(",");
  const existingTokens = await supabaseRequest<Array<{ address: string }>>(
    `tokens?select=address&address=in.(${encodeURIComponent(addressFilter)})`,
  );
  const knownAddresses = new Set((existingTokens || []).map((token) => token.address.toLowerCase()));
  const rows = candidates
    .filter((sale) => knownAddresses.has(sale.tokenAddress.toLowerCase()))
    .map((sale) => ({
      transaction_hash: sale.transactionHash,
      log_index: sale.logIndex,
      token_address: sale.tokenAddress.toLowerCase(),
      pool_address: sale.poolAddress || "",
      block_number: sale.blockNumber,
      block_hash: sale.blockHash || "",
      event_at: new Date(sale.time).toISOString(),
    }));

  for (let offset = 0; offset < rows.length; offset += 200) {
    await supabaseRequest<null>("token_sales?on_conflict=transaction_hash,log_index", {
      method: "POST",
      body: rows.slice(offset, offset + 200),
      prefer: "resolution=ignore-duplicates,return=minimal",
    });
  }
}

export async function readRecentTokenSales(limit = 500): Promise<SaleEvent[]> {
  if (!supabaseConfig()) return [];
  const rows = await supabaseRequest<Record<string, unknown>[]>(
    `token_sales?select=token_address,pool_address,transaction_hash,block_number,block_hash,log_index,event_at&order=event_at.desc&limit=${Math.max(1, Math.min(limit, 2000))}`,
  );
  return (rows ?? []).map((row) => ({
    tokenAddress: String(row.token_address || ""),
    poolAddress: String(row.pool_address || ""),
    transactionHash: String(row.transaction_hash || ""),
    blockNumber: numberValue(row.block_number),
    blockHash: String(row.block_hash || ""),
    logIndex: numberValue(row.log_index),
    time: Date.parse(String(row.event_at || "")) || 0,
  }));
}

export async function persistVisitorPing(input: {
  sessionId: string;
  path: string;
  referrer: string;
  userId?: string;
  username?: string;
  primaryEmail?: string;
  profileImageUrl?: string;
}): Promise<VisitorSummary | null> {
  if (!supabaseConfig()) return null;
  const sessionId = input.sessionId.slice(0, 128);
  const now = new Date().toISOString();
  const encodedId = encodeURIComponent(sessionId);

  await supabaseRequest<null>("visitor_sessions?on_conflict=session_id", {
    method: "POST",
    body: {
      session_id: sessionId,
      user_id: input.userId?.slice(0, 128) || null,
      username: input.username?.slice(0, 200) || "",
      primary_email: input.primaryEmail?.slice(0, 320) || "",
      profile_image_url: input.profileImageUrl?.slice(0, 2000) || "",
      first_seen_at: now,
      last_seen_at: now,
      last_path: input.path.slice(0, 500) || "/",
      referrer: input.referrer.slice(0, 1000),
    },
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
  await supabaseRequest<null>(`visitor_sessions?session_id=eq.${encodedId}`, {
    method: "PATCH",
    body: {
      user_id: input.userId?.slice(0, 128) || null,
      username: input.username?.slice(0, 200) || "",
      primary_email: input.primaryEmail?.slice(0, 320) || "",
      profile_image_url: input.profileImageUrl?.slice(0, 2000) || "",
      last_seen_at: now,
      last_path: input.path.slice(0, 500) || "/",
      referrer: input.referrer.slice(0, 1000),
    },
    prefer: "return=minimal",
  });

  const summaries = await supabaseRequest<VisitorSummary[]>("visitor_summary?select=*&limit=1");
  return summaries?.[0] ?? null;
}

export async function persistVisitorLeave(sessionId: string): Promise<VisitorSummary | null> {
  if (!supabaseConfig() || !sessionId) return null;
  await supabaseRequest<null>(`visitor_sessions?session_id=eq.${encodeURIComponent(sessionId.slice(0, 128))}`, {
    method: "PATCH",
    body: { last_seen_at: new Date(Date.now() - 60_000).toISOString() },
    prefer: "return=minimal",
  });
  const summaries = await supabaseRequest<VisitorSummary[]>("visitor_summary?select=*&limit=1");
  return summaries?.[0] ?? null;
}