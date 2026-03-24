---
description: Daily start workflow — review project status and prepare for the day
---

# /start — Daily Workflow

## Steps

1. **Read project memory**
   - Read `CLAUDIFY/memory/project.md`
   - Note any open TODOs

2. **Check git status**
   ```bash
   git status
   git log --oneline -5
   ```

3. **Review open files and recent changes**
   - Check which files were recently modified
   - Identify any incomplete work

4. **Check dev server**
   ```bash
   npm run dev
   ```
   Confirm the app starts without errors.

5. **Report to user**
   - Summarize project state
   - List today's recommended priorities based on open TODOs in memory
