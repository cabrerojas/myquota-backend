import { IBaseEntity } from "@shared/interfaces/base.repository";
import { MerchantPattern } from "./merchant.model";
import { getSupabaseAdmin } from "@/config/supabase";
import { RepositoryError } from "@/shared/errors/custom.error";

export class MerchantPatternRepository {
  constructor(private readonly categoryId: string) {}

  private client() {
    return getSupabaseAdmin();
  }

  async addPattern(
    pattern: Omit<MerchantPattern, keyof IBaseEntity>,
  ): Promise<MerchantPattern> {
    const supabase = this.client();

    const { data: existing } = await supabase
      .from("merchant_patterns")
      .select("*")
      .eq("category_id", this.categoryId)
      .ilike("pattern", pattern.pattern || "")
      .is("deleted_at", null)
      .limit(1);

    if (existing && existing.length > 0) {
      const row = existing[0];
      return {
        id: row.id as string,
        name: row.name as string,
        pattern: row.pattern as string,
        createdBy: row.created_by as string,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
        deletedAt: null,
      } as MerchantPattern;
    }

    const now = new Date().toISOString();
    const id = (crypto as { randomUUID: () => string }).randomUUID();

    const { data, error } = await supabase
      .from("merchant_patterns")
      .insert({
        id,
        category_id: this.categoryId,
        name: pattern.name,
        pattern: pattern.pattern,
        created_by: pattern.createdBy,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .select()
      .single();

    if (error) {
      throw new RepositoryError(`Error adding merchant pattern: ${error.message}`, 500);
    }

    return {
      id: data.id as string,
      name: data.name as string,
      pattern: data.pattern as string,
      createdBy: data.created_by as string,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      deletedAt: null,
    } as MerchantPattern;
  }

  async findMatchingPattern(
    merchantName: string,
  ): Promise<MerchantPattern | null> {
    const supabase = this.client();

    const { data, error } = await supabase
      .from("merchant_patterns")
      .select("*")
      .eq("category_id", this.categoryId)
      .is("deleted_at", null);

    if (error) {
      throw new RepositoryError(`Error finding merchant pattern: ${error.message}`, 500);
    }

    for (const row of data as Record<string, unknown>[]) {
      const pattern = row.pattern as string;
      if (merchantName.toUpperCase().includes(pattern.toUpperCase())) {
        return {
          id: row.id as string,
          name: row.name as string,
          pattern: row.pattern as string,
          createdBy: row.created_by as string,
          createdAt: new Date(row.created_at as string),
          updatedAt: new Date(row.updated_at as string),
          deletedAt: null,
        } as MerchantPattern;
      }
    }
    return null;
  }

  async getAllPatterns(): Promise<MerchantPattern[]> {
    const supabase = this.client();

    const { data, error } = await supabase
      .from("merchant_patterns")
      .select("*")
      .eq("category_id", this.categoryId)
      .is("deleted_at", null);

    if (error) {
      throw new RepositoryError(`Error getting merchant patterns: ${error.message}`, 500);
    }

    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      name: (row.name as string) || "",
      pattern: (row.pattern as string) || "",
      createdBy: (row.created_by as string) || "",
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      deletedAt: null,
    } as MerchantPattern));
  }
}
