/**
 * Builds the SVG cards in assets/ from live GitHub and LeetCode data.
 *   node scripts/build-cards.mjs
 * Uses GITHUB_TOKEN when it is set, and falls back to the gh CLI for local runs.
 * The cards are transparent and follow the reader's colour scheme.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { fonts, leetcodeBrand, palette, profile, skills } from './config.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets');
const ICONS = path.join(OUT, 'icons');

/* Data */

const CONTRIBUTIONS_QUERY = `query($u:String!){user(login:$u){
  contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}
  repositories(first:1,ownerAffiliations:OWNER,isFork:false){totalCount}
}}`;

async function github() {
  const token = process.env.GITHUB_TOKEN;
  let body;
  if (token) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { u: profile.github } }),
    });
    body = await response.json();
  } else {
    // Local runs borrow the gh CLI session instead of a token in the environment.
    body = JSON.parse(execFileSync('gh', ['api', 'graphql', '-f', `query=${CONTRIBUTIONS_QUERY}`, '-f', `u=${profile.github}`], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }));
  }
  if (body.errors) throw new Error(`GitHub: ${JSON.stringify(body.errors)}`);
  const user = body.data.user;
  const weeks = user.contributionsCollection.contributionCalendar.weeks;
  const days = weeks.flatMap((w) => w.contributionDays);
  return {
    total: user.contributionsCollection.contributionCalendar.totalContributions,
    repos: user.repositories.totalCount,
    weeks,
    ...streaks(days),
  };
}

const LEETCODE_QUERY = `query($u:String!){
  matchedUser(username:$u){
    profile{ranking}
    submitStatsGlobal{acSubmissionNum{difficulty count}}
    userCalendar{streak totalActiveDays submissionCalendar}
  }
  allQuestionsCount{difficulty count}
}`;

async function leetcode() {
  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
    body: JSON.stringify({ query: LEETCODE_QUERY, variables: { u: profile.leetcode } }),
  });
  const body = await response.json();
  if (!body.data?.matchedUser) throw new Error('LeetCode: no such user');
  const user = body.data.matchedUser;
  const calendar = JSON.parse(user.userCalendar.submissionCalendar || '{}');
  return {
    ranking: user.profile.ranking,
    streak: user.userCalendar.streak,
    activeDays: user.userCalendar.totalActiveDays,
    solved: Object.fromEntries(user.submitStatsGlobal.acSubmissionNum.map((x) => [x.difficulty, x.count])),
    totals: Object.fromEntries(body.data.allQuestionsCount.map((x) => [x.difficulty, x.count])),
    calendar: Object.fromEntries(
      Object.entries(calendar).map(([seconds, n]) => [new Date(Number(seconds) * 1000).toISOString().slice(0, 10), n]),
    ),
  };
}

/** The current streak counts back from today; the longest scans the whole year. */
function streaks(days) {
  const today = new Date().toISOString().slice(0, 10);
  const past = days.filter((d) => d.date <= today);
  let current = 0;
  for (let i = past.length - 1; i >= 0; i -= 1) {
    if (past[i].contributionCount > 0) current += 1;
    else if (i !== past.length - 1) break; // today may still be empty
  }
  return { current, active: past.filter((d) => d.contributionCount > 0).length };
}

/* Drawing helpers */

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textWidth = (text, size) => text.length * size * 0.56;
const level = (n) => (n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4);

/** Icons come in light and dark cuts where a logo would otherwise disappear. */
function icon(name, x, y, size) {
  const embed = (file, cls) => {
    const data = readFileSync(path.join(ICONS, file)).toString('base64');
    return `<image x="${x}" y="${y}" width="${size}" height="${size}" class="${cls}" href="data:image/svg+xml;base64,${data}"/>`;
  };
  if (existsSync(path.join(ICONS, `${name}-light.svg`)) && existsSync(path.join(ICONS, `${name}-dark.svg`))) {
    return embed(`${name}-light.svg`, 'only-light') + embed(`${name}-dark.svg`, 'only-dark');
  }
  return embed(`${name}.svg`, '');
}

