import { FirestoreRepository } from "@shared/classes/firestore.repository";

// Minimal fake types
type Entity = { id: string; createdAt: Date | string | null; updatedAt: Date | string | null; deletedAt: Date | string | null; name?: string };

const makeFakeCollection = () => {
  const docs: Record<string, any> = {};
  return {
    doc: (id?: string) => ({
      id: id || 'generated-id',
      set: async (data: any) => { docs[id || 'generated-id'] = { ...data }; return; },
      get: async () => ({ exists: !!docs[id], data: () => docs[id] }),
      update: async (data: any) => { if (!docs[id]) throw new Error('not found'); docs[id] = { ...docs[id], ...data }; },
      delete: async () => { delete docs[id]; },
    }),
    where: () => ({ get: async () => ({ docs: Object.values(docs).map((d: any) => ({ data: () => d })) }) }),
    collection: () => ({ doc: (subId: string) => ({ collection: () => ({ doc: (x:string) => ({ collection: () => ({ doc: () => ({}) }) }) }) }) }),
    _internal: docs,
  } as any;
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
