// Whose photo is it, for the remote's photo import (remote.js, "ייבוא תמונות"). Google Forms saves an uploaded file as
// "<the file's own name> - <the uploader's Google name>", so the name after the last " - " is matched against the people
// list, in Hebrew or in Latin letters, by the consonants ("Yahli Golan" ~ "יהלי גולן"). Only a clear match is suggested,
// and the remote shows every photo with its person to check and correct before anything is saved.
// Plain script for the browser (window.photoMatch); agent/test/photo-match.test.mts imports it too.
(function (root) {
  'use strict';
  const HEB = { 'א': '', 'ב': 'v', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z', 'ח': 'k', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k',
    'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': '', 'פ': 'p', 'ף': 'p', 'צ': 'z', 'ץ': 'z', 'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't' };
  const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-֑ͯ-ׇ'"`׳״]/g, '').toLowerCase();
  const tidy = (s) => s.replace(/(.)\1+/g, '$1');   // a letter said twice is one ("Anna")

  /** A word's consonants, alike in Hebrew and in its Latin spelling, and the vowel it ends with (A: ה or א, a or e;
   *  I: י, i or y; O: ו, o or u), which tells דנה from דני. Inside a Hebrew word ו and י are vowels (וו is v), as are
   *  a e i o u in Latin (and y after the first letter); sh = s, ch/kh = k = ח, f = p, b = v, tz = z. */
  function skel(word) {
    let w = plain(word), end = '';
    if (/[א-ת]/.test(w)) {
      const m = w.length > 1 && w.match(/[הא]$|י$|ו$/);
      if (m) { end = m[0] === 'י' ? 'I' : m[0] === 'ו' ? 'O' : 'A'; w = w.slice(0, -1); }
      let out = '';
      for (let i = 0; i < w.length; i++) {
        const ch = w[i], c = HEB[ch];
        if (c === undefined) continue;
        if (ch === 'ו' && w[i + 1] === 'ו') { out += 'v'; i++; continue; }
        if ((ch === 'ו' || ch === 'י') && i > 0) continue;
        out += c;
      }
      return tidy(out) + end;
    }
    let s = w.replace(/[^a-z]/g, '');
    const m = s.length > 1 && s.match(/(ah|eh|a|e)$|(ie|ee|ey|i|y)$|(oo|ou|o|u)$/);
    if (m) { end = m[1] ? 'A' : m[2] ? 'I' : 'O'; s = s.slice(0, -m[0].length); }
    s = s.replace(/sch|sh/g, 's').replace(/tz|ts/g, 'z').replace(/ch|kh/g, 'k').replace(/ph/g, 'p').replace(/th/g, 't').replace(/ck/g, 'k')
      .replace(/[cq]/g, 'k').replace(/w/g, 'v').replace(/f/g, 'p').replace(/b/g, 'v').replace(/x/g, 'ks').replace(/j/g, 'y');
    s = s[0] === 'y' ? 'y' + s.slice(1).replace(/[aeiouy]/g, '') : s.replace(/[aeiouy]/g, '');
    return tidy(s) + end;
  }

  // h and k (ח is written h or ch), s and z: near enough to cost less than another letter
  const NEAR = { hk: 1, kh: 1, sz: 1, zs: 1 };
  function dist(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const sub = a[i - 1] === b[j - 1] ? 0 : NEAR[a[i - 1] + b[j - 1]] ? 0.4 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      }
      prev = cur;
    }
    return prev[b.length];
  }
  /** 1 for the same consonants, toward 0 the more they differ. */
  const sim = (a, b) => (a && b ? Math.max(0, 1 - dist(a, b) / Math.max(a.length, b.length)) : 0);

  const words = (s) => plain(s).split(/[\s_\-.,()[\]{}0-9]+/).filter((w) => w.length > 1);
  /** "IMG_1234 - Dana Cohen.jpg" → who: "Dana Cohen" (the uploader), own: "IMG_1234"; without " - " it is all own. */
  function parts(fileName) {
    const base = String(fileName || '').split('/').pop().replace(/\.[a-z0-9]{2,5}$/i, '');
    const i = base.lastIndexOf(' - ');
    return i > 0 ? { who: base.slice(i + 3).trim(), own: base.slice(0, i) } : { who: '', own: base };
  }

  /** How well some words name a person: first and last name each against its best word, or the whole name at once
   *  (either order), or a first name alone when it is a clear one. A first name of two words ("רועי אביחי") is often
   *  written as its first word only. */
  function nameScore(ws, p) {
    const sk = ws.map(skel).filter(Boolean), fw = words(p.first).map(skel).filter(Boolean), last = words(p.last).map(skel).join('');
    if (!sk.length || !fw.length) return 0;
    const best = (x) => Math.max(0, ...sk.map((t) => sim(x, t))), all = sk.join('');
    let top = 0;
    for (const first of fw.length > 1 ? [fw.join(''), fw[0]] : fw) {
      const f = best(first), byWord = last ? (f + best(last)) / 2 : f * 0.85;
      const whole = Math.max(sim(first + last, all), last ? sim(last + first, all) : 0);
      top = Math.max(top, byWord, whole, f >= 0.95 && first.length >= 2 ? 0.78 : 0);
    }
    return top;
  }

  /** Each file's score for each person (people: { id, first, last, photoLink, photo }). An uploader's name on more than
   *  one file is someone who sent others' photos, so it doesn't count. */
  function scores(names, people) {
    const ps = names.map(parts), seen = {};
    ps.forEach((x) => { const k = words(x.who).join(' '); if (k) seen[k] = (seen[k] || 0) + 1; });
    return ps.map((x) => {
      const who = seen[words(x.who).join(' ')] > 1 ? [] : words(x.who), own = words(x.own);
      // a little toward those who sent a photo in the form and have none yet: the photos are most likely theirs
      return people.map((p) => Math.max(nameScore(who, p), 0.9 * nameScore(own, p)) + (p.photoLink && !p.photo ? 0.03 : 0));
    });
  }

  /** For each file name, the id of the person it is clearly of, or null; no one twice (the surer file wins). */
  function suggest(names, people) {
    const pairs = [];
    scores(names, people).forEach((row, i) => {
      const order = row.map((s, j) => [s, j]).sort((a, b) => b[0] - a[0]), best = order[0] || [0, -1], next = order[1] || [0, -1];
      if (best[0] >= 0.75 && best[0] - next[0] >= 0.1) pairs.push([best[0], i, best[1]]);
    });
    pairs.sort((a, b) => b[0] - a[0]);
    const out = names.map(() => null), taken = new Set();
    for (const [, i, j] of pairs) if (!taken.has(j)) { out[i] = people[j].id; taken.add(j); }
    return out;
  }

  root.photoMatch = { skel, sim, parts, scores, suggest };
})(typeof window !== 'undefined' ? window : globalThis);