/** The LeetCode mark, inlined so it can take the brand colour. */
function leetcodeMark(x, y, size) {
  const source = readFileSync(path.join(ICONS, 'leetcode-mono.svg'), 'utf8');
  const inner = source.slice(source.indexOf('>', source.indexOf('<svg')) + 1, source.lastIndexOf('</svg>'));
  return `<g transform="translate(${x} ${y}) scale(${size / 32})" fill="${leetcodeBrand}">${inner}</g>`;
}

function styleBlock() {
  const rules = (p) => `.fg{fill:${p.fg}}.muted{fill:${p.muted}}.dim{fill:${p.dim}}.rule{fill:${p.rule}}` +
    `.track{fill:${p.track}}.accent{fill:${p.accent}}.blue{fill:${p.blue}}` +
    p.cells.map((c, i) => `.c${i}{fill:${c}}`).join('');
  return `<style>${rules(palette.light)}.only-dark{display:none}` +
    `@media (prefers-color-scheme:dark){${rules(palette.dark)}.only-dark{display:inline}.only-light{display:none}}</style>`;
}

function svg(w, h, body, title, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" role="img" aria-label="${escape(title)}">
<title>${escape(title)}</title>
${styleBlock()}
<defs>${defs}</defs>
${body}
</svg>
`;
}

const W = 1200;

/* Cards */

/** A gradient panel carrying the real contribution grid, dissolving toward the name. */
function banner(gh) {
  const h = 210;
  const cell = 12;
  const gap = 4;
  const weeks = gh.weeks.slice(-26);
  const gridW = weeks.length * (cell + gap) - gap;
  const gridX = W - 28 - gridW;
  const gridY = Math.round((h - (7 * (cell + gap) - gap)) / 2);

  // Brighter than the page palette, because these sit on a dark gradient in both themes.
  const tones = ['#18351f', '#1f5c34', '#2ea043', '#46d160', '#68e58a'];
  let grid = '';
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const row = new Date(day.date).getUTCDay();
      grid += `<rect x="${gridX + wi * (cell + gap)}" y="${gridY + row * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${tones[level(day.contributionCount)]}">
  <animate attributeName="opacity" values="0;1" keyTimes="0;1" dur="0.5s" begin="${(wi * 0.02).toFixed(2)}s"/></rect>`;
    });
  });

  const defs = `<linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b2b21"/>
    <stop offset="0.45" stop-color="#0d3b2e"/>
    <stop offset="1" stop-color="#0a2d3a"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.78" cy="0.35" r="0.65">
    <stop offset="0" stop-color="#39d353" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#39d353" stop-opacity="0"/>
  </radialGradient>
  <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="1.5" cy="1.5" r="1.4" fill="#ffffff" opacity="0.06"/>
  </pattern>
  <linearGradient id="dissolve" x1="0" x2="1">
    <stop offset="0" stop-color="#000"/>
    <stop offset="0.42" stop-color="#5a5a5a"/>
    <stop offset="0.75" stop-color="#e8e8e8"/>
    <stop offset="1" stop-color="#fff"/>
  </linearGradient>
  <mask id="fadeLeft"><rect x="${gridX}" y="0" width="${gridW}" height="${h}" fill="url(#dissolve)"/></mask>`;

  return svg(W, h, `
<rect x="0" y="0" width="${W}" height="${h}" rx="14" fill="url(#panel)"/>
<rect x="0" y="0" width="${W}" height="${h}" rx="14" fill="url(#glow)"/>
<rect x="0" y="0" width="${W}" height="${h}" rx="14" fill="url(#dots)"/>
<g mask="url(#fadeLeft)">${grid}</g>
<rect x="36" y="36" width="56" height="3" rx="1.5" fill="#39d353">
  <animate attributeName="width" values="0;56" keyTimes="0;1" dur="1s"/>
</rect>
<text x="36" y="96" font-family="${fonts.sans}" font-size="40" font-weight="700" fill="#f0f6fc">${escape(profile.name)}</text>
<text x="36" y="125" font-family="${fonts.sans}" font-size="16.5" fill="#7ee2a8">${escape(profile.role)}</text>
<text x="36" y="153" font-family="${fonts.mono}" font-size="12.5" fill="#c3d0d9" opacity="0.85">${escape(profile.fact)}</text>
<text x="36" y="178" font-family="${fonts.mono}" font-size="13" fill="#e6edf3" opacity="0.9">${escape(profile.site)} &#8599;</text>`,
    `${profile.name}, ${profile.role}`, defs);
}

