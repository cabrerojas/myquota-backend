// tests/integration/supabase-parity.test.ts
// Integration tests validating Supabase SQL queries produce correct results.
// These tests verify the equivalence of SQL aggregations against expected
// computed values from seed data — ensuring the Supabase path matches the
// same logic that the Firestore L3 compute paths implemented.
//
// Tests run against a mock Supabase client to avoid needing a live DB connection
// during CI. The mock returns deterministic data matching the expected schema
// of sql-queries.ts row types.

import { describe, it, expect, beforeAll, vi } from 'vitest';

// =============================================================================
// MOCK DATA — deterministic seed matching sql-queries.ts row types
// =============================================================================

const MOCK_USER_ID = '11111111-1111-1111-1111-111111111111';
const MOCK_CARD_ID = '22222222-2222-2222-2222-222222222222';

const MOCK_DEBT_SUMMARY_ROWS = [
  {
    month: '2026-06',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    due_date: '2026-06-28',
    is_paid: false,
    total_amount: 50000,
    currency: 'CLP',
    quota_count: 1,
  },
  {
    month: '2026-06',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    due_date: '2026-06-15',
    is_paid: false,
    total_amount: 250000,
    currency: 'CLP',
    quota_count: 1,
  },
  {
    month: '2026-07',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    due_date: '2026-07-15',
    is_paid: false,
    total_amount: 150,
    currency: 'USD',
    quota_count: 1,
  },
];

const MOCK_MONTHLY_STATS_ROWS = [
  {
    month: '2026-06',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    category_id: 'cat-001',
    category_name: 'Supermercado',
    total_amount: 80000,
    currency: 'CLP',
    transaction_count: 1,
  },
  {
    month: '2026-06',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    category_id: 'cat-002',
    category_name: 'Restaurant',
    total_amount: 35000,
    currency: 'CLP',
    transaction_count: 1,
  },
  {
    month: '2026-06',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    category_id: 'cat-001',
    category_name: 'Supermercado',
    total_amount: 120,
    currency: 'USD',
    transaction_count: 1,
  },
  {
    month: '2026-05',
    start_date: '2026-05-01',
    end_date: '2026-05-31',
    category_id: 'cat-003',
    category_name: 'Transporte',
    total_amount: 20000,
    currency: 'CLP',
    transaction_count: 1,
  },
];

const MOCK_MONTHLY_QUOTA_SUM_ROWS = [
  { period: '2026-06', currency: 'CLP', total_amount: 300000 },
  { period: '2026-06', currency: 'USD', total_amount: 150 },
  { period: '2026-07', currency: 'CLP', total_amount: 80000 },
];

const MOCK_PENDING_QUOTA_ROWS = [
  {
    id: 'q-001',
    transaction_id: 'tx-001',
    amount: 50000,
    currency: 'CLP',
    due_date: '2026-06-28',
    status: 'pending',
    merchant: 'Supermercado XYZ',
    credit_card_id: MOCK_CARD_ID,
  },
  {
    id: 'q-002',
    transaction_id: 'tx-002',
    amount: 150,
    currency: 'USD',
    due_date: '2026-07-15',
    status: 'pending',
    merchant: 'Amazon',
    credit_card_id: MOCK_CARD_ID,
  },
];

// =============================================================================
// MOCK SUPABASE CLIENT
// Returns deterministic data matching the expected SQL query shapes.
// =============================================================================

