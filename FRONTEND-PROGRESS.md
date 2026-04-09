# Frontend Progress

Tracks UI improvements and cleanup tasks per PRD section 4.3.

---

## Cleanup

- [x] Delete Python artifacts from repo root (`requirements.txt`, `pyproject.toml`, `uv.lock`, `.python-version`)
- [x] Remove stale `mcp-client/__pycache__` / `mcp-server/__pycache__` entries from `.gitignore`
- [x] Move resume PDF → `client/public/resume.pdf`

---

## UI Changes (PRD 4.3)

- [x] **Animated loading indicator** — dots animation while waiting for first AI token (`useTerminal.ts`)
- [x] **Mobile-responsive font size** — smaller font on narrow viewports, orientation change handling (`useTerminal.ts`, `config/terminal.ts`)
- [x] **Code block syntax highlighting** — streaming-safe ANSI colour for code fences and inline code (`utils/terminal.ts`, `useTerminal.ts`)
- [x] **Resume command** — `resume` command outputs download link for `resume.pdf` (`commands/handlers.ts`, `commands/processor.ts`)
- [x] **Improved welcome message** — cleaner ASCII banner, no emojis, short tagline (`config/terminal.ts`)
- [x] **Improved help output** — ANSI-coloured section headers, `resume` in commands list, cleaner formatting (`utils/terminal.ts`, `commands/handlers.ts`)

---

## Verification Checklist

- [ ] `cd client && npm run build` passes with no TS errors
- [ ] Welcome message renders cleanly on `npm run dev`
- [ ] `help` shows updated output including `resume`
- [ ] `resume` outputs clickable download link
- [ ] Animated dots appear on AI query, disappear on first token
- [ ] Code blocks in AI responses render in green
- [ ] Resize to mobile width — font shrinks and terminal refits
- [ ] `clear` reprints the welcome message correctly
- [ ] Vercel preview deploy succeeds
