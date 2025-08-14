# AI-QA Agent — Detailed Requirements & UI Approach

**Purpose:** Build an LLM-powered QA agent that accepts natural-language test commands, executes them in an emulator via Appium (APME), continuously observes app state using Appium Inspector (UI tree + screenshots), and replans dynamically (feedback loop) until the test goal is achieved. The system must be usable by manual testers to automate repetitive test cases with minimal scripting.

---

## 1. Goals & Success Criteria

- Accept natural language test goals and execute them autonomously.
- Provide a real-time UI (emulator view + command panel + logs) for testers.
- Provide a robust feedback loop: observe → reason (LLM) → act (Appium) → observe.
- Produce reliable test artifacts: step-by-step logs, screenshots, and pass/fail verdicts.
- Support Android and (later) iOS.

**MVP success metrics**

- 80% of simple navigation & form-based test commands succeed without human intervention in stable apps.
- Replanning handles common popups (permissions, login prompts) automatically.
- Test execution logs + screenshots available for each run.

---

## 2. High-Level Architecture

```
+--------------------+        +--------------------+        +---------------------+
|  Web UI (React)    | <----> |  Orchestrator API  | <----> |   LLM Provider(s)   |
|  - Emulator view   |        |  (FastAPI / Node)  |        |  (OpenAI / local)   |
|  - Command panel   |        +---------+----------+        +---------------------+
+--------------------+                  |
                                        v
                               +-----------------------+
                               | UI Inspection Module  |
                               | (Appium Inspector API)|
                               +-----------------------+
                                        |
                                        v
                               +-----------------------+
                               | Execution Module      |
                               | (Appium Server + ADB) |
                               +-----------------------+
                                        |
                                        v
                               +-----------------------+
                               | Android Emulator(s)   |
                               +-----------------------+

Persistence: PostgreSQL (logs/metadata), MinIO/S3 (screenshots & page sources)

Monitoring: Prometheus + Grafana / ELK for logs
```

---

## 3. Components & Responsibilities

### 3.1 Web UI (Frontend)

- **Left panel (Emulator View):** Live stream of emulator screen (WebRTC/VNC). Click-to-focus to forward input if manual interaction is needed.
- **Right panel (Agent Console):**
  - Command input (natural language)
  - Suggested structured plan preview (from LLM)
  - Execution controls: Start, Pause, Step, Abort, Rerun
  - Execution log & step timeline (expandable steps with screenshots)
  - History browser for previous test runs
- **Top toolbar:** Select device profile (Android emulator image), choose app build (APK), toggle verbose logging.
- **Bottom area (Inspector):** Live Appium Inspector pane showing accessibility tree, element properties, and ability to pin elements (for manual annotation).

### 3.2 Orchestrator (Backend)

- **API endpoints** for frontend to: submit command, get status, fetch logs, stream screenshots, control emulator sessions.
- Holds session state (active step, element map, retry counts).
- Handles LLM prompts, receives LLM plans, converts them to Appium scripts.
- Manages persistence (logs, screenshots), queues long-running tasks (via Celery or similar).

### 3.3 LLM Module

- **Prompting patterns:** Few-shot templates for parsing goals, replanning after failures, summarizing execution.
- Exposes endpoints: `parse_goal(goal, context) -> plan`, `replan(goal, context, failure_state) -> updated_plan`.
- **Context provided to LLM:** last UI tree (trimmed), last screenshot (or description), step history, app package name, device locale.
- **Safety & limits:** Cap tokens. Validate LLM outputs against schema using JSON-schema.

### 3.4 UI Inspection Module (Appium Inspector)

- Fetch `getPageSource()` (XML/JSON) and element attributes before and after each step.
- Produce normalized element map: `{id, resource-id, content-desc, text, class, bounds}`.
- Optionally run lightweight CV (OpenCV) to match textual elements visible on screenshot when accessibility data is sparse.

### 3.5 Execution Module (Appium Server + Emulator)

- Execute Appium commands generated from plan.
- Translate Appium actions to ADB when needed (tap coordinates, input text).
- Instrument each action with: start\_ts, end\_ts, success/fail, exception trace, screenshot, page source snapshot.
- Retry handling and exponential backoff for transient failures.

### 3.6 Persistence & Reporting

- **PostgreSQL tables:** `test_runs`, `test_steps`, `errors`, `element_maps`, `devices`
- **Object storage:** Screenshots, full page sources, generated Appium scripts.
- **Reports:** Downloadable HTML/JSON report per run; CI integration hooks (webhook) to post results.

---

## 4. UI / UX Detailed Design

### Main Screen Layout

- Left 60%: Emulator viewport (resizable).
- Right 40% stacked vertically:
  - Top: Command input + quick templates
  - Middle: Plan preview & controls (Start/Pause/Step)
  - Bottom: Execution log with timeline + Inspector (tabs)

### Key UX Flows

