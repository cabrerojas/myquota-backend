export interface ExpenseStats {
  month: string; // Mes en formato YYYY-MM
  totalAmount: number; // Total gastado en el mes
  currency: string; // CLP o USD
  categoryBreakdown: { [category: string]: number }; // Gastos por categoría
}
