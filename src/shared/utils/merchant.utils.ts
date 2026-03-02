/**
 * Merchant normalization utility.
 *
 * Converts raw merchant strings from bank statements into normalized keys
 * and display names. Handles marketplace patterns (e.g. MERCADOPAGO*MERCADOLIBRE),
 * accents, separators, and Chilean city/country suffixes.
 *
 * Usage:
 *   normalizeMerchant("MERCADOPAGO*MERCADOLIBRE Las Condes CL")
 *   → { merchantKey: "mercadolibre", displayName: "MercadoLibre", isMarketplace: true, confidence: 0.95 }
 *
 *   normalizeMerchant("FARMACIA AHUMADA Santiago CL")
 *   → { merchantKey: "farmacia_ahumada", displayName: "FARMACIA AHUMADA", isMarketplace: false, confidence: 0.7 }
 */

export interface MerchantNormalization {
  /** Lowercase key for grouping/matching (e.g. "mercadolibre", "farmacia_ahumada") */
  merchantKey: string;
  /** Human-readable display name */
  displayName: string;
  /** Whether the merchant is a known marketplace (multi-category channel) */
  isMarketplace: boolean;
  /** Confidence of the normalization (0..1) */
  confidence: number;
}

interface MarketplaceEntry {
  pattern: RegExp;
  key: string;
  display: string;
}

/**
 * Known marketplace/aggregator patterns.
 * Order matters: more specific patterns first.
 */
const MARKETPLACE_PATTERNS: MarketplaceEntry[] = [
  {
    pattern: /mercadopago\s*\*\s*mercadolibre/i,
    key: "mercadolibre",
    display: "MercadoLibre",
  },
  { pattern: /mercadopago/i, key: "mercadopago", display: "MercadoPago" },
  { pattern: /mercadolibre/i, key: "mercadolibre", display: "MercadoLibre" },
  { pattern: /amazon/i, key: "amazon", display: "Amazon" },
  { pattern: /aliexpress/i, key: "aliexpress", display: "AliExpress" },
  { pattern: /shein/i, key: "shein", display: "Shein" },
  { pattern: /temu/i, key: "temu", display: "Temu" },
  { pattern: /rappi/i, key: "rappi", display: "Rappi" },
  { pattern: /uber\s*eats/i, key: "ubereats", display: "Uber Eats" },
  { pattern: /pedidos\s*ya/i, key: "pedidosya", display: "PedidosYa" },
  { pattern: /cornershop/i, key: "cornershop", display: "Cornershop" },
  { pattern: /ifood/i, key: "ifood", display: "iFood" },
  { pattern: /didi\s*food/i, key: "didifood", display: "DiDi Food" },
  {
    pattern: /falabella\s*\.?\s*com/i,
    key: "falabella_com",
    display: "Falabella.com",
  },
  { pattern: /paris\s*\.?\s*cl/i, key: "paris_cl", display: "Paris.cl" },
  { pattern: /ripley\s*\.?\s*cl/i, key: "ripley_cl", display: "Ripley.cl" },
  { pattern: /linio/i, key: "linio", display: "Linio" },
];

/**
 * Chilean city and country suffixes to strip from raw merchant names.
 */
const SUFFIX_PATTERN =
  /\s+(cl|chile|santiago|las\s+condes|providencia|vitacura|nunoa|stgo|maipu|san\s+bernardo|la\s+florida|renca|puente\s+alto|lo\s+barnechea)\s*$/i;

/**
 * Removes diacritics from a string (e.g. ñ → n, á → a).
 */
function removeDiacritics(str: string): string {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Normalizes a raw merchant string into a structured result.
 *
 * Steps:
 * 1. Check against known marketplace patterns (high confidence).
 * 2. Strip accents, separators, and Chilean suffixes.
 * 3. Collapse whitespace and produce a snake_case key.
 */
export function normalizeMerchant(merchantRaw: string): MerchantNormalization {
  const cleaned = merchantRaw.trim();

  if (!cleaned) {
    return {
      merchantKey: "unknown",
      displayName: "Desconocido",
      isMarketplace: false,
      confidence: 0,
    };
  }

  // 1. Check marketplace patterns
  for (const mp of MARKETPLACE_PATTERNS) {
    if (mp.pattern.test(cleaned)) {
      return {
        merchantKey: mp.key,
        displayName: mp.display,
        isMarketplace: true,
        confidence: 0.95,
      };
    }
  }

  // 2. Generic normalization
  const withoutSuffix = cleaned.replace(SUFFIX_PATTERN, "").trim();
  const displayName = withoutSuffix
    .replace(/[*]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const merchantKey = removeDiacritics(withoutSuffix)
    .toLowerCase()
    .replace(/[*\-_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\s+/g, "_");

  return {
    merchantKey: merchantKey || "unknown",
    displayName: displayName || cleaned,
    isMarketplace: false,
    confidence: 0.7,
  };
}

/**
 * Checks if a merchantKey matches a given pattern string.
 * The pattern can be:
 *  - An exact match (e.g. "mercadolibre")
 *  - A contains match with wildcards (e.g. "*farmacia*")
 *  - A simple substring match (default behavior)
 */
export function matchesMerchantPattern(
  merchantKey: string,
  pattern: string,
): boolean {
  const normalizedKey = merchantKey.toLowerCase();
  const normalizedPattern = removeDiacritics(pattern.toLowerCase().trim());

  // Exact match
  if (normalizedKey === normalizedPattern) {
    return true;
  }

  // Wildcard match: *pattern* means "contains"
  if (normalizedPattern.startsWith("*") && normalizedPattern.endsWith("*")) {
    const inner = normalizedPattern.slice(1, -1);
    return normalizedKey.includes(inner);
  }

  // Default: substring match
  return normalizedKey.includes(normalizedPattern);
}

/**
 * Checks if any of the keywords appear in the raw merchant string.
 * All keywords must match (AND logic).
 */
export function matchesKeywords(
  merchantRaw: string,
  keywords: string[],
): boolean {
  if (!keywords.length) return true;
  const lower = removeDiacritics(merchantRaw.toLowerCase());
  return keywords.every((kw) =>
    lower.includes(removeDiacritics(kw.toLowerCase())),
  );
}