- **Run a Command:** Type command → Preview plan → Press Start → Watch steps execute live → Inspect failures → Rerun or Save report.
- **Step Debugging:** Press Step to execute single action. Useful to build trust & debug mapping.
- **Manual Override:** Click on Inspector element to add a manual instruction or pin it for LLM ("this is the search field").
- **Re-run with fixes:** After a failure, user can edit step or let LLM replan automatically.

---

## 5. LLM Prompting & Schema Examples

### 5.1 Parse Goal Prompt (few-shot)

```
System: You are a mobile automation assistant. Input: user goal and current UI element map. Output: JSON plan (actions list).

User: Goal: "Search for McDonald's and open its page"
Context: <trimmed element map>
Output:
{ "app": "in.swiggy.android", "steps": [ {"action":"launch_app"}, {"action":"click","by":"id","selector":"search_bar"}, {"action":"type","by":"id","selector":"search_input","text":"McDonald's"}, {"action":"click","by":"xpath","selector":"//android.widget.TextView[@text=\"McDonald's\"]"} ] }
```

**Validation:** Backend validates that the returned JSON conforms to the `PlanSchema` and rejects/requests re-generation if malformed.

### 5.2 Replan Prompt on Failure

- Provide: goal, failed step index, captured page source, recent logs, last screenshot description.
- Ask LLM to return: corrected steps, reason for correction, confidence score.

---

## 6. Appium Script Generation (APME)

- Implement a translator that converts plan `action` objects into Appium client calls for Python/Node.
- Support core actions: `launch_app`, `click`, `tap_coords`, `type`, `select_suggestion`, `swipe`, `back`, `wait_for_element`, `take_screenshot`, `grant_permission`.
- Include implicit waits and polling for asynchronous elements: e.g., `wait_for_element(selector, timeout=10)`.

**Sample mapping**

```json
{ "action":"click","by":"id","selector":"search_bar" }
```

→

```python
el = driver.find_element(By.ID, "search_bar")
el.click()
```

---

## 7. Feedback Loop Implementation (Pseudocode)

```
plan = LLM.parse_goal(goal, element_map)
for i, step in enumerate(plan.steps):
    try:
        result = execute(step)
        capture_state = inspect_ui()
        if not validate(result, capture_state, expected):
            failure_context = {step_index: i, page_source: capture_state, screenshot: last_shot}
            new_plan = LLM.replan(goal, failure_context, step_history)
            plan = merge_plans(plan, new_plan, resume_index=i)
            continue
    except Exception as e:
        log_error(e)
        new_plan = LLM.replan(goal, {error: str(e), page_source: inspect_ui()})
        plan = merge_plans(plan, new_plan, resume_index=i)
```

**Notes:**

- Keep replanning attempts limited (configurable, e.g., 3 attempts) to avoid infinite loops.
- Provide fallback: escalate to human when confidence low.

---

## 8. Data Model (Simplified)

**test\_runs**

- id, user\_id, goal\_text, app\_package, device\_id, status, started\_at, finished\_at

**test\_steps**

- id, run\_id, index, action\_json, status, started\_at, finished\_at, screenshot\_path, page\_source\_path, error\_message

**element\_maps**

- run\_id, timestamp, elements\_json

---

## 9. Security, Privacy & Access Control

- Restrict LLM keys and Appium/Device access to authenticated users.
- Encrypt secrets at rest (e.g., API keys) and in transit (TLS).
- Sanitise screenshots and logs (mask PII) when running on real user accounts.
- Audit trail for all agent actions.

---

## 10. CI / CD & Testing Strategy

- Dockerize orchestrator & Appium server.
- Use GitHub Actions for CI: lint, unit tests, integration tests (smoke tests with a minimal test app in emulator).
- End-to-end nightly runs for regression.

---

## 11. MVP Scope & Roadmap

- **MVP (8-12 weeks):** Android-only; Appium + LLM parse/execute/replan; web UI with emulator view, basic inspector, logs, reports; persistence; manual override.
- **Phase 2 (12-20 weeks):** iOS support, improved CV-based element matching, model fine-tuning with app-specific examples, multi-device parallel execution.
- **Phase 3 (ongoing):** Self-healing tests via historical runs, collaborative features, enterprise integrations (Jira, TestRail).

---

## 12. Risks & Mitigations

- **Risk:** LLM hallucinations produce invalid selectors.
  - *Mitigation:* Strict JSON schema validation + sandboxed dry-run of generated script + element existence checks before action.
- **Risk:** Flaky tests due to timing/network.
  - *Mitigation:* Robust waits, retries, network conditioning in CI.
- **Risk:** Sensitive data in screenshots.
  - *Mitigation:* On-upload redaction & access controls.

---

## 13. Next Steps & Deliverables

1. Confirm tech stack and device/emulator choices.
2. Prototype: simple command → LLM → Appium script → emulator run (no UI) — 2 weeks.
3. Build Web UI with emulator stream + command box — 3 weeks.
4. Add Inspector integration + feedback loop — 3–4 weeks.
5. Internal testing & iterate.

---

*Appendix:* Example LLM plan schema, sample prompts, and minimal test APKs will be provided in the prototype phase.