function skillsCard() {
  const rowH = 54;
  const h = skills.length * rowH + 12;
  let body = '';

  skills.forEach((row, i) => {
    const y = 12 + i * rowH;
    body += `<text x="8" y="${y + 20}" font-family="${fonts.mono}" font-size="11" letter-spacing="1.4" class="dim">${escape(row.group.toUpperCase())}</text>`;
    let x = 170;
    for (const item of row.items) {
      const [id, label] = item.split(':');
      body += icon(id, x, y + 4, 20);
      body += `<text x="${x + 27}" y="${y + 20}" font-family="${fonts.sans}" font-size="14.5" class="fg">${escape(label)}</text>`;
      x += 27 + textWidth(label, 14.5) + 30;
    }
    if (i < skills.length - 1) body += `<rect x="8" y="${y + 38}" width="${W - 16}" height="1" class="rule" opacity="0.7"/>`;
  });

  return svg(W, h, body, 'Backend, data, frontend and infrastructure tools');
}

/** A number with its label beside it, the way GitHub writes counts. */
function stat(x, y, value, label) {
  return `<text x="${x}" y="${y}" font-family="${fonts.sans}" font-size="21" font-weight="700" class="fg">${escape(value)}</text>
<text x="${x + textWidth(value, 21) + 9}" y="${y}" font-family="${fonts.sans}" font-size="13" class="muted">${escape(label)}</text>`;
}

function contributionsCard(gh) {
  const h = 206;
  const cell = 14;
  const gap = 4;
  const gridW = gh.weeks.length * (cell + gap) - gap;
  const x0 = Math.round((W - gridW) / 2);
  const y0 = 74;

  let cells = '';
  let months = '';
  let lastMonth = '';
  gh.weeks.forEach((week, wi) => {
    const first = week.contributionDays[0];
    if (first && first.date.slice(0, 7) !== lastMonth && Number(first.date.slice(8)) <= 7) {
      const name = new Date(first.date).toLocaleString('en', { month: 'short' });
      months += `<text x="${x0 + wi * (cell + gap)}" y="${y0 - 12}" font-family="${fonts.mono}" font-size="11" class="dim">${name}</text>`;
      lastMonth = first.date.slice(0, 7);
    }
    week.contributionDays.forEach((day) => {
      const row = new Date(day.date).getUTCDay();
      cells += `<rect x="${x0 + wi * (cell + gap)}" y="${y0 + row * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="c${level(day.contributionCount)}">
  <animate attributeName="opacity" values="0;1" keyTimes="0;1" dur="0.5s" begin="${(wi * 0.012).toFixed(3)}s"/></rect>`;
    });
  });

  const stats = [
    [gh.total.toLocaleString('en'), 'contributions this year'],
    [String(gh.current), 'day streak'],
    [String(gh.active), 'active days'],
    [String(gh.repos), 'repositories'],
  ];
  let x = 8;
  let statBlock = '';
  for (const [value, label] of stats) {
    statBlock += stat(x, 34, value, label);
    x += textWidth(value, 21) + textWidth(label, 13) + 44;
  }

  return svg(W, h, `${statBlock}${months}${cells}`, `${gh.total} GitHub contributions in the past year`);
}

