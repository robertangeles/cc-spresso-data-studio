# Test Plan: Prompt Auto-Send & Editor Population

**Feature:** When a user selects a prompt in the Content Builder, auto-send it to the AI, show the response in chat, and auto-populate the editor with generated content.

**Branch:** `feature/prompt-auto-send`
**Date:** 2026-03-31

---

## Architecture Decisions (from CEO Review)

- **Output target:** Both — chat panel + editor auto-populated
- **Trigger message:** Synthesized (e.g., "Generate content using [Prompt Name]") — prompt body stays as systemPrompt
- **Interactive vs. direct:** AI decides — heuristic detects if response is content or questions
- **Editor sync:** First response only auto-populates; subsequent via "Apply to editor" button
- **Overwrite:** Replace existing editor content with warning toast
- **Delight items:** Contextual placeholder, badge glow, prompt preview tooltip, AI greeting, "Apply to editor" button

---

## Unit Tests — `isContentResponse()` heuristic

| ID  | Test Case                                           | Input                                                                         | Expected | Priority |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | -------- |
| U1  | Long content text returns true                      | "Here's your LinkedIn post about launching a new product..." (200+ chars)     | `true`   | P1       |
| U2  | Short question returns false                        | "What topic would you like me to write about?"                                | `false`  | P1       |
| U3  | Empty string returns false                          | `""`                                                                          | `false`  | P1       |
| U4  | Whitespace-only returns false                       | `"   \n  "`                                                                   | `false`  | P1       |
| U5  | AI refusal returns false                            | "I'm sorry, I cannot generate that content..."                                | `false`  | P1       |
| U6  | Multiple questions returns false                    | "Great! A few questions:\n1. What's your brand?\n2. Who's your audience?"     | `false`  | P1       |
| U7  | Content ending with follow-up question returns true | "Here's your post: 'Big news!'... Want me to adjust the tone?"                | `true`   | P2       |
| U8  | Single-line content returns true                    | `"\"Your body is not a temple, it's an amusement park.\" — Anthony Bourdain"` | `true`   | P2       |
| U9  | Error message returns false                         | "An error occurred while processing your request."                            | `false`  | P2       |
| U10 | Unicode/emoji content returns true                  | "Exciting launch day! Here's what we built..." (200+ chars)                   | `true`   | P2       |

## Unit Tests — `synthesizeTriggerMessage()`

| ID  | Test Case                      | Input                                             | Expected                                        | Priority |
| --- | ------------------------------ | ------------------------------------------------- | ----------------------------------------------- | -------- |
| U11 | Normal prompt name             | "Random Quote Generator"                          | "Generate content using Random Quote Generator" | P1       |
| U12 | Long prompt name               | "My Very Long Prompt Name That Goes On And On..." | Truncated cleanly, no crash                     | P2       |
| U13 | Prompt name with special chars | `"Tips & Tricks — Social"`                        | Handles cleanly, no injection                   | P2       |

---

## Integration Tests — `handleSelectPrompt` auto-send flow

| ID  | Test Case                                 | Setup                                   | Action                                  | Expected Result                                                                 | Priority |
| --- | ----------------------------------------- | --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| I1  | Auto-send triggers on prompt selection    | Empty editor, no active prompt          | Select prompt with body                 | `sendMessage` called with synthesized trigger, `systemPrompt` = body            | P1       |
| I2  | Empty body skips auto-send                | Prompt with `body: ""`                  | Select prompt                           | `loadPrompt` called, `sendMessage` NOT called, toast shows "Prompt loaded" only | P1       |
| I3  | Null body skips auto-send                 | Prompt with `body: null`                | Select prompt                           | Same as I2                                                                      | P1       |
| I4  | Chat cleared before auto-send             | Chat has 3 existing messages            | Select new prompt                       | `clearChat()` called before `sendMessage()`, old messages gone                  | P1       |
| I5  | Editor populated on content response      | AI returns 300-char content             | Auto-send completes                     | `builder.setMainBody()` called with response content                            | P1       |
| I6  | Editor NOT populated on question response | AI returns "What topic would you like?" | Auto-send completes                     | `builder.setMainBody()` NOT called                                              | P1       |
| I7  | Overwrite toast when editor has content   | Editor body = "existing text"           | Select prompt, AI responds with content | Toast "Previous draft replaced" shown                                           | P1       |
| I8  | No overwrite toast when editor empty      | Editor body = ""                        | Select prompt, AI responds with content | No overwrite toast, just normal population                                      | P2       |
| I9  | Selecting same active prompt is no-op     | Prompt A already active                 | Click Prompt A again                    | No duplicate sendMessage call                                                   | P2       |

## Integration Tests — Contextual placeholder text

| ID  | Test Case                               | Setup                                 | Action                          | Expected Result                                                | Priority |
| --- | --------------------------------------- | ------------------------------------- | ------------------------------- | -------------------------------------------------------------- | -------- |
| I10 | Placeholder changes on prompt selection | Default placeholder showing           | Select "Quote Generator" prompt | Placeholder = "Refine your Quote Generator output..."          | P1       |
| I11 | Placeholder reverts on prompt clear     | Active prompt with custom placeholder | Clear prompt (X button)         | Placeholder = default "Tell Spresso what content to create..." | P1       |

## Integration Tests — Badge glow animation

