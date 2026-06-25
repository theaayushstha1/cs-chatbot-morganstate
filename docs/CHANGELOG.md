# Changelog

All notable changes to CS Navigator are documented here.

## [6.2] - 2026-06-23
### Added
- Conjoined workspace layout: the problem guide, editor, and terminal now read as one unit. The terminal is docked inside the editor column (no longer a detached floating footer) with a draggable divider — drag to resize, height is remembered, and the editor always keeps priority so it can't be crushed
- Language selector moved into the editor title bar as plain orange text + chevron (LeetCode-style), replacing the standalone dropdown
- Editor action buttons converted to compact icons in the title bar (Run ▶, Mark Solved ✓, Copy, Clear ↺) with tooltips, freeing the full bottom row for the editor; Apply AI Code now lives only in the chat widget
- Conversational Coding Tutor chat: removed the "pick a mode before you talk" gate; just type and the tutor infers intent (hint/debug/review/etc.) and auto-attaches your workspace code. Two optional top shortcuts remain: Debug (sends immediately) and Rewrite (pick a target language first, then send)
- Terminal: estimated time-complexity of your code shown in the Tests pane, a Stop button to abort a stuck/looping run, and an "Ask for a review" action
- Real terminal dock styling: darker header, monospace typography, run-state status pill (READY/RUNNING/PASSED/FAILED), and distinct editor vs panel vs terminal surfaces

### Changed
- Tablet (768–1023px): opening the main sidebar now pushes/resizes the content instead of overlaying it, using a balanced narrower 220px sidebar so both the sidebar and workspace get reasonable room

### Fixed
- Dark-mode editor: code was invisible (only shown when highlighted) because a dark-theme rule painted an opaque background over the syntax-highlight overlay; the overlay is now fully self-contained and the textarea stays transparent
- Dark-mode Examples/code blocks were invisible (used an undefined `--text-primary` that fell back to near-black); now use the theme text color
- Workspace had an empty scroll gap above the editor and a shrunken editor when the terminal opened — fixed by making the workspace a fixed-height shell sized to the viewport minus the (responsive) navbar
- The Coding Tutor chat again sends your workspace code as context from any sub-page when code (or a loaded problem) is present
- Removed 97 unused/dead CSS classes across the coding-tutor and shared stylesheets