function leetcodeCard(lc) {
  const h = 206;
  const bars = [
    ['Easy', lc.solved.Easy, lc.totals.Easy, '#1cbaba'],
    ['Medium', lc.solved.Medium, lc.totals.Medium, '#ffb800'],
    ['Hard', lc.solved.Hard, lc.totals.Hard, '#ef4743'],
  ];

  const solved = String(lc.solved.All);
  let body = `${leetcodeMark(8, 16, 22)}
${stat(38, 34, solved, 'problems solved on LeetCode')}
<text x="${W - 8}" y="34" text-anchor="end" font-family="${fonts.mono}" font-size="12" class="dim">rank ${lc.ranking.toLocaleString('en')} · ${lc.activeDays} active days · ${lc.streak} day streak</text>`;

  const barW = 470;
  bars.forEach(([label, count, total, colour], i) => {
    const y = 74 + i * 42;
    const filled = Math.max(4, Math.round((count / total) * barW));
    body += `<text x="8" y="${y + 12}" font-family="${fonts.sans}" font-size="13.5" class="muted">${label}</text>
<rect x="76" y="${y + 3}" width="${barW}" height="10" rx="5" class="track"/>
<rect x="76" y="${y + 3}" width="${filled}" height="10" rx="5" fill="${colour}">
  <animate attributeName="width" values="0;${filled}" keyTimes="0;1" dur="1.1s" begin="${(i * 0.15).toFixed(2)}s"/>
</rect>
<text x="${76 + barW + 14}" y="${y + 12}" font-family="${fonts.mono}" font-size="12.5" class="fg">${count}</text>
<text x="${76 + barW + 20 + textWidth(String(count), 12.5)}" y="${y + 12}" font-family="${fonts.mono}" font-size="12.5" class="dim">/ ${total}</text>`;
  });

  // Submissions per month for the last year. The calendar is sparse, so bars read better than a grid.
  const chartW = 440;
  const chartX = W - 8 - chartW;
  const chartY = 78;
  const chartH = 92;
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i -= 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = month.toISOString().slice(0, 7);
    const count = Object.entries(lc.calendar)
      .filter(([date]) => date.startsWith(key))
      .reduce((sum, [, n]) => sum + n, 0);
    buckets.push({ label: month.toLocaleString('en', { month: 'short' }), count });
  }
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const slot = chartW / buckets.length;
  const bw = Math.round(slot * 0.5);
  let chart = `<text x="${chartX}" y="${chartY - 16}" font-family="${fonts.mono}" font-size="11" letter-spacing="1.2" class="dim">SUBMISSIONS PER MONTH</text>`;
  buckets.forEach((bucket, i) => {
    const barH = Math.max(2, Math.round((bucket.count / peak) * chartH));
    const x = Math.round(chartX + i * slot + (slot - bw) / 2);
    const y = chartY + chartH - barH;
    chart += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" rx="2" class="${bucket.count ? 'accent' : 'track'}">
  <animate attributeName="y" values="${chartY + chartH - 2};${y}" keyTimes="0;1" dur="0.9s" begin="${(i * 0.05).toFixed(2)}s"/>
  <animate attributeName="height" values="2;${barH}" keyTimes="0;1" dur="0.9s" begin="${(i * 0.05).toFixed(2)}s"/></rect>`;
    chart += `<text x="${x + bw / 2}" y="${chartY + chartH + 18}" text-anchor="middle" font-family="${fonts.mono}" font-size="10.5" class="dim">${bucket.label[0]}</text>`;
  });

  return svg(W, h, body + chart, `${lc.solved.All} problems solved on LeetCode`);
}

/* Run */

const [gh, lc] = await Promise.all([github(), leetcode()]);
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'banner.svg'), banner(gh));
writeFileSync(path.join(OUT, 'skills.svg'), skillsCard());
writeFileSync(path.join(OUT, 'contributions.svg'), contributionsCard(gh));
writeFileSync(path.join(OUT, 'leetcode.svg'), leetcodeCard(lc));
console.log(`banner, skills, contributions (${gh.total} this year, ${gh.current} day streak), leetcode (${lc.solved.All} solved)`);
