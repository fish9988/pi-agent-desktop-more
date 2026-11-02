import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  BUILTIN_QUICK_PHRASES,
  QUICK_PHRASES_PREF_MIRROR_KEY,
  QUICK_PHRASES_STORAGE_KEY,
  addCustomQuickPhrase,
  getAllQuickPhrases,
  getBuiltinQuickPhrases,
  readCustomQuickPhrases,
  removeCustomQuickPhrase,
} = await jiti.import("./quick-phrases.ts");

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

test("provides 8 built-in high-frequency engineering phrases across locales", () => {
  assert.equal(BUILTIN_QUICK_PHRASES.length, 8);
  assert.equal(getBuiltinQuickPhrases("zh-CN").length, 8);
  assert.equal(getBuiltinQuickPhrases("zh-TW").length, 8);
  assert.equal(getBuiltinQuickPhrases("en").length, 8);
  assert.ok(BUILTIN_QUICK_PHRASES.some((item) => item.content === "继续"));
  assert.ok(BUILTIN_QUICK_PHRASES.some((item) => item.content.includes("请总结当前进展与剩余待办")));
});

test("adds, persists, mirrors to plus-prefs key, and removes custom quick phrases", () => {
  const storage = createMemoryStorage();
  assert.deepEqual(readCustomQuickPhrases(storage), []);

  const afterAdd = addCustomQuickPhrase("先跑单元测试并输出报告", storage);
  assert.equal(afterAdd.length, 1);
  assert.equal(afterAdd[0].content, "先跑单元测试并输出报告");
  assert.ok(storage.getItem(QUICK_PHRASES_STORAGE_KEY));
  assert.equal(storage.getItem(QUICK_PHRASES_STORAGE_KEY), storage.getItem(QUICK_PHRASES_PREF_MIRROR_KEY));

  const all = getAllQuickPhrases("zh-CN", storage);
  assert.equal(all.length, 9);
  assert.equal(all[0].content, "先跑单元测试并输出报告");

  const afterRemove = removeCustomQuickPhrase(afterAdd[0].id, storage);
  assert.deepEqual(afterRemove, []);
});
