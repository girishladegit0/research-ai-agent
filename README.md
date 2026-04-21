<div align="center">

# 🔬 ResAgent: Advanced Multi-Agent Research Orchestrator

[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-NIM-76B900?style=for-the-badge&logo=nvidia)](https://www.nvidia.com/en-us/ai/)

**Next-Generation Multi-Agent Research Engine**  
*Transforming raw queries into massive, structured, and fact-checked intelligence reports spanning 5-6 pages.*

[Explore the Codebase](#-project-structure) • [System Architecture](#-system-architecture--flow) • [Getting Started](#-getting-started) • [Creator Info](#-connect--contact)

</div>

---

## 🌟 Executive Summary

**ResAgent** is not just a chatbot—it is a deeply orchestrated **multi-agent AI research system**. It leverages an array of specialized AI agents working concurrently to fetch, synthesize, analyze, and verify data. The final output is an exhaustive, beautifully formatted 4000-6000 word research report, equipped with a comprehensive fact-check and coding implementation (when applicable). 

> **💡 Key Highlight:** ResAgent utilizes dynamic model routing, seamlessly falling back to high-capacity context models (up to **131,072 tokens**) if the primary endpoints encounter rate limits, ensuring uninterrupted massive report generation.

---

## 🚀 Core Features Breakdown

*   **🌐 Intelligent Retrieval**: Performs concurrent, heavily optimized web searches triggered by a dedicated Query Intelligence Agent rather than raw user input.
*   **🤖 Specialized Fleet Operations**:
    *   **Query Intelligence**: Automatically expands simple queries into massive, multi-layered research directives.
    *   **Deep Analysis**: Uses models like `NVIDIA/Nemotron-3-Super` to extract profound, non-obvious patterns from raw data.
    *   **Rigorous Fact-Checking**: Cross-references every retrieved claim, scoring reliability (0-100) and flagging potential contradictions.
    *   **Production-Grade Coding**: Analyzes architecture and generates edge-case-handled code via `Qwen-3-Coder` when the intent is coding.
    *   **Report Synthesis**: The master orchestrator (`MoonshotAI/Kimi-K2-Thinking`) compiles upstream data into a massive 6-8 chapter report.
*   **📄 Multi-Modal Intake**: Unified file parsing supporting `PDF` (pdf.js), `DOCX` (mammoth), `CSV` (PapaParse), and `Images` (Tesseract.js OCR).
*   **🌊 Dynamic SSE Streaming**: Highly optimized React frontend displaying real-time agent progression, latency metrics, and progressive Markdown reveal without freezing the UI.

---

## 🏗️ System Architecture & Flow (Deep Dive)

The system operates on an advanced asynchronous state machine that forces extensive query analysis *before* execution to eliminate hallucinatory drift and ensure maximum depth.

```mermaid
graph TD
    classDef user fill:#2d3748,stroke:#4a5568,color:#fff;
    classDef router fill:#805ad5,stroke:#553c9a,color:#fff;
    classDef agent fill:#319795,stroke:#44337a,color:#fff;
    classDef search fill:#38a169,stroke:#276749,color:#fff;
    classDef report fill:#dd6b20,stroke:#9b2c2c,color:#fff;
    classDef ui fill:#000000,stroke:#2d3748,color:#fff,stroke-width:2px;

    A([User Query + Files]):::user --> B{Intent Router & Cache Check}:::router
    
    B -->|Direct Match| C[Simple Chat Interface]:::ui
    B -->|Deep Research Mode| D[Multi-Agent Orchestrator]:::router
    
    subgraph "Phase 1: Intelligence Generation"
        D --> E[Query Intelligence Agent]:::agent
        E -->|Expands Context| F([Enhanced Research Blueprint])
    end
    
    subgraph "Phase 2: Data Aggregation"
        F --> G[Web Search Agent]:::search
        G -->|Concurrent Perplexity/LLM Search| H([Web Sources Aggregator])
        A -->|OCR/WASM Parsing| I([Local File Context])
    end
    
    subgraph "Phase 3: Parallel Synthesis & Verification"
        H & I --> J[Analysis Agent]:::agent
        H & I --> K[Summary Agent]:::agent
        H & I --> L[Fact-Check Agent]:::agent
        H & I --> M[Coding Agent]:::agent
    end
    
    subgraph "Phase 4: Massive Report Generation"
        J & K & L & M --> N[Report Synthesis Agent]:::report
        N -->|Compiles 5-6 Pages| O([Final JSON Structure])
    end
    
    O --> P[React Server-Sent Events (SSE) Stream]:::ui
    P --> Q[Progressive Markdown UI Reveal]:::ui
```

### **The Execution Loop**
1. **Blueprint Generation**: The *Query Intelligence Agent* breaks the query into 8-12 self-contained research vectors.
2. **Parallel Processing**: The *Summary*, *Analysis*, *Fact-Check*, and *Coding* agents run simultaneously. Each agent has an isolated `8192` token budget to generate at least one full page of deeply reasoned content.
3. **Fallback Race Condition**: If a primary NVIDIA NIM model fails to respond within 60 seconds, the orchestrator triggers an OpenRouter fallback model concurrently, accepting whichever finishes first.
4. **Final Synthesis**: The *Report Agent* absorbs all upstream data (utilizing a massive `32,768` token budget) to draft a 4000-6000 word, highly sectioned master document.

---

<details>
<summary><b>🛠️ Developer Stack & Dependencies (Click to Expand)</b></summary>

### **Frontend & UI**
*   **Framework**: Next.js 16.2.4 (App Router, Turbopack)
*   **UI Library**: React 19.2.4
*   **Styling**: Tailwind CSS v4.0, clsx, tailwind-merge
*   **Animations**: Framer Motion 12.38
*   **Markdown Parsing**: React-Markdown 10.1 (Highly memoized to prevent re-renders)
*   **Icons**: Lucide React

### **Backend & Engine**
*   **Orchestration**: Custom asynchronous multi-agent pipeline (Node.js/Next.js API routes)
*   **Primary AI Endpoints**: NVIDIA NIM (Integrate API)
*   **Fallback AI Endpoints**: OpenRouter (Free tier models)
*   **File Parsing**:
    *   `pdfjs-dist` (PDF)
    *   `mammoth` (Word/DOCX)
    *   `papaparse` (CSV)
    *   `tesseract.js` (Image OCR)

</details>

---

<details>
<summary><b>⚙️ Configurations & Token Stats (Click to Expand)</b></summary>

The engine is heavily optimized to manage massive context windows without failing.

| Configuration Area | Specification | Description |
| :--- | :--- | :--- |
| **Max Global Context** | `131,072 Tokens` | Supports massive document ingestion via Llama 3.3 70B fallback. |
| **Report Generation Budget** | `32,768 Tokens` | Ensures the Report Agent never truncates the final 6-page synthesis. |
| **Agent Budget (Per Agent)** | `8,192 Tokens` | Strict budget enforcing deep, one-page minimal outputs per agent. |
| **Fallback Race Timeout** | `60,000 ms` | Primary models are raced against fallbacks if slow, capping at 120s max. |

</details>

---

## 🚀 Getting Started

Follow these instructions to spin up the local development environment.

### **1. Installation**
Clone the repository and install the high-performance dependencies:
```bash
git clone https://github.com/girishlade111/research-agent.git
cd research-agent
npm install
```

### **2. Environment Configuration**
The system relies on primary and fallback AI endpoints. Create a `.env.local` file in the root directory:
```env
# REQUIRED: Primary high-speed reasoning endpoints
NVIDIA_API_KEY=your_nvidia_nim_key_here

# OPTIONAL: Web Search augmentation
PERPLEXITY_API_KEY=your_perplexity_sonar_key_here

# OPTIONAL: Massive context fallback endpoints
OPENROUTER_API_KEY=your_openrouter_key_here
```

### **3. Available Scripts**
Start the application using the ultra-fast Turbopack compiler:
*   `npm run dev` — Starts the local development server on `http://localhost:3000`.
*   `npm run build` — Generates the optimized production static and dynamic builds.
*   `npm run start` — Boots the production server.
*   `npm run lint` — Validates strict TypeScript and ESLint standards.

---

## 📁 Project Structure

```text
research-agent/
├── app/
│   ├── api/research/      # Primary SSE stream and orchestrator endpoint
│   └── page.tsx           # React UI: Chat bubbles, Progressive Reveal, and State
├── components/
│   ├── agents/            # Agent status trackers and visual panels
│   ├── response/          # React-Markdown Memoized rendering & sources UI
│   └── layout/            # Sidebar and responsive navigation wrappers
├── lib/
│   ├── engine/            # The Core Brain
│   │   ├── agents/        # System prompts and specific logic for all 6 agents
│   │   ├── providers/     # Fetch handlers for NVIDIA and OpenRouter
│   │   ├── config.ts      # Global limits, timeouts, and Model Registries
│   │   └── orchestrator.ts# Parallel execution and fallback race conditions
│   └── utils.ts           # Global UI utilities
```

---

## 🌐 Connect & Contact

<div align="center">

### **Created by Girish Lade**
*UI/UX Developer, AI Engineer, and Founder of Lade Stack.*

[![Website](https://img.shields.io/badge/Website-ladestack.in-6366F1?style=for-the-badge&logo=safari&logoColor=white)](https://ladestack.in)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Girish_Lade-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/girish-lade-075bba201/)
[![GitHub](https://img.shields.io/badge/GitHub-girishlade111-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/girishlade111)

[![Instagram](https://img.shields.io/badge/Instagram-@girish__lade__-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/girish_lade_/)
[![CodePen](https://img.shields.io/badge/CodePen-Girish_Lade-000000?style=for-the-badge&logo=codepen&logoColor=white)](https://codepen.io/Girish-Lade-the-looper)
[![Email](https://img.shields.io/badge/Email-admin@ladestack.in-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:admin@ladestack.in)

</div>

---

## 📄 License

This project is private and proprietary. All rights reserved. Powered by the Lade Stack ecosystem.