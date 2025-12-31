# FOSSIL

**Thought Vault — Compress and track concepts through systematic probing.**

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://danielteshager.github.io/fossil/)
[![PWA Ready](https://img.shields.io/badge/PWA-ready-blue)](https://danielteshager.github.io/fossil/)
[![License](https://img.shields.io/badge/license-MIT-black)](LICENSE)

FOSSIL is a personal knowledge management system that helps you capture, compress, and interconnect ideas. Unlike traditional note-taking, FOSSIL forces you to distill concepts down to their core invariants — the fundamental truths that remain constant.

[**Try it live →**](https://danielteshager.github.io/fossil/)

---

## Philosophy

> "The best way to understand something is to compress it."

Most knowledge tools encourage accumulation. FOSSIL encourages **compression**. Every concept you capture must be reduced to:

- **Invariant** — The core principle that remains true
- **Primitives** — Three building blocks that construct the idea
- **Model Shift** — How your understanding changed

This constraint forces deeper thinking and creates knowledge that compounds.

---

## Features

### Core System

| Feature | Description |
|---------|-------------|
| **Fossils** | Compressed concept captures with quality ratings |
| **Kernels** | Meta-invariants synthesized from weekly fossils |
| **Active Probes** | Daily thought experiments to guide exploration |
| **Re-entry** | Chain related concepts into evolving threads |
| **Graph View** | Visualize connections between your ideas |

### Intelligence Layer

| Feature | Description |
|---------|-------------|
| **Spaced Repetition** | Resurface fossils using decay-based scoring |
| **Conflict Detection** | Semantic analysis to find tensions between ideas |
| **Streak Tracking** | Build consistency with daily capture habits |

### AI Integration

FOSSIL includes optional AI assistance with **cost controls** and **privacy-first** design:

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-4o Mini, GPT-4o |
| **Anthropic** | Claude Haiku, Claude 3.5 Sonnet |
| **Ollama** | Any local model (free) |
| **Custom** | Your own endpoint |

**AI Features:**
- **Insight Spark** — Find non-obvious patterns in your vault
- **Probe Suggestion** — Generate thought-provoking questions
- **Synthesis Helper** — Create kernels from weekly fossils
- **Conflict Analysis** — Check new ideas against existing ones

All AI features include:
- Per-call cost estimates
- Daily spending caps ($0.05 - $1.00)
- Response caching (1-hour TTL)
- Full offline operation without AI

---

## Tech Stack

```
React 18 + Vite + Tailwind CSS
└── PWA with offline support
└── 100% client-side (no server)
└── localStorage persistence
└── Zero dependencies on external services
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/DanielTeshager/fossil.git
cd fossil

# Install
npm install

# Run locally
npm run dev

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

---

## Data & Privacy

**Your data never leaves your device.**

- All fossils stored in browser localStorage
- API keys stored locally (never transmitted except to chosen provider)
- Export/import in JSON or Markdown
- No accounts, no tracking, no server
- Seed data for demos: import `seed-vault.json`
- Guidebook: see `FOSSIL_BIBLE.md`

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + Enter` | Save current fossil |
| `Escape` | Close modals |

---

## Screenshots

<details>
<summary>Click to expand</summary>

### Today View
Capture new fossils with guided prompts.

### Archive View
Browse and search your compressed knowledge.

### Graph View
Visualize concept relationships and clusters.

### Harvest View
Weekly synthesis into meta-invariants.

</details>

---

## Roadmap

- [ ] Export to Obsidian/Roam format
- [ ] Keyboard-driven navigation
- [ ] Concept tagging system
- [ ] Collaborative vaults
- [ ] Mobile app (React Native)

---

## Contributing

PRs welcome. Please keep the compression philosophy in mind — simplicity over features.

---

## License

MIT

---

<p align="center">
  <strong>Stop collecting. Start compressing.</strong>
</p>
