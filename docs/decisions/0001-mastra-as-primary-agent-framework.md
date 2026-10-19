# ADR 0001: Mastra as Primary Agent Orchestration Framework

## Status
Accepted

## Context
We are designing an Autonomous Data Analyst application in TypeScript capable of reasoning about user questions, inspecting schemas, generating and executing safe analytical queries, performing statistical analyses, and producing reproducible reports.

Multiple agent frameworks exist in the JavaScript/TypeScript ecosystem, including Mastra, LangChain.js, LangGraph.js, and Vercel AI SDK. We need a unified architectural foundation that provides typed agents, workflow graphs, tool execution, and observability without architectural fragmentation or redundant orchestration layers.

## Decision
We select **Mastra** (`@mastra/core`) as the primary agent orchestration framework for the application.

1. **Unified Agent & Workflow Architecture**: Mastra provides first-class primitives for typed agents, workflow pipelines, tool execution with Zod schemas, and local development studio integration out of the box.
2. **Single Orchestration Layer**: We explicitly decline to introduce LangChain or LangGraph as competing orchestration layers. Having multiple agent frameworks simultaneously orchestrate the same workflows creates conflicting abstractions, duplicated memory/context managers, unpredictable error boundaries, and unnecessary dependency overhead.
3. **Frontend Integration via Vercel AI SDK (Future)**: Vercel AI SDK will be evaluated specifically at the frontend/UI streaming layer in later milestones where appropriate, without replacing Mastra as the backend agent engine.

## Consequences
- The backend agent and workflow definitions adhere strictly to Mastra conventions (`src/mastra/index.ts`, `src/mastra/agents/`, `src/mastra/workflows/`, `src/mastra/tools/`).
- Local inspection and debugging are supported via Mastra Studio (`mastra dev`).
- Any future orchestration needs (such as multi-stage analysis workflows) will be built using Mastra Workflows rather than external orchestration libraries.
