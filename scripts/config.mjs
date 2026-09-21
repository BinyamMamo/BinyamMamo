/** Everything the cards say about me lives here. */
export const profile = {
  name: 'Binyam Mamo',
  role: 'Backend and applied AI',
  github: 'BinyamMamo',
  leetcode: 'BIN_01',
  site: 'binyammamo.vercel.app',
  fact: 'Computer Engineering, University of Dubai  ·  Dubai, UAE',
};

export const skills = [
  { group: 'Backend', items: ['nodejs:Node.js', 'express:Express', 'nestjs:NestJS', 'python:Python', 'flask:Flask', 'django:Django', 'graphql:GraphQL'] },
  { group: 'Data', items: ['postgresql:PostgreSQL', 'mongodb:MongoDB', 'mysql:MySQL', 'prisma:Prisma', 'supabase:Supabase', 'firebase:Firebase'] },
  { group: 'Frontend', items: ['react:React', 'nextjs:Next.js', 'typescript:TypeScript', 'tailwindcss:Tailwind', 'javascript:JavaScript'] },
  { group: 'Infrastructure', items: ['docker:Docker', 'kubernetes:Kubernetes', 'nginx:Nginx', 'linux:Linux', 'git:Git'] },
];

/** GitHub's own palettes, so the cards sit on the profile in either theme. */
export const palette = {
  light: {
    fg: '#1f2328', muted: '#59636e', dim: '#818b98', rule: '#d1d9e0', track: '#d1d9e0',
    accent: '#1a7f37', blue: '#0969da',
    cells: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  },
  dark: {
    fg: '#e6edf3', muted: '#9198a1', dim: '#7d8590', rule: '#30363d', track: '#21262d',
    accent: '#3fb950', blue: '#4493f8',
    cells: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
};

export const fonts = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

export const leetcodeBrand = '#ffa116';
