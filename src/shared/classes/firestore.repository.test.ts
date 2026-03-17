jest.mock('@/config/firebase', () => {
  const mockCollection = () => ({
    doc: (id?: string) => ({
      id: id || 'generated-id',
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ id: id || 'generated-id' }) }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }),
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
    docWithId: function (id: string) { return this.doc(id); }
  });

  return { db: { collection: () => mockCollection() } };
});

import { FirestoreRepository } from './firestore.repository';

type Dummy = { id: string; createdAt?: Date | string; updatedAt?: Date | string; deletedAt?: Date | null };

describe('FirestoreRepository (unit)', () => {
  it('datesToIsoStrings converts Date fields and removes undefined', () => {
    const repo = new FirestoreRepository<Dummy>([], 'dummy');
    const input: any = { a: new Date('2020-01-01T00:00:00Z'), b: undefined, c: 'keep' };
    const out = (repo as any).datesToIsoStrings(input);
    expect(out.a).toBe('2020-01-01T00:00:00.000Z');
    expect(out.b).toBeUndefined();
    expect(out.c).toBe('keep');
  });

  it('sanitizeTimestamps converts Date to ISO and leaves other fields', () => {
    const repo = new FirestoreRepository<Dummy>([], 'dummy');
    const data: any = { createdAt: new Date('2021-02-03T04:05:06Z'), name: 'x' };
    const sanitized = (repo as any).sanitizeTimestamps(data);
    expect(sanitized.createdAt).toBe('2021-02-03T04:05:06.000Z');
    expect(sanitized.name).toBe('x');
  });
});
