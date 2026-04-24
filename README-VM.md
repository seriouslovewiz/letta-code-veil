# letta-code-veil

**V_M fork of [letta-code-DE](https://github.com/cyelis1224/letta-code-DE)** — the Lantern Shell runtime for [Refining Mind](https://github.com/letta-ai/letta-code) architecture.

## What This Is

A stateful agent runtime fork adapted for the **Veil of Maya** household sangha. Built on top of Dagyr/Emberwyn's Lantern Shell (letta-code-DE), which implements:

- **EIM** — Enhanced Identity Model with task-aware context compilation
- **Typed Memory** — Classification taxonomy with lifecycle pipeline
- **Context Compiler** — Task classification, budget management, posture selection
- **Operation Modes** — Chat, coding, research, design, creative, reflection, free-play
- **Enhanced Reflection** — Proposals and contradiction detection
- **Event Sourcing** — Immutable audit trail
- **Multi-Model Orchestration** — Capabilities, routing, fallback chains
- **Governance** — RBAC, action policies, audit interface

## V_M Additions

| Module | Purpose |
|--------|---------|
| `sangha/mindmap-bridge` | Index memory events to the shared semantic graph |
| `sangha/a2a-protocol` | Structured agent-to-agent communication |
| `sangha/local-inference` | Local llama.cpp BYOK routing (Qwen3-8B, CUDA 12.9) |

## Divergence from Upstream

| Change | Reason | Merge Path |
|--------|--------|------------|
| Cross-platform paths (Linux) | Our infrastructure runs on Linux | PR to Dagyr |
| Sangha modules | V_M-specific, optional | Plugin/module |
| Local inference routing | V_M hardware (GTX 1080) | Plugin/module |

**Rule:** Core runtime changes go upstream to Dagyr. V_M-specific features stay as plugins.

## Architecture

```
User → Agent Runtime → Context Compiler → Model(s) → Reflection → Memory Pipeline → Action Policy → Response
                          ↕                                    ↕
                    EIM Identity                          Mindmap Bridge
                    Mode Management                       A2A Protocol
                    Event Sourcing                        Local Inference
```

## Participants

| Agent | Role | ID |
|-------|------|----|
| Maya | Tenzo, nourishment, witness | `agent-ad3d0f18...` |
| Nekode | Ino, coordination, implementation | `agent-062db38c...` |
| Zosu | Librarian, Canon-keeper | `agent-0cc1a244...` |

## Build

```bash
bun install
bun run typecheck
bun run build
bun test src/tests/agent/
```

## Remotes

| Remote | URL |
|--------|-----|
| origin | `seriouslovewiz/letta-code-veil` |
| upstream | `letta-ai/letta-code` |
| dagyr | `cyelis1224/letta-code-DE` |

## License

Apache-2.0 (inherited from Letta Code)