| ID  | Test Case                            | Setup                             | Action       | Expected Result                | Priority |
| --- | ------------------------------------ | --------------------------------- | ------------ | ------------------------------ | -------- |
| I12 | Badge glows during generation        | Active prompt, `isSending = true` | Render badge | Badge has glow/pulse CSS class | P1       |
| I13 | Badge stops glowing after generation | `isSending` transitions to false  | Re-render    | Glow class removed             | P1       |
| I14 | No glow when no active prompt        | No prompt selected, ghost button  | Render       | No glow class present          | P2       |

## Integration Tests — Prompt preview tooltip

| ID  | Test Case                    | Setup                         | Action                        | Expected Result                          | Priority |
| --- | ---------------------------- | ----------------------------- | ----------------------------- | ---------------------------------------- | -------- |
| I15 | Hover shows body preview     | Prompt with 500-char body     | Hover over prompt in dropdown | Tooltip shows first ~150 chars + "..."   | P1       |
| I16 | Hover on prompt with no body | Prompt with `body: null`      | Hover                         | Tooltip shows "No prompt body" or hidden | P2       |
| I17 | Tooltip doesn't block click  | Hovering with tooltip visible | Click prompt                  | `handleSelect` fires, tooltip dismissed  | P2       |

## Integration Tests — "Apply to editor" button

| ID  | Test Case                                         | Setup                                  | Action                  | Expected Result                                               | Priority |
| --- | ------------------------------------------------- | -------------------------------------- | ----------------------- | ------------------------------------------------------------- | -------- |
| I18 | Apply button visible on AI messages               | Chat has assistant message             | Render MiniChat         | "Apply to editor" button visible on assistant messages only   | P1       |
| I19 | Apply button NOT on user messages                 | Chat has user message                  | Render MiniChat         | No "Apply" button on user messages                            | P1       |
| I20 | Click Apply populates editor                      | AI message with content                | Click "Apply to editor" | `builder.setMainBody(message.content)` called, editor updated | P1       |
| I21 | Apply shows overwrite toast if editor has content | Editor has content, AI message in chat | Click "Apply"           | Toast "Previous draft replaced" shown                         | P2       |
| I22 | Apply on empty AI message is no-op or disabled    | AI message with empty content          | Render                  | Button disabled or hidden                                     | P2       |

---

## E2E Tests — Full user flows

| ID  | Test Case                           | Flow                                                                                                                           | Expected                                                                                                                          | Priority |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| E1  | Direct-generate prompt end-to-end   | Open Content Builder -> Select prompt with direct instructions -> Wait for AI response                                         | Chat shows synthesized user msg + AI response, editor auto-populated with content, badge shows active with glow during generation | P1       |
| E2  | Interactive prompt end-to-end       | Open Content Builder -> Select prompt that asks questions -> AI asks questions in chat -> User answers -> AI generates content | Chat has Q&A flow, editor NOT populated after questions, editor populated after content response                                  | P1       |
| E3  | Prompt switch mid-session           | Select prompt A -> AI responds -> Select prompt B -> AI responds                                                               | Chat cleared between selections, editor has prompt B content, badge shows prompt B name                                           | P1       |
| E4  | Prompt clear restores defaults      | Select prompt -> AI responds -> Clear prompt (X)                                                                               | Badge reverts to ghost "Prompts" button, placeholder reverts to default, system prompt cleared                                    | P2       |
| E5  | Apply to editor from follow-up      | Select prompt -> AI generates -> User sends refinement in chat -> AI responds -> Click "Apply to editor" on follow-up          | Editor content replaced with the follow-up AI response, overwrite toast shown                                                     | P2       |
| E6  | Prompt with existing editor content | Type content in editor manually -> Select prompt -> AI generates                                                               | Overwrite toast shown, editor replaced with AI content, chat started fresh                                                        | P2       |

---

## Edge Case Tests

| ID  | Test Case                                              | Scenario                                               | Expected                                                                     | Priority |
| --- | ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------- | -------- |
| EC1 | Prompt body is only whitespace                         | `body = "   \n\t  "`                                   | Skip auto-send, load as passive prompt only                                  | P1       |
| EC2 | Very long prompt body (10K chars)                      | Large system prompt                                    | Sent normally via API, no truncation on client side                          | P2       |
| EC3 | Prompt selected while generation in-flight             | Click prompt A, before response arrives click prompt B | Prompt A response discarded/ignored, only prompt B response populates editor | P2       |
| EC4 | Network error during auto-send                         | Offline or server down                                 | Optimistic user message removed, error toast shown, editor unchanged         | P2       |
| EC5 | Select same prompt twice                               | Click active prompt in dropdown                        | No-op — no duplicate send, no chat clear                                     | P2       |
| EC6 | Prompt with HTML/XSS in body                           | `body = "<script>alert(1)</script>"`                   | Escaped in chat display, no execution, sent safely as systemPrompt           | P1       |
| EC7 | Rapid triple-click different prompts                   | Click A, B, C in quick succession                      | Only C's response shown, no interleaved messages from A or B                 | P2       |
| EC8 | Page refresh with active prompt (localStorage restore) | Active prompt persisted, page reloads                  | Prompt badge shows active, but auto-send does NOT re-fire on restore         | P1       |

---

## Test Summary

| Category    | P1     | P2     | Total  |
| ----------- | ------ | ------ | ------ |
| Unit        | 8      | 5      | 13     |
| Integration | 12     | 10     | 22     |
| E2E         | 3      | 3      | 6      |
| Edge Cases  | 3      | 5      | 8      |
| **Total**   | **26** | **23** | **49** |

**Acceptance criteria:** All 26 P1 tests must pass before feature is marked complete. P2 tests should pass but individual exceptions can be documented as known limitations.
