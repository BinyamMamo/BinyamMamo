/** Everything the cards say about me lives here. */
export const profile = {
  name: 'Binyam Mamo',
  role: 'Backend and applied AI',
  github: 'BinyamMamo',
  leetcode: 'BIN_01',
  site: 'binyammamo.vercel.app',
  facts: [
    'Computer Engineering, University of Dubai',
    'APIs, data and the apps on top of them',
    'Dubai, UAE',
  ],
};

export const skills = [
  { group: 'Backend', items: ['nodejs:Node.js', 'express:Express', 'nestjs:NestJS', 'python:Python', 'flask:Flask', 'django:Django', 'graphql:GraphQL'] },
  { group: 'Data', items: ['postgresql:PostgreSQL', 'mongodb:MongoDB', 'mysql:MySQL', 'prisma:Prisma', 'supabase:Supabase', 'firebase:Firebase'] },
  { group: 'Frontend', items: ['react:React', 'nextjs:Next.js', 'typescript:TypeScript', 'tailwindcss:Tailwind', 'javascript:JavaScript'] },
  { group: 'Infrastructure', items: ['docker:Docker', 'kubernetes:Kubernetes', 'nginx:Nginx', 'linux:Linux', 'git:Git'] },
];

/** GitHub palette, so the cards sit naturally on the profile. */
export const theme = {
  bg: '#0d1117',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
  dim: '#6e7681',
  accent: '#39d353',
  blue: '#58a6ff',
  levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};
