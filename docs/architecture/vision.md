# Lantern Shell Architecture Vision

A stateful agent runtime where the LLM is one organ in a larger loop.

## Core Principle

The agent runtime — not the model — is the center of the system. The runtime decides:
- What context matters
- What memories should be retrieved
- What posture should be maintained
- What tools are allowed
- What should be saved
- What should be forgotten
- What needs human confirmation
- What changed after this interaction

## Architecture Layers

```
┌───────────────────────────────────────────────┐
│                User Interfaces                │
│  CLI • desktop • channels • headless           │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│              Agent Runtime Layer              │
│  turn loop • context compilation • mode mgmt  │
│  tool routing • interruption • confirmations   │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│              Context Assembly Layer           │
│  EIM identity (selective) • retrieved memories│
│  mode constraints • project state • tool res   │
│  conversation window • task constraints       │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│               Model Serving Layer             │
│  primary model • classifiers • rerankers      │
│  critics • embedding models • safety judges   │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│              Memory & Reflection Layer        │
│  typed memory • lifecycle pipeline            │
│  contradiction detection • consolidation      │
│  review queues • memory candidates            │
│  scheduled reflection • posture drift checks  │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│              Governance / Safety Layer        │
│  risk tiers • audit log • action gating       │
│  memory consent • drift checks • rollback      │
└───────────────────────────────────────────────┘
```

## Data Flow

```
User → Agent Runtime → Context Compiler → Model(s) → Reflection → Memory Pipeline → Action Policy → Response
```

## What Makes This Different From a Chatbot

1. **Selective identity loading** — Not every turn loads the full persona. The context compiler loads the posture appropriate for the current task and mode.

2. **Typed memory with lifecycle** — Memories are classified (episodic, semantic, procedural, relationship, project, reflective), scored for importance, checked for sensitivity, and routed through a review pipeline before storage.

3. **Structured reflection** — Reflection produces reviewable proposals, not silent edits. It detects contradictions, evaluates posture drift, and suggests consolidation.

4. **Explicit modes** — Chat, research, design, coding, reflection, free-play. Each mode has different context rules, tool access, and permissions.

5. **Event-sourced audit trail** — Every meaningful action is a structured event. The system is auditable, debuggable, and rollback-capable.

6. **Multi-model orchestration** — A single turn can involve intent classification, memory extraction, reranking, criticism, and safety checks via specialized model calls.

## Implementation Phases

See the project's `.letta/plans/` directory for the full phased plan.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| EIM format | Hybrid prose + structure | Prose carries voice; structure carries queryable metadata |
| Memory pipeline timing | Async (post-turn) | Keeps main turn fast; high-confidence candidates auto-approved |
| Search backend | Letta API (server-side) | Vector/FTS indexes live server-side; avoids local infra complexity |
| Target platform | Cross-platform (Linux + Windows) | API-based orchestration preferred; local classifiers optional |
| Project naming | letta-code-veil | V_M fork of letta-code-DE; building toward Refining Mind integration |