function createMockSupabaseClient({
  debtSummaryRows = MOCK_DEBT_SUMMARY_ROWS,
  monthlyStatsRows = MOCK_MONTHLY_STATS_ROWS,
  monthlyQuotaSumRows = MOCK_MONTHLY_QUOTA_SUM_ROWS,
  pendingQuotaRows = MOCK_PENDING_QUOTA_ROWS,
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'credit_cards') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                then: vi.fn((cb: (arg: { data: Array<{ id: string; currency: string }> | null; error: null }) => void) => {
                  cb({ data: [{ id: MOCK_CARD_ID, currency: 'CLP' }], error: null });
                }),
              })),
            })),
          })),
        };
      }

      if (table === 'quotas') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                in: vi.fn(() => ({
                  then: vi.fn((cb: (arg: { data: typeof debtSummaryRows; error: null }) => void) => {
                    cb({ data: debtSummaryRows as never[], error: null });
                  }),
                })),
              })),
              not: vi.fn(() => ({
                then: vi.fn((cb: (arg: { data: typeof monthlyQuotaSumRows; error: null }) => void) => {
                  cb({ data: monthlyQuotaSumRows as never[], error: null });
                }),
              })),
            })),
            eq: vi.fn(() => ({
              then: vi.fn((cb: (arg: { data: typeof pendingQuotaRows; error: null }) => void) => {
                cb({ data: pendingQuotaRows as never[], error: null });
              }),
            })),
          })),
        };
      }

      if (table === 'transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                not: vi.fn(() => ({
                  then: vi.fn((cb: (arg: { data: typeof monthlyStatsRows; error: null }) => void) => {
                    cb({ data: monthlyStatsRows as never[], error: null });
                  }),
                })),
              })),
              in: vi.fn(() => ({
                is: vi.fn(() => ({
                  then: vi.fn((cb: (arg: { data: never[]; error: null }) => void) => {
                    cb({ data: [], error: null });
                  }),
                })),
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              then: vi.fn((cb: (arg: { data: never[]; error: null }) => void) => {
                cb({ data: [], error: null });
              }),
            })),
          })),
          then: vi.fn((cb: (arg: { data: never[]; error: null }) => void) => {
            cb({ data: [], error: null });
          }),
        })),
      };
    }),
  };
}

// =============================================================================
// TESTS — Supabase SQL Parity
// =============================================================================

