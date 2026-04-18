# CLAUDE.md — Project Guide

## 🚀 Environment & Commands
- **Install**: `npm install`
- **Dev**: `npm run dev` (Runs on [localhost:3000](http://localhost:3000))
- **Build**: `npm run build`
- **Lint**: `npm run lint`

## 🛠️ Technology Stack
- **Framework**: Next.js 16.2.4 (App Router)
- **Library**: React 19.2.4
- **Styling**: Tailwind CSS 4.0 + `tw-animate-css`
- **Logic Engine**: Multi-Agent Orchestration (Custom SSE Engine)
- **Providers**: NVIDIA NIM (Primary), OpenRouter (Fallback)

## 📁 Key File Paths
- **Orchestration**: `lib/engine/orchestrator.ts`
- **Agents**: `lib/engine/agents/*.ts`
- **Research API**: `app/api/research/route.ts`
- **Design Tokens**: `app/globals.css`

## 📝 Code Style & Patterns
- **Types**: Always use TypeScript. Types are defined in `lib/engine/types.ts`.
- **Components**: Follow the `components/` feature-based structure. Use shadcn/ui and Radix.
- **Agents**: Extend `BaseAgent` or follow the functional runner pattern in `lib/engine/agents/`.
- **Styling**: Use Tailwind 4 class utilities. Prefer glassmorphism (`.glass`, `.glass-card`) for UI elements.
- **Streaming**: All research logic must support SSE streaming (using `StreamCallback`).

## 🛡️ Best Practices
- **Error Handling**: Use `lib/engine/errors.ts` for classifying and displaying user-facing errors.
- **Retries**: Follow `RETRY_CONFIG` (1 max retry, prefer fallback chain).
- **Tokens**: Monitor `TOKEN_LIMITS` strictly to avoid context blowout.