## [6.1] - 2026-06-23
### Added
- Java and C++ code runners for the Coding Tutor: compile-then-run in the same sandbox as Python/JS, with per-language security validation (blocking file/network/process/reflection/threads), CPU/memory/file/descriptor limits, and graceful "compiler not installed" fallbacks
- Autograding for all 60 quiz-bank problems across all four languages (easy + medium + hard): Python 60/60, JavaScript 60/60, Java 57/60, C++ 57/60 (the three Java/C++ gaps — Group Anagrams, Clone Graph, and Serialize Binary Tree — all use map/tree types the static harness can't represent, and stay covered in Python/JS)
- Free-run mode extended to Java and C++ (run a complete program, capture output, no grading)
- Editor: per-language syntax highlighting (keywords, strings, comments, numbers, calls, brackets), auto-closing brackets and quotes, and smart backspace that deletes a full indent at once
- Backend Docker image now bundles a JDK and g++ so Java/C++ autograding works on Cloud Run

### Fixed
- JVM startup under the sandbox: the strict virtual-address-space limit killed `javac`/`java` ("could not reserve enough space for object heap"); added a JVM-specific resource profile so Java compiles and runs while native binaries keep the tight limit
- Graded and free-run endpoints no longer reject Java/C++ (they previously returned a "Python/JavaScript only" message, making the new runners unreachable)
- Audit caught Serialize Binary Tree (hard-16) being silently mis-gradable in Java/C++ — its tree-as-map input can't round-trip through the static harness, so a correct answer would always fail; now excluded from those two languages (still graded in Python/JS)

## [6.0] - 2026-06-19
### Added
- Coding Tutor: in-browser practice workspace with a Monaco-style editor, Quiz Bank, Interview Prep packs, and a Progress view
- Sandboxed Python and JavaScript code runners (subprocess isolation, security validation, timeouts, rate limiting) with local test execution for the quiz bank
- Personal free-run mode: run arbitrary user code with no autograding
- VS Code-style docked terminal footer showing program output and test results
- Floating Coding Tutor chat with response-mode awareness (hint, debug, review, rewrite, generate) and an Apply AI Code flow
- Workspace snapshots (starter / current / AI rewrite / last passing) and a post-run code-quality checklist
- Progressive hint ladder and "Explain this error" / "Explain failed tests" handoff to the tutor
- Verified YouTube video resources: live YouTube Data API v3 search (safe-search, embeddable-only, quota cache) combined with a curated local catalog, played inline in chat with a click-to-play facade and an Open-on-YouTube fallback
- Explicit "General" tutor mode plus a third tutor toggle (CS Nav / General / Coding)

### Changed
- Question routing flipped to a deny-list: the knowledge base is prioritized for Morgan and student-record questions, and any other self-contained question goes to Gemini directly
- Conversation-aware routing with session tracks: ambiguous follow-ups inherit the prior track while self-contained questions reclassify on their own content; greetings stay track-neutral
- Three-tier caching (L1 / L2 / semantic) now covers non-Morgan answers, namespaced by context hash
- "Thinking" animation now reflects the real track (regular / general / coding) instead of always showing a knowledge-base step

### Fixed
- Cross-chat ADK memory blending: agent session keys now include both user id and chat session id so separate chats do not share hidden memory
- Inline video playback failures (iframe orphaned inside a paragraph, player resetting to the thumbnail on re-render)
- Chat flashing / black screen while typing a follow-up, and bot replies occasionally rendered as the user's message
- Gemini 429 / empty responses now surface a clean retryable error instead of garbled partial text
- Responsive chat on small screens (off-canvas sidebar drawer no longer hides the chat)

## [5.0] - 2026-04-04
### Added
- DatabaseSessionService for multi-instance session persistence
- Grounding gate that catches agent hallucinations via KB chunk count
- 3-layer follow-up resolver (regex override, entity focus, LLM fallback)
- Course context engine (prereqs, schedules, faculty pre-computed on backend)
- Canvas LMS REST API integration with lazy loading
- Self-healing research pipeline (detect, cluster, research, suggest KB fixes)
- Guest personal query interception (redirects to signup)
- Data source tracking (manual_entry vs pdf_parse vs banner_scrape)
- KB failure auto-retry with 2s delay
- 43-category Promptfoo red team security audit
- 9 agent security rules (jailbreak, role-play, calibration framing)
- Cloud Scheduler cron jobs for memory consolidation

### Changed
- Session TTL extended from 30 minutes to 24 hours
- min-instances bumped to 2 for ADK and backend
- Registration restricted to morgan.edu (test.com gated by env var)

### Fixed
- Guest chat fabricating random GPAs from hardcoded array
- Context bleed between unrelated follow-up questions
- Agent contradicting itself about DegreeWorks access mid-conversation
- ADK session 404 errors during multi-instance load balancing
- Profile picture CSS leaking to non-sidebar elements
- TTS button not showing stop state during playback
- Ticket attachment uploads failing on large screenshots

### Removed
- Manual DegreeWorks entry form (unverified data risk)
- Bookmarklet sync (replaced by Banner auto-sync + PDF upload)
- Hardcoded admin credentials in seed scripts

## [4.3] - 2026-04-01
### Added
- Email verification and forgot password flow
- Auto-research pipeline with failed query clustering
- Structured KB v7 with 51 documents

## [4.0] - 2026-03-12
### Fixed
- Agent accuracy improved from 39% to 100% via fresh session strategy
- Semantic caching for similar question matching

## [3.0] - 2026-03-09
### Added
- 8-specialist multi-agent architecture
- Promptfoo security test suite (23 tests)

### Changed
- Replaced single agent with specialist routing

## [2.2] - 2026-03-08
### Added
- Multi-tier caching (L1 in-memory + L2 Redis Cloud)
- SSE streaming for real-time chat

## [2.0] - 2026-03-05
### Changed
- Migrated from RAG pipeline to Google ADK Agent Engine
- Replaced Pinecone + OpenAI with Vertex AI Search + Gemini

## [1.0] - 2026-02-15
### Added
- Initial release with RAG pipeline
- Pinecone vector DB + OpenAI GPT-3.5-turbo
- Basic chat interface
- AWS EC2 deployment
