import { createFileRoute } from "@tanstack/react-router";
import { persistTokenSales, readRecentTokenSales } from "@/brew/server/supabase-storage.server";

interface BrewSale {
  tokenAddress: string;
  poolAddress: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  time: number;
}

const SALES_URL = "https://brew.family/api/shared/launches/sales";
const CACHE_TTL_MS = 2_500;

let cachedSales: { at: number; sales: BrewSale[] } | null = null;
let pendingSales: Promise<BrewSale[]> | null = null;

async function loadSales(): Promise<BrewSale[]> {
  if (cachedSales && Date.now() - cachedSales.at < CACHE_TTL_MS) {
    return cachedSales.sales;
  }
  if (pendingSales) return pendingSales;

  pendingSales = (async () => {
    const response = await fetch(SALES_URL, {
      headers: { accept: "application/json", "user-agent": "AgentBREW/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Brew sales feed returned ${response.status}`);

    const body = await response.json();
    const sales = Array.isArray(body?.sales)
      ? body.sales.filter((sale: Partial<BrewSale>) =>
          /^0x[a-f0-9]{40}$/i.test(String(sale.tokenAddress || "")) &&
          Number.isFinite(Number(sale.time))
        )
      : [];

    cachedSales = { at: Date.now(), sales };
    return sales;
  })().finally(() => {
    pendingSales = null;
  });

  return pendingSales;
}

export const Route = createFileRoute("/api/sales")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sales = await loadSales();
          try {
            await persistTokenSales(sales);
          } catch (error) {
            console.warn("[supabase] token sales persistence failed:", error);
          }
          return Response.json(
            { sales, updatedAt: Date.now() },
            { headers: { "cache-control": "no-store" } }
          );
        } catch {
          if (cachedSales) {
            return Response.json(
              { sales: cachedSales.sales, updatedAt: cachedSales.at, stale: true },
              { headers: { "cache-control": "no-store" } }
            );
          }
          const sales = await readRecentTokenSales();
          if (sales.length > 0) {
            return Response.json(
              { sales, updatedAt: Date.now(), stale: true, source: "supabase_cache" },
              { headers: { "cache-control": "no-store" } }
            );
          }
          return Response.json({ sales: [], error: "Brew sales feed unavailable" }, { status: 502 });
        }
      },
    },
  },
});