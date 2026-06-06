// src/shared/classes/repository.factory.ts
// Factory for creating Supabase repository instances.
// USE_SUPABASE is always true in this final PR — Firestore code has been removed.

import { QuotaRepositorySupabase } from '@/modules/quota/quota.repository.supabase';
import { TransactionRepositorySupabase } from '@/modules/transaction/transaction.repository.supabase';
import { CreditCardRepositorySupabase } from '@/modules/creditCard/creditCard.repository.supabase';
import { BillingPeriodRepositorySupabase } from '@/modules/billingPeriod/billingPeriod.repository.supabase';
import { CategoryRepositorySupabase } from '@/modules/category/category.repository.supabase';
import { UserRepositorySupabase } from '@/modules/user/user.repository.supabase';

export function createTransactionRepository(
  _userId: string,
  creditCardId: string,
): TransactionRepositorySupabase {
  return new TransactionRepositorySupabase(creditCardId);
}

export function createCreditCardRepository(
  userId: string,
): CreditCardRepositorySupabase {
  return new CreditCardRepositorySupabase(userId);
}

export function createBillingPeriodRepository(
  _userId: string,
  creditCardId: string,
): BillingPeriodRepositorySupabase {
  return new BillingPeriodRepositorySupabase(creditCardId);
}

export function createCategoryRepository(
  userId?: string,
): CategoryRepositorySupabase {
  return new CategoryRepositorySupabase(userId);
}

export function createQuotaRepository(): QuotaRepositorySupabase {
  return new QuotaRepositorySupabase();
}

export function createUserRepository(): UserRepositorySupabase {
  return new UserRepositorySupabase();
}