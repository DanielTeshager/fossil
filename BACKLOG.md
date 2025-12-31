# FOSSIL Enhancement Backlog

## Priority Legend
- **P0**: Foundation - must do first, everything depends on it
- **P1**: High impact, unlocks other features
- **P2**: Significant UX improvement
- **P3**: Nice to have, polish

---

## P0: Foundation (Do First)

### F1. Split Monolith into Components
- [ ] Extract reusable UI components (Button, Modal, Card, Input)
- [ ] Extract view components (TodayView, ArchiveView, HarvestView, GraphView)
- [x] Extract hooks (useDebounce, useKeyboardShortcuts)
- [x] Extract utilities (tokenizer, similarity, graph algorithms, helpers, constants)
- [x] Extract AI service layer
- [x] Proper folder structure: `/components`, `/hooks`, `/utils`, `/services`

### F2. TypeScript Migration
- [ ] Add TypeScript configuration
- [ ] Define core types (Fossil, Kernel, AIConfig, etc.)
- [ ] Migrate utilities first (lowest risk)
- [ ] Migrate hooks
- [ ] Migrate components
- [ ] Migrate App.tsx

### F3. State Management
- [ ] Create FossilContext for global state
- [ ] Separate UI state from data state
- [ ] Add proper data persistence layer
- [ ] Optimistic updates for better UX

### F4. IndexedDB Migration
- [ ] Replace localStorage with IndexedDB
- [ ] No 5MB limit - unlimited fossil storage
- [ ] Better query performance
- [ ] Migration script for existing users

### F5. Testing Foundation
- [ ] Set up Vitest
- [ ] Test core algorithms (tokenizer, similarity, conflict detection)
- [ ] Test spaced repetition scoring
- [ ] Test data persistence layer

---

## P1: Zero Friction (High Impact)

### Z1. Keyboard-First Navigation
- [x] Global shortcuts: `Cmd+N` new probe, `Cmd+K` command palette
- [ ] Vim-style navigation in lists (`j/k`)
- [x] `Escape` to close any modal
- [x] `Cmd+Enter` to submit any form
- [ ] `Tab` flow optimized for rapid entry

### Z2. Quick Capture Mode
- [x] Floating action button for instant capture
- [x] Minimal UI mode - just invariant + one primitive
- [x] Expand to full mode if needed
- [ ] Auto-save drafts

### Z3. Command Palette
- [x] `Cmd+K` opens palette
- [x] Fuzzy search all fossils
- [x] Quick actions: new probe, search, settings, export
- [ ] Recent fossils
- [x] AI actions accessible

### Z4. Share Sheet / Import
- [ ] Accept shared text from other apps
- [ ] Parse highlights from Kindle/books
- [ ] Import from clipboard with smart parsing
- [ ] URL auto-fetch and summarize

### Z5. Progressive Disclosure
- [ ] Start simple, reveal complexity as needed
- [ ] Collapsible advanced options
- [ ] Smart defaults that learn from usage

---

## P2: Intelligence (Smart Features)

### I1. Proactive AI Insights
- [x] Daily digest: "3 fossils relate to X"
- [x] Tension detection: "These 2 ideas may conflict"
- [x] Pattern recognition: "You've probed Y topic 5 times"
- [x] Synthesis suggestions: "Ready to form a kernel?"

### I2. Contextual Prompts
- [ ] Time-based prompts (morning review, evening capture)
- [ ] Gap detection: "You haven't probed in 3 days"
- [ ] Topic balance: "Heavy on X, light on Y lately"
- [ ] Quality patterns: "Your best fossils happen on..."

### I3. Smart Resurface
- [x] Learn when user is receptive (time, frequency)
- [x] Weight by engagement (did they act on last resurface?)
- [x] Context matching (resurface related ideas together)
- [ ] Difficulty progression (start easy, increase challenge)

### I4. Auto-Linking
- [x] Automatically detect related fossils
- [x] Suggest connections in graph view
- [x] Build knowledge clusters
- [x] Surface cross-domain insights

### I5. Voice Capture
- [ ] Press and hold to speak
- [ ] Transcribe and parse into fossil structure
- [ ] AI-assisted compression of spoken thoughts

---

## P3: Data Resilience

### D1. Auto-Backup
- [ ] Weekly JSON export to Downloads
- [ ] Configurable schedule
- [ ] Backup notification

### D2. Cloud Sync (Optional)
- [ ] GitHub Gist sync
- [ ] iCloud/Dropbox integration
- [ ] Conflict resolution
- [ ] End-to-end encryption option

### D3. Export Formats
- [ ] Markdown with proper formatting
- [ ] Obsidian-compatible vault export
- [ ] CSV for spreadsheet analysis
- [ ] PDF report generation

---

## P4: Polish & UX

### U1. Animations & Micro-interactions
- [ ] Smooth page transitions
- [ ] Skeleton loading states
- [ ] Haptic feedback (mobile)
- [ ] Celebration moments (streak, seal)

### U2. Accessibility
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Reduce motion option
- [ ] Keyboard-only navigation

### U3. Mobile Optimization
- [ ] Touch gestures (swipe to dismiss, pull to refresh)
- [ ] Better mobile keyboard handling
- [ ] Native app feel (no browser chrome)

### U4. Onboarding
- [ ] First-run tutorial
- [ ] Example fossils to understand format
- [ ] Progressive feature reveal

### U5. Stats & Insights Dashboard
- [ ] Total fossils, kernels, streaks
- [ ] Topic distribution chart
- [ ] Quality trends over time
- [ ] Most connected ideas

---

## Implementation Order

### Phase 1: Foundation (Current Sprint)
1. F1 - Split monolith
2. F4 - IndexedDB (do with split for clean data layer)
3. F3 - State management (context)
4. F5 - Tests for core algorithms

### Phase 2: Zero Friction
5. Z1 - Keyboard shortcuts
6. Z2 - Quick capture
7. Z3 - Command palette

### Phase 3: Intelligence
8. I1 - Proactive insights
9. I3 - Smart resurface
10. I4 - Auto-linking

### Phase 4: Resilience & Polish
11. D1 - Auto-backup
12. F2 - TypeScript (can do incrementally)
13. U1-U5 - Polish items

---

## Success Metrics

- **Friction**: Time from thought to captured fossil < 30 seconds
- **Engagement**: Daily active usage without reminders
- **Intelligence**: User acts on 50%+ of AI suggestions
- **Reliability**: Zero data loss incidents
- **Performance**: < 100ms interactions, < 2s initial load

---

*Last updated: 2025-12-31*
