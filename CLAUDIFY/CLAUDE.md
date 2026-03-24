# CLAUDIFY — fire-zone-guard-main

## Project Identity
- **Name**: Fire Zone Guard
- **Stack**: React 18 + TypeScript + Vite + Supabase + TailwindCSS + shadcn/ui
- **Purpose**: Firefighting zone management dashboard with task management, real-time data, and Supabase integration
- **Primary Language**: TypeScript/TSX

## Project Structure
```
fire-zone-guard-main/
├── src/
│   ├── components/       # Reusable UI components (TaskCard, TaskDetailDialog, CreateTaskDialog, etc.)
│   ├── hooks/            # Custom React hooks (useSupabaseData, etc.)
│   ├── integrations/     # Supabase client & generated types
│   ├── pages/            # Page-level components (Dashboard, etc.)
│   ├── lib/              # Utility functions
│   └── test/             # Test files
├── supabase/             # Supabase config and migrations
├── CLAUDIFY/             # Claudify OS — memory, skills, workflows
│   ├── CLAUDE.md         # This file (system identity)
│   ├── memory/           # Persistent project knowledge
│   ├── skills/           # Domain-specific skill packs
│   └── workflows/        # Repeatable task workflows
└── .claude/              # Claude Code local settings
```

## Key Technologies
| Tool | Purpose |
|------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool & dev server |
| Supabase | Backend (DB, auth, realtime) |
| TailwindCSS | Styling |
| shadcn/ui | Component library |
| Vitest | Unit testing |

## Claudify Commands
| Command | Action |
|---------|--------|
| `/start` | Begin daily workflow — review tasks, check status |
| `/memory` | Read or update project memory |
| `/skill <name>` | Activate a specific skill pack |
| `/workflow <name>` | Run a named workflow |
| `/status` | Show current project health and open issues |

## Active Skills
- `supabase` — Supabase schema, queries, RLS policies, realtime
- `react-typescript` — Component patterns, hooks, types
- `testing` — Vitest patterns for this project

## Rules
1. Always read `memory/project.md` before making changes
2. Update `memory/project.md` after significant changes
3. Follow existing component patterns in `src/components/`
4. Keep Supabase types in sync with `src/integrations/supabase/types.ts`
5. Run `npm run dev` to verify changes locally
