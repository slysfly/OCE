# 🏢 OCE Enterprise Collaboration Platform

<p align="center">
  <strong>AI Multi-Agent Orchestration Based on Modern Enterprise Governance</strong>
</p>

<p align="center">
  <sub>20 departments + 143 employees + 10 intelligent assistants form a clear division of labor and responsibilities.<br>Built-in <b>institutional review gates</b> that CrewAI doesn't have. A <b>real-time dashboard</b> that AutoGen doesn't have.</sub>
</p>

<p align="center">
  <a href="#-demo">🎬 Demo</a> ·
  <a href="#-quick-start">🚀 Quick Start</a> ·
  <a href="#-architecture">🏗️ Architecture</a> ·
  <a href="#-features">📋 Features</a> ·
  <a href="README.md">中文</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenClaw-Required-blue?style=flat-square" alt="OpenClaw">
  <img src="https://img.shields.io/badge/Python-3.9+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Agents-20_Departments-8B5CF6?style=flat-square" alt="Agents">
  <img src="https://img.shields.io/badge/Dashboard-Real--time-F59E0B?style=flat-square" alt="Dashboard">
  <img src="https://img.shields.io/badge/License-MIT-22C55E?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Frontend-React_18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
</p>

---

## 🎬 Demo

<p align="center">
  <video src="docs/Agent_video_Pippit_20260225121727.mp4" width="100%" autoplay muted loop playsinline controls>
    Your browser does not support video playback. See the GIF below.
  </video>
  <br>
  <sub>🎥 Full demo: AI Multi-Agent collaboration workflow</sub>
</p>

> 🐳 **No OpenClaw?** Run `docker run -p 7891:7891 cft0808/oce` to try the full dashboard.

---

## 💡 Why OCE?

Most multi-agent frameworks let AI agents talk freely, producing opaque results you can't audit or intervene in. **OCE** takes a radically different approach — modern enterprise governance:

```
Leader → Assistant (Triage) → Product Dept (Planning) → Architecture Committee (Review) → Tech Dept (Dispatch) → Departments (Execute) → Report
```

This is **real separation of powers**:

| | CrewAI | MetaGPT | AutoGen | **OCE** |
|---|:---:|:---:|:---:|:---:|
| **Review mechanism** | ❌ None | ⚠️ Optional | ⚠️ Optional | **✅ Dedicated reviewer** |
| **Real-time dashboard** | ❌ | ❌ | ❌ | **✅ Management panel + timeline** |
| **Task intervention** | ❌ | ❌ | ❌ | **✅ Pause / Cancel / Resume** |
| **Audit trail** | ⚠️ | ⚠️ | ❌ | **✅ Complete task records** |
| **Agent health monitoring** | ❌ | ❌ | ❌ | **✅ Heartbeat detection** |
| **Hot-swap LLM models** | ❌ | ❌ | ❌ | **✅ One-click from dashboard** |
| **Skill management** | ❌ | ❌ | ❌ | **✅ View / Add skills** |
| **News aggregation** | ❌ | ❌ | ❌ | **✅ Daily digest + webhook** |
| **Setup complexity** | Med | High | Med | **Low · One-click / Docker** |

---

## ✨ Features

### 🏢 Multi-Department Agent Architecture

- **Assistant** - Message triage (chat → auto-reply, commands → tasks)
- **Product Dept** - Planning and solution design
- **Architecture Committee** - Review and approval
- **Tech Dept** - Task dispatch and coordination
- **20 Business Departments** - Parallel execution (Dev, Ops, Security, Data, Operations, Marketing, Procurement, Docs, Consulting, PM, Product Mgmt, Management, PMO, etc.)
- Strict permission matrix
- Automatic data sanitization

### 📋 Management Panel (10+ Modules)

| Module | Function |
|--------|----------|
| **Task Kanban** | Status columns, filtering, badges, details, pause/cancel/resume |
| **Department Monitor** | Task distribution, load visualization, health status |
| **Task Records** | Archive completed tasks, timeline, Markdown export |
| **Task Templates** | 9 presets, forms, time/cost estimation |
| **Member Overview** | Token ranking, activity, completion stats |
| **Daily News** | Auto-collect tech/finance news, subscriptions |
| **Model Config** | Per-agent LLM switching |
| **Skill Config** | Department skills overview, add new skills |
| **Session Monitor** | Real-time agent session monitoring |
| **Welcome Screen** | Intro animation on first visit |
| **Multi-party Discussion** | Multiple agents discuss topics |

---

## 🚀 Quick Start

### Docker One-liner

```bash
docker run -p 7891:7891 cft0808/oce
```

Open http://localhost:7891 to access.

### Full Installation

```bash
git clone https://github.com/cft0808/oce.git
cd oce
chmod +x install.sh && ./install.sh
```

### Start Services

```bash
# Data refresh loop
bash scripts/run_loop.sh

# Dashboard server
python3 dashboard/server.py

# Open browser
open http://127.0.0.1:7891
```

---

## 🏗️ Architecture

```
                    ┌─────────────────────┐
                    │       Leader        │
                    │  Feishu · Telegram  │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │      Assistant      │
                    │  Message Triage    │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │    Product Dept    │
                    │   Planning/Design  │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │ Architecture Comm  │
                    │  Review/Approve    │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │      Tech Dept     │
                    │ Dispatch/Coord     │
                    └───┬─────┬─────┬─────┬───┐
                        │     │     │     │   │
                   ┌────▼┐ ┌───▼┐ ┌▼────┐ ┌▼────┐
                   │ Data │ │ Dev │ │ Ops │ │Secur│
                   └──────┘ └─────┘ └─────┘ └─────┘
```

---

## 📁 Project Structure

```
oce/
├── agents/                 # Agent personality configs
├── dashboard/             # Dashboard
│   ├── dashboard.html     # Frontend
│   ├── server.py          # API server
│   └── court_discuss.py  # Discussion feature
├── scripts/               # Management scripts
├── docs/                 # Documentation
├── examples/             # Usage examples
└── install.sh            # Installation script
```

---

## 🔧 Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite + Zustand |
| Backend | Python stdlib (zero dependencies) |
| Framework | OpenClaw |
| Deployment | Docker / One-click script |

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  <strong>🤖 Modern Enterprise Governance for AI Collaboration</strong>
</p>
