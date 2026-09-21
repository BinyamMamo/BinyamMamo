/**
 * Builds the SVG cards in assets/ from live GitHub and LeetCode data.
 *   node scripts/build-cards.mjs
 * Uses GITHUB_TOKEN when it is set, and falls back to the gh CLI for local runs.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { profile, skills, theme as t } from './config.mjs';

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
    const out = execFileSync('gh', ['api', 'graphql', '-f', `query=${CONTRIBUTIONS_QUERY}`, '-f', `u=${profile.github}`], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    body = JSON.parse(out);
  }
  if (body.errors) throw new Error(`GitHub: ${JSON.stringify(body.errors)}`);
  const user = body.data.user;
  const days = user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return {
    total: user.contributionsCollection.contributionCalendar.totalContributions,
    repos: user.repositories.totalCount,
    weeks: user.contributionsCollection.contributionCalendar.weeks,
    days,
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
  const solved = Object.fromEntries(user.submitStatsGlobal.acSubmissionNum.map((x) => [x.difficulty, x.count]));
  const totals = Object.fromEntries(body.data.allQuestionsCount.map((x) => [x.difficulty, x.count]));
  const calendar = JSON.parse(user.userCalendar.submissionCalendar || '{}');
  return {
    ranking: user.profile.ranking,
    streak: user.userCalendar.streak,
    activeDays: user.userCalendar.totalActiveDays,
    solved,
    totals,
    calendar: Object.fromEntries(Object.entries(calendar).map(([s, n]) => [new Date(Number(s) * 1000).toISOString().slice(0, 10), n])),
  };
}

/** Current streak counts back from today; the longest scans the whole year. */
function streaks(days) {
  const today = new Date().toISOString().slice(0, 10);
  const past = days.filter((d) => d.date <= today);
  let current = 0;
  for (let i = past.length - 1; i >= 0; i -= 1) {
    if (past[i].contributionCount > 0) current += 1;
    else if (i !== past.length - 1) break; // today can still be empty
  }
  let longest = 0;
  let run = 0;
  for (const day of past) {
    run = day.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const active = past.filter((d) => d.contributionCount > 0).length;
  return { current, longest, active };
}

/* Drawing helpers */

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const icon = (name, x, y, size) => {
  const file = path.join(ICONS, `${name}.svg`);
  const data = Buffer.from(readFileSync(file)).toString('base64');
  return `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/svg+xml;base64,${data}"/>`;
};
const width = (text, size) => text.length * size * 0.56;

function card(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(title)}">
<title>${escape(title)}</title>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
${body}
</svg>
`;
}

const level = (n) => (n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4);

/* Cards */

function banner(gh) {
  const w = 1200;
  const h = 260;
  const cols = 16;
  const rows = 7;
  const cell = 13;
  const gap = 5;
  const gridW = cols * (cell + gap) - gap;
  const gridX = w - 72 - gridW;
  const gridY = (h - (rows * (cell + gap) - gap)) / 2;

  let grid = '';
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      // A calm wave moves left to right; a few cells settle brighter than the rest.
      const seed = (c * 7 + r * 3) % 11;
      const tone = t.levels[seed < 5 ? 1 : seed < 8 ? 2 : seed < 10 ? 3 : 4];
      const delay = (c * 0.16 + r * 0.05).toFixed(2);
      grid += `<rect x="${gridX + c * (cell + gap)}" y="${gridY + r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${tone}" opacity="0.7">
      <animate attributeName="opacity" values="0.3;1;0.3" keyTimes="0;0.5;1" dur="6s" begin="${delay}s" repeatCount="indefinite"/></rect>`;
    }
  }

  const facts = profile.facts
    .map((fact, i) => `<text x="72" y="${182 + i * 22}" font-family="${t.mono}" font-size="13" fill="${t.muted}">${escape(fact)}</text>`)
    .join('\n');

  return card(w, h, `
<rect x="72" y="60" width="96" height="2" rx="1" fill="${t.accent}">
  <animate attributeName="width" values="0;96" keyTimes="0;1" dur="1.1s" fill="freeze"/>
</rect>
<text x="72" y="118" font-family="${t.font}" font-size="42" font-weight="700" fill="${t.text}">${escape(profile.name)}</text>
<text x="72" y="148" font-family="${t.font}" font-size="17" fill="${t.blue}">${escape(profile.role)}</text>
${facts}
${grid}`, `${profile.name}, ${profile.role}`);
}

function skillsCard() {
  const w = 1200;
  const rowH = 58;
  const h = 40 + skills.length * rowH + 16;
  let body = '';

  skills.forEach((row, i) => {
    const y = 48 + i * rowH;
    body += `<text x="36" y="${y + 20}" font-family="${t.mono}" font-size="11" letter-spacing="1.4" fill="${t.dim}">${escape(row.group.toUpperCase())}</text>`;
    let x = 210;
    for (const item of row.items) {
      const [id, label] = item.split(':');
      body += icon(id, x, y + 4, 20);
      body += `<text x="${x + 27}" y="${y + 20}" font-family="${t.font}" font-size="14.5" fill="${t.text}">${escape(label)}</text>`;
      x += 27 + width(label, 14.5) + 30;
    }
    if (i < skills.length - 1) {
      body += `<rect x="36" y="${y + 40}" width="${w - 72}" height="1" fill="${t.border}" opacity="0.6"/>`;
    }
  });

  return card(w, h, body, 'Skills');
}

function contributionsCard(gh) {
  const w = 1200;
  const h = 232;
  const cell = 14;
  const gap = 4;
  const weeks = gh.weeks;
  const gridW = weeks.length * (cell + gap) - gap;
  const x0 = Math.round((w - gridW) / 2);
  const y0 = 92;

  let cells = '';
  let months = '';
  let lastMonth = '';
  weeks.forEach((week, wi) => {
    const first = week.contributionDays[0];
    const month = first?.date.slice(0, 7);
    const name = first ? new Date(first.date).toLocaleString('en', { month: 'short' }) : '';
    if (month && month !== lastMonth && Number(first.date.slice(8)) <= 7) {
      months += `<text x="${x0 + wi * (cell + gap)}" y="${y0 - 10}" font-family="${t.mono}" font-size="11" fill="${t.dim}">${name}</text>`;
      lastMonth = month;
    }
    week.contributionDays.forEach((day) => {
      const row = new Date(day.date).getUTCDay();
      const fill = t.levels[level(day.contributionCount)];
      const delay = (wi * 0.012).toFixed(3);
      cells += `<rect x="${x0 + wi * (cell + gap)}" y="${y0 + row * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${fill}">
      <animate attributeName="opacity" values="0;1" keyTimes="0;1" dur="0.5s" begin="${delay}s"/></rect>`;
    });
  });

  const stats = [
    [gh.total.toLocaleString('en'), 'contributions this year'],
    [String(gh.current), gh.current === 1 ? 'day streak' : 'day streak'],
    [String(gh.active), 'active days'],
    [String(gh.repos), 'repositories'],
  ];
  let statBlock = '';
  let sx = 36;
  for (const [value, label] of stats) {
    statBlock += `<text x="${sx}" y="52" font-family="${t.font}" font-size="22" font-weight="700" fill="${t.text}">${escape(value)}</text>`;
    statBlock += `<text x="${sx + width(value, 22) + 10}" y="52" font-family="${t.font}" font-size="13" fill="${t.muted}">${escape(label)}</text>`;
    sx += width(value, 22) + width(label, 13) + 46;
  }

  return card(w, h, `${statBlock}${months}${cells}`, 'GitHub contributions');
}

function leetcodeCard(lc) {
  const w = 1200;
  const h = 232;
  const bars = [
    ['Easy', lc.solved.Easy, lc.totals.Easy, '#1cbaba'],
    ['Medium', lc.solved.Medium, lc.totals.Medium, '#ffb800'],
    ['Hard', lc.solved.Hard, lc.totals.Hard, '#ef4743'],
  ];

  let body = `<text x="36" y="52" font-family="${t.font}" font-size="22" font-weight="700" fill="${t.text}">${lc.solved.All}</text>
<text x="${36 + width(String(lc.solved.All), 22) + 10}" y="52" font-family="${t.font}" font-size="13" fill="${t.muted}">problems solved on LeetCode</text>
<text x="${w - 36}" y="52" text-anchor="end" font-family="${t.mono}" font-size="12" fill="${t.dim}">rank ${lc.ranking.toLocaleString('en')} · ${lc.activeDays} active days · ${lc.streak} day streak</text>`;

  bars.forEach(([label, count, total, color], i) => {
    const y = 92 + i * 44;
    const barW = 520;
    const filled = Math.max(4, Math.round((count / total) * barW));
    body += `<text x="36" y="${y + 12}" font-family="${t.font}" font-size="13.5" fill="${t.muted}">${label}</text>
<rect x="110" y="${y + 3}" width="${barW}" height="10" rx="5" fill="#21262d"/>
<rect x="110" y="${y + 3}" width="${filled}" height="10" rx="5" fill="${color}">
  <animate attributeName="width" values="0;${filled}" keyTimes="0;1" dur="1.1s" begin="${(i * 0.15).toFixed(2)}s"/>
</rect>
<text x="${110 + barW + 14}" y="${y + 12}" font-family="${t.mono}" font-size="12.5" fill="${t.text}">${count}</text>
<text x="${110 + barW + 14 + width(String(count), 12.5) + 4}" y="${y + 12}" font-family="${t.mono}" font-size="12.5" fill="${t.dim}">/ ${total}</text>`;
  });

  // Submissions per month for the last year, on the right. The calendar is sparse, so bars read
  // better than a heatmap.
  const chartW = 380;
  const chartX = w - 36 - chartW;
  const chartY = 96;
  const chartH = 96;
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i -= 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = month.toISOString().slice(0, 7);
    const count = Object.entries(lc.calendar)
      .filter(([date]) => date.startsWith(key))
      .reduce((sum, [, n]) => sum + n, 0);
    buckets.push({ label: month.toLocaleString('en', { month: 'short' })[0], count });
  }
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const slot = chartW / buckets.length;
  const barW = Math.round(slot * 0.55);
  let chart = `<text x="${chartX}" y="${chartY - 20}" font-family="${t.mono}" font-size="11" letter-spacing="1.2" fill="${t.dim}">SUBMISSIONS PER MONTH</text>`;
  buckets.forEach((bucket, i) => {
    const barH = Math.max(2, Math.round((bucket.count / peak) * chartH));
    const x = Math.round(chartX + i * slot + (slot - barW) / 2);
    const y = chartY + chartH - barH;
    chart += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${bucket.count ? t.accent : '#21262d'}">
      <animate attributeName="y" values="${chartY + chartH - 2};${y}" keyTimes="0;1" dur="0.9s" begin="${(i * 0.05).toFixed(2)}s"/>
      <animate attributeName="height" values="2;${barH}" keyTimes="0;1" dur="0.9s" begin="${(i * 0.05).toFixed(2)}s"/>
    </rect>`;
    chart += `<text x="${x + barW / 2}" y="${chartY + chartH + 18}" text-anchor="middle" font-family="${t.mono}" font-size="10.5" fill="${t.dim}">${bucket.label}</text>`;
  });
  body += chart;

  return card(w, h, body, 'LeetCode progress');
}

/* Run */

const [gh, lc] = await Promise.all([github(), leetcode()]);
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'banner.svg'), banner(gh));
writeFileSync(path.join(OUT, 'skills.svg'), skillsCard());
writeFileSync(path.join(OUT, 'contributions.svg'), contributionsCard(gh));
writeFileSync(path.join(OUT, 'leetcode.svg'), leetcodeCard(lc));
console.log(`banner, skills, contributions (${gh.total} this year, ${gh.current} day streak), leetcode (${lc.solved.All} solved)`);