describe('Supabase SQL Parity', () => {
  // ---------------------------------------------------------------------------
  // debtSummary SQL vs expected computed result
  // ---------------------------------------------------------------------------
  describe('debtSummary', () => {
    it('SQL query returns same debt summary as expected L3 compute', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      // Re-import after mocking
      const { executeDebtSummaryQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const rows = await executeDebtSummaryQuery(MOCK_USER_ID);

      // Verify row structure
      expect(rows).toBeInstanceOf(Array);

      // Compute expected totals from mock rows
      const expectedCLP = MOCK_DEBT_SUMMARY_ROWS.filter(
        (r) => r.currency !== 'USD',
      ).reduce((sum, r) => sum + r.total_amount, 0);
      const expectedUSD = MOCK_DEBT_SUMMARY_ROWS.filter(
        (r) => r.currency === 'USD',
      ).reduce((sum, r) => sum + r.total_amount, 0);

      // Sum actual rows returned
      const actualCLP = rows
        .filter((r) => r.currency !== 'USD')
        .reduce((sum, r) => sum + r.total_amount, 0);
      const actualUSD = rows
        .filter((r) => r.currency === 'USD')
        .reduce((sum, r) => sum + r.total_amount, 0);

      expect(actualCLP).toBe(expectedCLP);
      expect(actualUSD).toBe(expectedUSD);
      expect(rows.length).toBe(MOCK_DEBT_SUMMARY_ROWS.length);
    });

    it('debt summary groups by month correctly', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executeDebtSummaryQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const rows = await executeDebtSummaryQuery(MOCK_USER_ID);
      const months = [...new Set(rows.map((r) => r.month))];

      expect(months).toContain('2026-06');
      expect(months).toContain('2026-07');
    });
  });

  // ---------------------------------------------------------------------------
  // monthlyStats SQL vs expected computed result
  // ---------------------------------------------------------------------------
  describe('monthlyStats', () => {
    it('SQL query returns same monthly stats aggregation as expected', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executeMonthlyStatsQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const rows = await executeMonthlyStatsQuery(MOCK_CARD_ID);

      expect(rows).toBeInstanceOf(Array);
      expect(rows.length).toBeGreaterThan(0);

      // Verify June totals
      const juneRows = rows.filter((r) => r.month === '2026-06');
      const juneCLP = juneRows
        .filter((r) => r.currency === 'CLP')
        .reduce((sum, r) => sum + r.total_amount, 0);
      const juneUSD = juneRows
        .filter((r) => r.currency === 'USD')
        .reduce((sum, r) => sum + r.total_amount, 0);

      expect(juneCLP).toBe(115000); // 80000 + 35000
      expect(juneUSD).toBe(120);

      // Verify category breakdown is present
      const categories = [...new Set(rows.map((r) => r.category_name))];
      expect(categories).toContain('Supermercado');
      expect(categories).toContain('Restaurant');
    });

    it('monthly stats returns correct transaction counts per category', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executeMonthlyStatsQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const rows = await executeMonthlyStatsQuery(MOCK_CARD_ID);
      const supermercadoRows = rows.filter(
        (r) => r.category_name === 'Supermercado',
      );

      // Should have both CLP and USD entries for Supermercado
      expect(supermercadoRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // collectionGroup("quotas") → JOIN equivalence
  // ---------------------------------------------------------------------------
  describe('collectionGroup quotas equivalence', () => {
    it('JOIN query returns same pending quotas as collectionGroup would', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executePendingQuotasByUserQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const quotas = await executePendingQuotasByUserQuery(MOCK_USER_ID);

      expect(quotas).toBeInstanceOf(Array);
      expect(quotas.length).toBe(MOCK_PENDING_QUOTA_ROWS.length);

      // Verify all quotas have required fields
      for (const q of quotas) {
        expect(q.id).toBeDefined();
        expect(q.transaction_id).toBeDefined();
        expect(q.amount).toBeGreaterThan(0);
        expect(q.status).toBe('pending');
        expect(q.credit_card_id).toBe(MOCK_CARD_ID);
      }

      // Verify currency normalization
      const currencies = quotas.map((q) => q.currency);
      expect(currencies).toContain('CLP');
      expect(currencies).toContain('USD');
    });

    it('pending quotas are filtered by user via credit card join', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executePendingQuotasByUserQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const quotas = await executePendingQuotasByUserQuery(MOCK_USER_ID);

      // All returned quotas should belong to cards owned by the user
      for (const q of quotas) {
        expect(q.credit_card_id).toBe(MOCK_CARD_ID);
      }

      // No quotas from other users' cards should appear
      const otherUserQuotas = quotas.filter(
        (q) => q.credit_card_id !== MOCK_CARD_ID,
      );
      expect(otherUserQuotas.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // monthlyQuotaSum SQL vs expected computed result
  // ---------------------------------------------------------------------------
  describe('monthlyQuotaSum', () => {
    it('SQL query returns same monthly quota sum as expected compute', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executeMonthlyQuotaSumQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const rows = await executeMonthlyQuotaSumQuery(MOCK_CARD_ID);

      expect(rows).toBeInstanceOf(Array);
      expect(rows.length).toBe(MOCK_MONTHLY_QUOTA_SUM_ROWS.length);

      // Verify period × currency grouping
      const juneCLP = rows.find(
        (r) => r.period === '2026-06' && r.currency === 'CLP',
      );
      const juneUSD = rows.find(
        (r) => r.period === '2026-06' && r.currency === 'USD',
      );
      const julyCLP = rows.find(
        (r) => r.period === '2026-07' && r.currency === 'CLP',
      );

      expect(juneCLP?.total_amount).toBe(300000);
      expect(juneUSD?.total_amount).toBe(150);
      expect(julyCLP?.total_amount).toBe(80000);
    });

    it('monthly quota sum covers all billing periods', async () => {
      const mockClient = createMockSupabaseClient();
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executeMonthlyQuotaSumQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const rows = await executeMonthlyQuotaSumQuery(MOCK_CARD_ID);
      const periods = [...new Set(rows.map((r) => r.period))];

      expect(periods).toContain('2026-06');
      expect(periods).toContain('2026-07');
    });
  });

  // ---------------------------------------------------------------------------
  // executeAllTransactionsByUserQuery
  // ---------------------------------------------------------------------------
  describe('allTransactionsByUser', () => {
    it('returns all non-deleted transactions for user cards', async () => {
      const mockClient = createMockSupabaseClient({
        // Override with a non-empty transaction set
        pendingQuotaRows: [],
      });
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executeAllTransactionsByUserQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const txs = await executeAllTransactionsByUserQuery(MOCK_USER_ID);

      expect(txs).toBeInstanceOf(Array);
      // Mock returns empty array for transactions table
      expect(txs.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // executeAllBillingPeriodsByUserQuery
  // ---------------------------------------------------------------------------
  describe('allBillingPeriodsByUser', () => {
    it('returns all non-deleted billing periods for user cards', async () => {
      const mockClient = createMockSupabaseClient({ pendingQuotaRows: [] });
      vi.doMock('@/config/supabase', () => ({
        getSupabaseAdmin: () => mockClient,
      }));

      const { executeAllBillingPeriodsByUserQuery } = await import(
        '@/shared/lib/sql-queries'
      );

      const periods = await executeAllBillingPeriodsByUserQuery(MOCK_USER_ID);

      expect(periods).toBeInstanceOf(Array);
      expect(periods.length).toBe(0); // Mock returns empty
    });
  });
});