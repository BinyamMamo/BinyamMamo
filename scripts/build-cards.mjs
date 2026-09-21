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

const PAD_X = 22;
const PAD_Y = 18;

/** A faint gradient behind a card, one tone per colour scheme; far quieter than the banner. */
const PANEL_DEFS = `<linearGradient id="panelLight" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f6f8fa"/><stop offset="1" stop-color="#eef3f0"/>
  </linearGradient>
  <linearGradient id="panelDark" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#11161d"/><stop offset="1" stop-color="#0f1714"/>
  </linearGradient>`;
const PANEL_STYLE = '<style>.panel{fill:url(#panelLight)}@media (prefers-color-scheme:dark){.panel{fill:url(#panelDark)}}</style>';

function svg(w, h, body, title, defs = '', { panel = false } = {}) {
  const outerW = panel ? w + PAD_X * 2 : w;
  const outerH = panel ? h + PAD_Y * 2 : h;
  const content = panel
    ? `<rect width="${outerW}" height="${outerH}" rx="12" class="panel"/>\n<g transform="translate(${PAD_X} ${PAD_Y})">${body}</g>`
    : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW}" height="${outerH}" viewBox="0 0 ${outerW} ${outerH}" fill="none" role="img" aria-label="${escape(title)}">
<title>${escape(title)}</title>
${styleBlock()}${panel ? PANEL_STYLE : ''}
<defs>${panel ? PANEL_DEFS : ''}${defs}</defs>
${content}
</svg>
`;
}

const W = 1200;

/* Cards */

/** A dark gradient panel carrying the real contribution grid, dissolving toward the name. */
function banner(gh) {
  const w = W + PAD_X * 2;
  const h = 170;
  const cell = 11;
  const gap = 4;
  const weeks = gh.weeks.slice(-30);
  const gridW = weeks.length * (cell + gap) - gap;
  const gridX = w - 30 - gridW;
  const gridY = Math.round((h - (7 * (cell + gap) - gap)) / 2);

  // GitHub's own dark contribution greens, slightly dimmed so the panel stays quiet.
  const tones = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
  let grid = '';
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const row = new Date(day.date).getUTCDay();
      grid += `<rect x="${gridX + wi * (cell + gap)}" y="${gridY + row * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${tones[level(day.contributionCount)]}" opacity="0.9">
  <animate attributeName="opacity" values="0;0.9" keyTimes="0;1" dur="0.5s" begin="${(wi * 0.02).toFixed(2)}s"/></rect>`;
    });
  });

  const defs = `<linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0d1117"/>
    <stop offset="0.55" stop-color="#0f1a17"/>
    <stop offset="1" stop-color="#0c1520"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.8" cy="0.3" r="0.6">
    <stop offset="0" stop-color="#2ea043" stop-opacity="0.10"/>
    <stop offset="1" stop-color="#2ea043" stop-opacity="0"/>
  </radialGradient>
  <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
    <circle cx="1.5" cy="1.5" r="1.2" fill="#ffffff" opacity="0.045"/>
  </pattern>
  <linearGradient id="dissolve" x1="0" x2="1">
    <stop offset="0" stop-color="#000"/>
    <stop offset="0.45" stop-color="#555"/>
    <stop offset="0.8" stop-color="#e6e6e6"/>
    <stop offset="1" stop-color="#fff"/>
  </linearGradient>
  <mask id="fadeLeft"><rect x="${gridX}" y="0" width="${gridW}" height="${h}" fill="url(#dissolve)"/></mask>`;

  return svg(w, h, `
<rect width="${w}" height="${h}" rx="12" fill="url(#panel)"/>
<rect width="${w}" height="${h}" rx="12" fill="url(#glow)"/>
<rect width="${w}" height="${h}" rx="12" fill="url(#dots)"/>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="11.5" stroke="#30363d" stroke-opacity="0.6"/>
<g mask="url(#fadeLeft)">${grid}</g>
<text x="36" y="66" font-family="${fonts.sans}" font-size="38" font-weight="700" fill="#f0f6fc">${escape(profile.name)}</text>
<text x="36" y="94" font-family="${fonts.sans}" font-size="16" fill="#7ee787">${escape(profile.role)}</text>
<text x="36" y="120" font-family="${fonts.mono}" font-size="12.5" fill="#9198a1">${escape(profile.fact)}</text>
<text x="36" y="142" font-family="${fonts.mono}" font-size="12.5" fill="#c9d1d9">${escape(profile.site)} &#8599;</text>`,
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

  return svg(W, h, body, 'Backend, database, frontend and infrastructure tools', '', { panel: true });
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

  return svg(W, h, `${statBlock}${months}${cells}`, `${gh.total} GitHub contributions in the past year`, '', { panel: true });
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

  return svg(W, h, body + chart, `${lc.solved.All} problems solved on LeetCode`, '', { panel: true });
}

/* Run */

const [gh, lc] = await Promise.all([github(), leetcode()]);
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'banner.svg'), banner(gh));
writeFileSync(path.join(OUT, 'skills.svg'), skillsCard());
writeFileSync(path.join(OUT, 'contributions.svg'), contributionsCard(gh));
writeFileSync(path.join(OUT, 'leetcode.svg'), leetcodeCard(lc));
console.log(`banner, skills, contributions (${gh.total} this year, ${gh.current} day streak), leetcode (${lc.solved.All} solved)`);
