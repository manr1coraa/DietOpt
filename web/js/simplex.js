/* ═══════════════════════════════════════════════════════════════
   simplex.js — компактний двофазний симплекс-метод (правило Бленда)
   Розв'язує задачу ЛП:   max / min  c·y
                          A·y ≤ b,   y ≥ 0
   Значення b можуть бути від'ємними (так записуються обмеження «≥»).
   Правило Бленда гарантує відсутність зациклення, а ліміт ітерацій —
   що браузер ніколи не «зависне».
   ═══════════════════════════════════════════════════════════════ */

const EPS = 1e-9;

export function simplex({ c, A, b, maximize = true, maxIter = 5000 }) {
  const m = A.length;
  const n = c.length;
  // Стовпці: n змінних | m слек-змінних | k штучних | RHS
  const negRows = [];
  for (let i = 0; i < m; i++) if (b[i] < -EPS) negRows.push(i);
  const k = negRows.length;
  const W = n + m + k + 1;
  const RHS = W - 1;
  const T = Array.from({ length: m }, () => new Float64Array(W));
  const basis = new Int32Array(m);

  for (let i = 0; i < m; i++) {
    const row = T[i];
    const sign = b[i] < -EPS ? -1 : 1;
    for (let j = 0; j < n; j++) row[j] = sign * A[i][j];
    row[n + i] = sign;                 // слек
    row[RHS] = sign * b[i];
    basis[i] = n + i;
  }
  negRows.forEach((i, a) => { T[i][n + m + a] = 1; basis[i] = n + m + a; });

  function pivot(r, col) {
    const pr = T[r];
    const inv = 1 / pr[col];
    for (let j = 0; j < W; j++) pr[j] *= inv;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = T[i][col];
      if (Math.abs(f) < EPS) continue;
      const row = T[i];
      for (let j = 0; j < W; j++) row[j] -= f * pr[j];
    }
    basis[r] = col;
  }

  // Мінімізуємо obj·x над дозволеними стовпцями (allowed[j] === true)
  function run(obj, allowed) {
    for (let it = 0; it < maxIter; it++) {
      // зведені вартості: d_j = obj_j − Σ obj_B·T_ij
      let enter = -1;
      for (let j = 0; j < RHS; j++) {
        if (!allowed[j]) continue;
        let d = obj[j];
        for (let i = 0; i < m; i++) d -= obj[basis[i]] * T[i][j];
        if (d < -1e-10) { enter = j; break; }      // Бленд: перший підходящий
      }
      if (enter < 0) return 'optimal';
      let leave = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][enter];
        if (a > EPS) {
          const q = T[i][RHS] / a;
          if (q < best - 1e-12 || (Math.abs(q - best) <= 1e-12 && basis[i] < basis[leave])) { best = q; leave = i; }
        }
      }
      if (leave < 0) return 'unbounded';
      pivot(leave, enter);
    }
    return 'iteration_limit';
  }

  const allowedAll = new Array(RHS).fill(true);

  // Фаза 1 — пошук допустимої точки
  if (k > 0) {
    const obj1 = new Float64Array(RHS);
    for (let a = 0; a < k; a++) obj1[n + m + a] = 1;
    const st = run(obj1, allowedAll);
    if (st === 'iteration_limit') return { feasible: false, status: st };
    let infeas = 0;
    for (let i = 0; i < m; i++) if (basis[i] >= n + m) infeas += T[i][RHS];
    if (infeas > 1e-6) return { feasible: false, status: 'infeasible' };
    // виводимо штучні змінні з базису
    for (let i = 0; i < m; i++) {
      if (basis[i] < n + m) continue;
      for (let j = 0; j < n + m; j++) if (Math.abs(T[i][j]) > EPS) { pivot(i, j); break; }
    }
  }

  // Фаза 2 — оптимізація (зводимо до мінімізації)
  const obj2 = new Float64Array(RHS);
  for (let j = 0; j < n; j++) obj2[j] = maximize ? -c[j] : c[j];
  const allowed2 = allowedAll.map((_, j) => j < n + m);
  const st = run(obj2, allowed2);
  if (st !== 'optimal') return { feasible: false, status: st };

  const y = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) y[basis[i]] = T[i][RHS];
  let value = 0;
  for (let j = 0; j < n; j++) value += c[j] * y[j];
  return { feasible: true, status: 'optimal', y, value };
}

/**
 * Зручна обгортка: змінні з межами lo ≤ x ≤ hi та обмеження-діапазони.
 * rows: [{ coef: number[], min?: number, max?: number }]
 */
export function solveBounded({ cost, lo, hi, rows, maximize = false }) {
  const n = cost.length;
  const A = [], b = [];
  const base = row => row.reduce((s, a, j) => s + a * lo[j], 0);
  for (const r of rows) {
    const shift = base(r.coef);
    if (r.max !== undefined) { A.push(r.coef.slice()); b.push(r.max - shift); }
    if (r.min !== undefined) { A.push(r.coef.map(v => -v)); b.push(-(r.min - shift)); }
  }
  for (let j = 0; j < n; j++) {
    const row = new Array(n).fill(0); row[j] = 1;
    A.push(row); b.push(hi[j] - lo[j]);
  }
  const res = simplex({ c: cost, A, b, maximize });
  if (!res.feasible) return { feasible: false };
  const x = res.y.map((v, j) => v + lo[j]);
  return { feasible: true, x, value: x.reduce((s, v, j) => s + v * cost[j], 0) };
}
