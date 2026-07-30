/**
 * Default category seed data.
 * Runs on app startup or via admin endpoint to populate initial categories.
 */
import { getSupabaseAdmin } from "@/config/supabase";

const DEFAULT_CATEGORIES = [
  { name: "Supermercado", icon: "🛒", color: "#43A047" },
  { name: "Restaurantes", icon: "🍽️", color: "#E53935" },
  { name: "Delivery", icon: "🛵", color: "#FB8C00" },
  { name: "Transporte", icon: "🚗", color: "#1E88E5" },
  { name: "Combustible", icon: "⛽", color: "#F9A825" },
  { name: "Entretenimiento", icon: "🎬", color: "#8E24AA" },
  { name: "Salud", icon: "🏥", color: "#00ACC1" },
  { name: "Farmacia", icon: "💊", color: "#00897B" },
  { name: "Servicios", icon: "💡", color: "#6D4C41" },
  { name: "Internet/Teléfono", icon: "📱", color: "#3949AB" },
  { name: "Ropa", icon: "👕", color: "#E91E63" },
  { name: "Educación", icon: "📚", color: "#5C6BC0" },
  { name: "Viajes", icon: "✈️", color: "#26A69A" },
  { name: "Hogar", icon: "🏠", color: "#78909C" },
  { name: "Suscripciones", icon: "📺", color: "#7B1FA2" },
  { name: "Otros", icon: "📦", color: "#90A4AE" },
];

export async function seedDefaultCategories(): Promise<void> {
  const supabase = getSupabaseAdmin();

  for (const cat of DEFAULT_CATEGORIES) {
    // Check if category exists by name (any user)
    const { data: existing } = await supabase
      .from("categories")
      .select("id, is_global")
      .eq("name", cat.name)
      .maybeSingle();

    if (existing) {
      // Ensure is_global and normalized_name for existing default categories
      const updates: Record<string, unknown> = {};
      if (!existing.is_global) updates.is_global = true;
      if (!(existing as Record<string, unknown>).normalized_name) {
        updates.normalized_name = cat.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from("categories").update(updates).eq("id", existing.id);
      }
      continue;
    }

    await supabase.from("categories").insert({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      user_id: null,
      is_global: true,
      normalized_name: cat.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`[CategorySeed] ${DEFAULT_CATEGORIES.length} default categories ensured`);
}

// ─── Known merchant keyword → category mappings ────────────────────────────
// These auto-suggest categories during email import based on charge descriptions.

const MERCHANT_KEYWORDS: Record<string, string[]> = {
  "Supermercado": ["tottus", "lider", "jumbo", "santa isabel", "unimarc", "mayorista", "acuenta", "ekono"],
  "Farmacia": ["salcobrand", "cruz verde", "ahumada", "farmax", "dr simi", "d r simi", "farmacias"],
  "Combustible": ["copec", "shell", "petrobras", "terpel", "energy", "petro"],
  "Restaurantes": ["mcdonalds", "burger king", "kfc", "pizza hut", "telepizza", "domino", "papa johns", "subway", "starbucks", "dunkin"],
  "Delivery": ["uber eats", "rappi", "pedidosya", "cornershop", "ubereats"],
  "Servicios": ["enel", "metrogas", "aguas", "vtr", "movistar", "claro", "entel", "directv", "flow"],
  "Transporte": ["metro", "bip", "uber", "cabify", "did", "transporte"],
  "Entretenimiento": ["netflix", "spotify", "disney", "hbo", "amazon prime", "youtube", "cinemark", "cinehoyts", "cine"],
  "Salud": ["clinica", "hospital", "medico", "consulta", "isapre", "fonasa"],
};

export async function seedMerchantPatterns(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Get all global categories by name
  const { data: cats } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_global", true)
    .is("deleted_at", null);

  if (!cats || cats.length === 0) {
    console.warn("[MerchantSeed] No global categories found — run category seed first");
    return;
  }

  const catMap = new Map<string, string>();
  for (const c of cats) {
    catMap.set(c.name.toLowerCase(), c.id as string);
  }

  let inserted = 0;
  for (const [catName, keywords] of Object.entries(MERCHANT_KEYWORDS)) {
    const categoryId = catMap.get(catName.toLowerCase());
    if (!categoryId) continue;

    for (const kw of keywords) {
      const { data: existing } = await supabase
        .from("merchant_patterns")
        .select("id")
        .eq("pattern", kw)
        .eq("category_id", categoryId)
        .maybeSingle();

      if (existing) continue;

      await supabase.from("merchant_patterns").insert({
        name: kw,
        pattern: kw,
        category_id: categoryId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      });
      inserted++;
    }
  }

  console.log(`[MerchantSeed] ${inserted} merchant patterns seeded`);
}
