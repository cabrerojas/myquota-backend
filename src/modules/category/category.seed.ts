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
      // Ensure is_global = true for all default categories
      if (!existing.is_global) {
        await supabase.from("categories")
          .update({ is_global: true })
          .eq("id", existing.id);
      }
      continue;
    }

    await supabase.from("categories").insert({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      user_id: "default",
      is_global: true,
      normalized_name: cat.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`[CategorySeed] ${DEFAULT_CATEGORIES.length} default categories ensured`);
}
