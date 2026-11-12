import { readHistory, writeHistory } from "../places/history";
const mockDisk = { contents: "", exists: false };
jest.mock("expo-file-system", () => ({
  Paths: { document: "test://documents" },
  File: class {
    get exists() { return mockDisk.exists; }
    create() { mockDisk.exists = true; }
    textSync() { return mockDisk.contents; }
    async write(text: string) { mockDisk.contents = text; }
  },
}));
test("history defaults off, bounds locally stored queries, and an opt-out wins queued writes", async () => {
  expect(readHistory()).toEqual({ enabled: false, queries: [] });
  await writeHistory({ enabled: true, queries: Array.from({ length: 15 }, (_, i) => `Typed query ${i}`) });
  expect(readHistory().queries).toHaveLength(10);
  const oldWrite = writeHistory({ enabled: true, queries: ["Typed query"] });
  const clear = writeHistory({ enabled: false, queries: [] });
  await Promise.allSettled([oldWrite, clear]);
  expect(readHistory()).toEqual({ enabled: false, queries: [] });
  expect(mockDisk.contents).not.toContain("Typed query");
  mockDisk.contents = "corrupt";
  expect(readHistory()).toEqual({ enabled: false, queries: [] });
});
