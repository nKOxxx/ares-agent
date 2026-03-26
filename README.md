# Hermes

Run a fleet of AI coding agents in parallel — each in its own isolated git worktree, with real-time streaming, code review, and one-click merge.

Hermes is a self-hosted macOS desktop app that lets you orchestrate multiple AI agents (Claude Code, GPT, MiniMax) working simultaneously across your repos. Add a repository, spin up workspaces, assign tasks to different models, watch them work in real time, review the diffs, and merge to main.

## Features

- **Parallel agent execution** — run multiple Claude Code, GPT, or MiniMax agents at the same time
- **Git worktree isolation** — each workspace gets its own branch, no conflicts between agents
- **Multi-model support** — Claude for coding, GPT for research, MiniMax for general tasks, all through a unified proxy
- **Real-time streaming** — watch agent output live as they work (SSE)
- **Code review & merge** — diff viewer with approve/reject/merge workflow, conflict detection
- **Mission control dashboard** — see all agents across all repos in one grid view
- **Cost tracking** — token usage and cost estimates per model, per run
- **SQLite persistence** — all state survives restarts, no external database needed
- **Native macOS app** — Electron with tray icon, keyboard shortcuts, hiddenInset title bar

## Quick Start

```bash
cd App
npm install
cd frontend && npm install && npm run build && cd ..
npm start
```

### Development Mode

```bash
cd App
npm install
cd frontend && npm install && cd ..
npm run dev
```

## Architecture

```
App/
  main.js                    # Electron main process
  backend/
    server.js                # Express API server
    db.js                    # SQLite database
    proxy/router.js          # Unified model proxy with cost tracking
    agents/
      claude-agent.js        # Claude Code CLI spawner
      gpt-agent.js           # OpenAI API agent
      minimax-agent.js       # MiniMax API agent
    git/
      worktree.js            # Git worktree lifecycle
      review.js              # Diff, merge, conflict detection
    streaming/sse.js         # Server-Sent Events
  frontend/                  # React + Vite + Tailwind
    src/
      components/            # Sidebar, Chat, Terminal, DiffViewer
      stores/                # Zustand state management
      hooks/                 # SSE + API hooks
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-...     # For Claude Code CLI
OPENAI_API_KEY=sk-...        # For GPT research agents
MINIMAX_API_KEY=...          # For MiniMax general agents
HERMES_PORT=8765             # Backend port (default: 8765)
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/repos | List repositories |
| POST | /api/repos | Add repository (clone from URL) |
| POST | /api/workspaces | Create workspace (git worktree) |
| POST | /api/workspaces/:id/spawn | Spawn agent `{ model, task }` |
| POST | /api/workspaces/:id/kill | Stop running agent |
| GET | /api/workspaces/:id/diff | Get diff vs main branch |
| POST | /api/reviews/:id/merge | Merge agent's work to main |
| GET | /api/dashboard | All agents across all repos |
| GET | /api/proxy/usage | Cost & token tracking |
| GET | /events | SSE stream |

## Inspiration

Hermes was inspired by [Conductor](https://www.conductor.build) — a fantastic app for running parallel Claude Code agents. Hermes takes the same core concept and extends it with multi-model support (Claude + GPT + MiniMax), a unified cost tracking proxy, and a self-hosted architecture with no cloud dependency.

## License

MIT
