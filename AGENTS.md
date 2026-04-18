<!-- BEGIN:nextjs-agent-rules -->
# ⚠️ This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 🤖 Agent Fleet Operations

This manifesto defines the roles and orchestration rules for the ResAgent multi-agent system.

## 🛰️ Agent Registry

| Agent | Purpose | Primary Model |
| :--- | :--- | :--- |
| **Query Intelligence** | Refines and enhances raw user prompts. | `kimi-k2-thinking` |
| **Web Search** | Concurrent real-time data retrieval. | `dracarys-70b` |
| **Strategic Analysis** | Pattern recognition and correlation analysis. | `nemotron-3-super` |
| **Fact-Check** | Automated verification of claims vs sources. | `mistral-large-3` |
| **Coding** | Specialized technical snippet generation. | `qwen3-coder-480b` |
| **Summary** | High-speed overview generation. | `minimax-m2.7` |
| **Report** | Final markdown assembly and quality control. | `kimi-k2-thinking` |

## 🧬 Orchestration Logic

The system follows a three-phase execution model managed by `orchestrator.ts`:

1.  **Intelligence Phase**: Intent classification and query expansion.
2.  **Retrieval Phase**: Concurrent web search and local file parsing (PDF/OCR).
3.  **Synthesis Phase**: Parallel heavy-lifting (Analysis, Coding, Fact-Check) followed by a sequential Report synthesis.

## 🛡️ Reliability & Fallbacks

- **Chain of Command**: If an NVIDIA NIM model fails, the system automatically shifts to an equivalent **OpenRouter** fallback (optimized for free-tier resiliency).
- **Concurrency**: Agents in Phase 3 run in parallel using `Promise.all` to minimize time-to-first-token (TTFT).
- **Context Grounding**: All agents must receive the `AgentContext` which includes search results and user-uploaded files.

## 📏 Token Governance

| Rule | Limit |
| :--- | :--- |
| **System Context** | 32,768 Tokens |
| **Max Report** | 16,384 Tokens |
| **Per-Agent Cap** | 8,192 Tokens |

*Tokens are managed to ensure report density without sacrificing analytical depth.*
