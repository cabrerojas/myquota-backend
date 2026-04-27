import { FirestoreRepository, PaginationParams, QueryResult } from "@/shared/classes/firestore.repository";
import { BillingPeriod } from "./billingPeriod.model";

export class BillingPeriodRepository extends FirestoreRepository<BillingPeriod> {
  constructor(userId: string, creditCardId: string) {
    super(["users", userId, "creditCards", creditCardId], "billingPeriods");
  }

  /**
   * Returns billing periods ordered by startDate descending.
   * Supports pagination with optional limit.
   */
  async findAll(
    filters?: Partial<BillingPeriod>,
    pagination?: PaginationParams,
  ): Promise<QueryResult<BillingPeriod>> {
    try {
      let query = this.repository.where("deletedAt", "==", null);

      // Apply filters
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          query = query.where(key as string, "==", value);
        });
      }

      // Order by startDate descending (most recent first)
      query = query.orderBy("startDate", "desc");

      // Apply limit (default 20 for billing periods)
      const limit = pagination?.limit || 20;

      // Apply cursor if provided
      if (pagination?.startAfter) {
        const cursorDoc = await this.repository.doc(pagination.startAfter).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      // Fetch one extra to determine hasMore
      const snapshot = await query.limit(limit + 1).get();

      const hasMore = snapshot.docs.length > limit;
      const items = hasMore
        ? snapshot.docs.slice(0, limit)
        : snapshot.docs;

      const nextCursor =
        items.length > 0 && hasMore
          ? (items[items.length - 1].id as string)
          : null;

      return {
        items: items.map((doc) => doc.data() as BillingPeriod),
        metadata: {
          hasMore,
          nextCursor,
        },
      };
    } catch (error) {
      console.error("Error al obtener los BillingPeriods ordenados:", error);
      throw new Error("Error al obtener los períodos de facturación.");
    }
  }
}
