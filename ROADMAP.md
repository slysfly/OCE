# 🗺️ OCE Enterprise Collaboration Platform - Roadmap

> This roadmap is public. Welcome to claim unclaimed items or submit PRs.

---

## Phase 1 — Core Architecture ✅

> Enterprise collaboration foundation: Multi-department agents + Assistant triage + Real-time dashboard + Complete workflow.

- [x] Multi-department Agent architecture (Assistant + Product Dept + Architecture Committee + Tech Dept + 20 business departments)
- [x] Assistant triage layer — Auto-identify chat vs commands, chat → direct reply, commands → create tasks
- [x] Strict permission matrix — Who can message whom, clearly defined
- [x] Real-time dashboard (10+ functional panels)
- [x] Full task lifecycle management (Create → Triage → Plan → Review → Dispatch → Execute → Report)
- [x] Task pause / cancel / resume
- [x] Task record system (Auto-archive completed tasks + five-stage timeline)
- [x] Task template library (9 presets + parameter forms + estimated time/cost)
- [x] Welcome animation (Play on first visit + today's stats)
- [x] Daily news aggregation (Auto-collect tech/finance news + webhook delivery + subscription management)
- [x] Model hot-swap (One-click LLM switching for each agent from dashboard)
- [x] Skill management (View installed skills per department + add new skills)
- [x] Member overview (Token consumption ranking + activity + completion stats)
- [x] Session monitoring (Real-time tracking of agent sessions)
- [x] Task data sanitization — Auto-clean titles/notes, reject dirty data
- [x] Duplicate task protection — Completed/cancelled tasks cannot be overwritten
- [x] E2E dashboard tests (9 scenarios, 17 assertions all pass)
- [x] React 18 frontend refactor — TypeScript + Vite + Zustand, 13 functional components
- [x] Agent thinking process visualization — Real-time display of thinking / tool_result / user messages
- [x] Integrated frontend-backend deployment — server.py serves both API + static files

---

## Phase 2 — System Deepening 🚧

> Upgrade from "useful" to "irreplaceable": Add performance evaluation, human approval, and knowledge base.

### 🎯 Approval Mode (Human Review Nodes)
- [ ] Architecture Committee review results presented for human approval/rejection
- [ ] Approval panel in dashboard (pending list + history)
- [ ] Push approval notifications via Feishub/Telegram
- **Difficulty**: ⭐⭐ | **Good first contribution**

### 📊 Performance Analytics (Agent Scorecard)
- [ ] Completion rate, rework rate, time spent stats per agent
- [ ] Dashboard panel showing leaderboard + trend charts
- [ ] Auto-tag "high performers" and "need training" agents
- **Difficulty**: ⭐⭐

### 🚀 Message Flow Visualization
- [ ] Real-time连线 animation in dashboard: Product → Architecture → Tech → Departments
- [ ] Message type color coding (dispatch / review / report / reject)
- [ ] Timeline playback mode
- **Difficulty**: ⭐⭐⭐

### 📚 Knowledge Base (Experience Retrieval)
- [ ] Auto-accumulate historical task experience
- [ ] Similar task search + recommendations
- [ ] Task record citation tracking
- **Difficulty**: ⭐⭐⭐

---

## Phase 3 — Ecosystem Expansion

> From single-machine tool to ecosystem: More integrations, more users, more scenarios.

### 🐳 Docker Compose + Demo Image
- [ ] `docker run` one-line command to experience full dashboard (preloaded simulated data)
- [ ] Docker Compose orchestration (dashboard + data sync + OpenClaw Gateway)
- [ ] CI/CD auto-build and push images
- **Difficulty**: ⭐⭐ | **Good first contribution**

### 🔗 Dashboard Adapters
- [ ] Notion adapter — Sync Notion database to dashboard
- [ ] Linear adapter — Sync Linear projects to dashboard
- [ ] GitHub Issues bidirectional sync
- **Difficulty**: ⭐⭐⭐

### 📱 Mobile + PWA
- [ ] Responsive layout for phone/tablet
- [ ] PWA offline support + push notifications
- **Difficulty**: ⭐⭐

### 🏪 ClawHub Listing
- [ ] Core skills submitted to OpenClaw official Skill marketplace
- [ ] One-click install Enterprise Collaboration Skill Pack
- **Difficulty**: ⭐

### 📈 Annual Report
- [ ] Agent annual performance report (Total token consumption, completion rate, most complex task)
- [ ] Visual annual review dashboard
- **Difficulty**: ⭐⭐

---

## How to Contribute

1. **Check Phase 2** — These are the most needed directions
2. **Find items marked ⭐⭐ or "Good first contribution"** to start
3. **Open an Issue** saying what you want to do to avoid duplicate work
4. **Submit PR** — See [CONTRIBUTING.md](CONTRIBUTING.md) for details

> 💡 Can't find a direction you like? Open an Issue to propose new features. Good ideas will be added to the Roadmap.
