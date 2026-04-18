# 🔬 Research Agent Orchestrator

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-NIM-76B900?style=for-the-badge&logo=nvidia)](https://www.nvidia.com/en-us/ai/)

**Next-Generation Multi-Agent Research Engine**
*Transforming raw queries into structured, verified intelligence reports.*

</div>

---

## 🏗️ System Architecture & Flow

The system operates on an asynchronous state machine that prioritizes query intelligence before search execution to minimize hallucinatory drift.

```mermaid
graph TD
    A[User Query] --> B{Query Router}
    B -->|Simple| C[Standard Chat]
    B -->|Research| D[Agent Orchestrator]
    
    subgraph "Phase 1: Intelligence"
    D --> E[Query Intelligence Agent]
    E -->|Refinement| F[Enhanced Prompt]
    end
    
    subgraph "Phase 2: Retrieval"
    F --> G[Web Search Agent]
    G -->|Concurrent Search| H[Source Aggregator]
    H -->|Local Context| I[File Parsers]
    end
    
    subgraph "Phase 3: Analysis & Synthesis"
    H & I --> J[Analysis Agent]
    H & I --> K[Fact-Check Agent]
    H & I --> L[Coding Agent]
    J & K & L --> M[Report Synthesis Agent]
    end
    
    M --> N[SSE Stream Response]
```

---

## ⚡ Core Features Breakdown

*   **🌐 Intelligent Retrieval**: Powered by **Perplexity Sonar**, executing targeted concurrent searches based on agent-generated keywords rather than raw user input.
*   **🤖 Specialized Fleet Ops**:
    *   **Query Intelligence**: Automatically identifies sub-topics and cross-references them with primary intent.
    *   **Strategic Analysis**: Uses `NVIDIA/Nemotron-3-Super` for high-density reasoning and data synthesis.
    *   **Automated Verification**: The **Fact-Check Agent** compares synthesized claims against retrieved search snippets to flag contradictions.
    *   **Expert Synthesis**: Final reports are generated using `MoonshotAI/Kimi-K2-Thinking` for superior markdown structure and readability.
*   **🧠 Adaptive Routing**: Automatically shifts between specialized models for **Coding** (`Qwen-3-Coder`), **Reasoning**, and **Summarization** to optimize for both cost and quality.
*   **📄 Multi-Modal Intake**: Unified ingestion engine for `PDF`, `DOCX`, `CSV`, and `Images (OCR)` using high-performance WASM and browser-native libraries.
*   **🌊 Dynamic SSE Streaming**: Full transparency into the orchestration process. Real-time updates for every agent transition, latency metric, and model selection.

---

## 📖 Documentation & Integration

### **Agent Roles & Responsibilities**
*   **Analysis Agent**: Processes up to 8 distinct sources to find patterns, correlations, and strategic insights.
*   **Fact-Check Agent**: Performs cross-source validation. If Source A contradicts Source B, it flags the discrepancy in the "Verification" section.
*   **Coding Agent**: Activated only when `intent == "coding"`. Provides optimized snippets and architecture explanations.
*   **Report Agent**: The final "Editor-in-Chief" that ensures the final Markdown output remains professional and consistent.

### **API Endpoints**
| Method | Path | Description |
| :--- | :--- | :--- |
| **POST** | `/api/research` | Main SSE endpoint. Payload: `{ query, mode, files }`. |
| **GET** | `/api/health` | System health check and API provider validation. |

---

## 🚀 Getting Started

### **1. Installation**
```bash
# Clone and install
npm install
```

### **2. Environment Setup**
Create a `.env.local` file with the following keys:
```env
# REQUIRED
PERPLEXITY_API_KEY=xxx
NVIDIA_API_KEY=xxx

# OPTIONAL (Fallbacks)
OPENROUTER_API_KEY=xxx
```

### **3. Scripts**
*   `npm run dev`: Start local development server on port 3000.
*   `npm run build`: Generate production-optimized build.
*   `npm run lint`: Execute ESLint validation.

---

## 🌐 Connect & Connect

<div align="center">

### **Created by Girish Lade**

[![Website](https://img.shields.io/badge/Website-ladestack.in-6366F1?style=for-the-badge&logo=safari&logoColor=white)](https://ladestack.in)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Girish_Lade-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/girish-lade-075bba201/)
[![GitHub](https://img.shields.io/badge/GitHub-girishlade111-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/girishlade111)

[![Instagram](https://img.shields.io/badge/Instagram-@girish__lade__-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/girish_lade_/)
[![CodePen](https://img.shields.io/badge/CodePen-Girish_Lade-000000?style=for-the-badge&logo=codepen&logoColor=white)](https://codepen.io/Girish-Lade-the-looper)
[![Email](https://img.shields.io/badge/Email-admin@ladestack.in-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:admin@ladestack.in)

</div>

---

## 📁 Project Structure

*   `app/api/research/`: Orchestrator execution layer.
*   `lib/engine/`: Core logic including agent prompts, model routers, and file parsers.
*   `components/`: Glassmorphic UI layout and agent tracking panels.

---

## 📄 License

This project is private and proprietary. All rights reserved.
