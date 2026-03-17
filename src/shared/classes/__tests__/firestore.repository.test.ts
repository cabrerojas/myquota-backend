import { FirestoreRepository } from "@shared/classes/firestore.repository";

// Minimal fake types
type Entity = { id: string; createdAt: Date | string | null; updatedAt: Date | string | null; deletedAt: Date | string | null; name?: string };

const makeFakeCollection = () => {
  const docs: Record<string, unknown> = {};
  return {
    doc: (id?: string) => ({
      id: id || 'generated-id',
      set: async (data: unknown) => { (docs as Record<string, unknown>)[id || 'generated-id'] = { ...(data as Record<string, unknown>) }; return; },
      get: async () => ({ exists: !!(docs as Record<string, unknown>)[id || 'generated-id'], data: () => (docs as Record<string, unknown>)[id || 'generated-id'] }),
      update: async (data: unknown) => { if (!(docs as Record<string, unknown>)[id || 'generated-id']) throw new Error('not found'); (docs as Record<string, unknown>)[id || 'generated-id'] = { ...((docs as Record<string, unknown>)[id || 'generated-id'] as Record<string, unknown>), ...(data as Record<string, unknown>) }; },
      delete: async () => { delete (docs as Record<string, unknown>)[id || 'generated-id']; },
    }),
    where: () => ({ get: async () => ({ docs: Object.values(docs).map((d) => ({ data: () => d })) }) }),
    collection: () => ({ doc: (_subId: string) => ({ collection: () => ({ doc: (_x:string) => ({ collection: () => ({ doc: () => ({}) }) }) }) }) }),
    _internal: docs,
  };
};

// Mock db used in constructor
jest.mock('@config/firebase', () => ({
  db: {
    collection: () => makeFakeCollection(),
  },
}));

describe('FirestoreRepository', () => {
  it('creates an entity and returns it', async () => {
    const repo = new FirestoreRepository<Entity>([], 'test');
    const data = { name: 'test' } as any;
    const created = await repo.create(data);
    expect(created).toHaveProperty('id');
    expect(created.name).toBe('test');
  });

  it('findById returns null for missing', async () => {
    const repo = new FirestoreRepository<Entity>([], 'test');
    const res = await repo.findById('nope');
    expect(res).toBeNull();
  });
});
