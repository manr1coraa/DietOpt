/* ═══════════════════════════════════════════════════════════════
   shopping.js — pure shopping-list state logic (no DOM).
   Imported by app.js and by automated tests.

   Locked policies (see tests/unit/shopping.test.js):
   1. Items are keyed by product id; order is stable insertion order.
      Toggling or merging NEVER re-sorts the list, so rows do not jump
      under the user's finger on mobile.
   2. Adding duplicates MERGES quantities (grams and cost are summed,
      cost rounded to cents) instead of creating a second row.
   3. Merging into an already checked-off item re-opens it (done=false),
      because new unbought quantities arrived. The UI tells the user
      how many lines were merged so this is never silent.
   ═══════════════════════════════════════════════════════════════ */

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Merge freshly aggregated shopping lines into the existing list.
 * @returns {{ items: Array, added: number, merged: number }}
 */
export function mergeListItems(existing, additions) {
  const items = (existing || []).map(i => ({ ...i }));
  const index = new Map(items.map((item, at) => [item.id, at]));
  let added = 0;
  let merged = 0;

  for (const add of additions || []) {
    if (!add || !Number.isFinite(Number(add.id))) continue;
    const at = index.get(add.id);
    if (at == null) {
      items.push({ ...add, grams: Number(add.grams) || 0, cost: r2(add.cost), done: false });
      index.set(add.id, items.length - 1);
      added += 1;
    } else {
      const cur = items[at];
      cur.grams = (Number(cur.grams) || 0) + (Number(add.grams) || 0);
      cur.cost = r2(cur.cost + add.cost);
      cur.done = false; // new unbought quantities arrived → needs buying again
      // Keep the freshest display names (older stored lists may lack translations).
      for (const key of ['dname', 'name', 'n', 'n_de', 'n_en', 'n_ru']) {
        if (add[key] && !cur[key]) cur[key] = add[key];
      }
      merged += 1;
    }
  }
  return { items, added, merged };
}

/** Return a new array with one item's done flag set. Unknown ids are ignored. */
export function setListItemDone(items, id, done) {
  return (items || []).map(item => (item.id === id ? { ...item, done: Boolean(done) } : item));
}

/** Return a new array with one item's done flag toggled. Unknown ids are ignored. */
export function toggleListItem(items, id) {
  return (items || []).map(item => (item.id === id ? { ...item, done: !item.done } : item));
}

/** Totals for the list header and badges. */
export function listTotals(items) {
  const list = items || [];
  const total = r2(list.reduce((s, i) => s + (Number(i.cost) || 0), 0));
  const left = r2(list.filter(i => !i.done).reduce((s, i) => s + (Number(i.cost) || 0), 0));
  const done = list.filter(i => i.done).length;
  return { total, left, done, count: list.length };
}
