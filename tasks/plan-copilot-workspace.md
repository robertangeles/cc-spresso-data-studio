# Plan: Co-Pilot Workspace — Center Column as the MOAT

## Context

The Content Builder's center column needs to become the single AI interaction surface — a co-pilot workspace where conversation and editor live side by side. Currently AI interactions are split across AICommandBar (input), right panel (transcript), and editor (output). This unifies everything.

## Decisions Locked In (from CEO Review)

1. **Layout:** Co-pilot split — AI conversation (left) + Editor (right), 50/50 within center column
2. **Empty state:** Full-width template cards on first visit. Transitions to co-pilot split on first interaction (prompt selection, template pick, or manual typing)
3. **Mental model:** Equal weight — conversation and editor are both primary citizens
4. **Architecture:** Evolve AICommandBar into a conversational workspace, don't replace it
5. **Prompt auto-send:** Keep existing behavior (synthesized trigger, content detection heuristic, auto-populate editor)
6. **Conversation clears on prompt switch** (existing behavior, keep it)
7. **All existing delight items stay:** badge glow, contextual placeholder, prompt preview tooltip

## What Gets Removed

- Right panel chat transcript (the inline messages added in commits 4cc8126 → ddd6ff0)
- Right panel goes back to Schedule only
- `addLocalMessages` from useContentChat (no longer needed — commands will use `sendMessage` directly)

## Architecture

### Layout State Machine

```
  IDLE (no content, no conversation)
    │
    ├── User selects prompt ──────────▶ COPILOT (split view)
    ├── User picks template ──────────▶ COPILOT (split view)
    ├── User clicks "Blank canvas" ───▶ COPILOT (split view)
    └── User types in AI bar ─────────▶ COPILOT (split view)

  COPILOT (conversation + editor side by side)
    │
    ├── User clicks "Reset" / new prompt ──▶ stays COPILOT (chat clears)
    └── User clears all content ───────────▶ stays COPILOT (don't snap back)
```

Note: Once in COPILOT mode, stay there for the session. Don't snap back to IDLE even if content is cleared — the user is in "working mode."

### Center Column Layout (COPILOT mode)

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    CENTER COLUMN                              │
  │  ┌────────────────────────┐  ┌─────────────────────────────┐ │
  │  │   AI CONVERSATION      │  │   EDITOR                    │ │
  │  │                         │  │                             │ │
  │  │  ┌───────────────────┐  │  │  Title: _______________    │ │
  │  │  │ Message thread    │  │  │                             │ │
  │  │  │ (scrollable)      │  │  │  Body:                     │ │
  │  │  │                   │  │  │  ___________________        │ │
  │  │  │ User: I'd like... │  │  │  ___________________        │ │
  │  │  │                   │  │  │  ___________________        │ │
  │  │  │ ● AI: Welcome!    │  │  │                             │ │
  │  │  │   [Apply] [Regen] │  │  │  Platform tabs below...    │ │
  │  │  │                   │  │  │                             │ │
  │  │  │ ● AI thinking...  │  │  │  Media Studio              │ │
  │  │  └───────────────────┘  │  │                             │ │
  │  │                         │  │                             │ │
  │  │  ┌───────────────────┐  │  │                             │ │
  │  │  │ [Prompt] [Model]  │  │  │                             │ │
  │  │  │ [textarea]  [Send]│  │  │                             │ │
  │  │  │ Enter · Shift+Ent │  │  │                             │ │
  │  │  └───────────────────┘  │  │                             │ │
  │  └────────────────────────┘  └─────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────┘
```

### Component Structure

```
  ContentBuilderPage
    ├── Left Panel (platforms)
    ├── Center Column
    │     ├── IF IDLE: BuilderEmptyState (full width)
    │     └── IF COPILOT: flex row
    │           ├── CopilotChat (new component, 50% width)
    │           │     ├── Message thread (scrollable)
    │           │     │     ├── User messages (right-aligned)
    │           │     │     ├── AI messages (left-aligned)
    │           │     │     │     ├── [Apply to editor] button
    │           │     │     │     └── [Regenerate] button
    │           │     │     └── Thinking indicator
    │           │     └── Input area (bottom, sticky)
    │           │           ├── Toolbar: PromptBadge, Wand icon, Model selector
    │           │           ├── Textarea (auto-resize)
    │           │           └── Send button + keyboard hints
    │           └── Editor area (50% width, scrollable)
    │                 ├── PostComposer (title + body + platform tabs)
    │                 ├── CharacterCountBar
    │                 └── MediaStudio
    └── Right Panel (Schedule only — no chat transcript)
```

### New Component: CopilotChat

Absorbs functionality from:

- AICommandBar (toolbar, input, send logic, Knight Rider animation)
- MiniChat (messages display, thinking indicator)
- Right panel transcript (message rendering, "Apply to editor" button)

Props:

```typescript
interface CopilotChatProps {
  // Messages
  messages: ChatMessage[];
  isSending: boolean;

  // Input
  onSendMessage: (text: string) => void;
  onCommand: (instruction: string) => void;
  isProcessing: boolean;

  // Prompt
  activePromptId: string | null;
  activePromptName: string | null;
  onSelectPrompt: (promptId: string, name: string, body: string) => void;
  onClearPrompt: () => void;
  onCreateNewPrompt: () => void;
  prompts: Prompt[];
  promptsLoading: boolean;
  onDeletePrompt?: (id: string) => void;
  onEditPrompt?: (prompt: Prompt) => void;

  // Model
  model: string;
  onModelChange: (model: string) => void;

  // Actions on messages
  onApplyToEditor: (content: string) => void;
  onRegenerate: (messageContent: string) => void;
}
```

### Data Flow

```
  USER ACTION                    FLOW                              RESULT
  ─────────────────────────────────────────────────────────────────────────
  Select prompt           → handleSelectPrompt()                → Auto-send trigger
                            → chat.sendMessage(trigger)          → AI responds in thread
                            → isContentResponse(response)        → Auto-populate editor

  Type in AI bar          → onSendMessage(text)                 → chat.sendMessage(text)
  (general chat)            → AI responds in thread              → User decides to apply

  Type AI command         → onCommand(instruction)              → chat.executeCommand()
  ("make it shorter")      → Result populates editor             → Command + result in thread

  Click "Apply to editor" → onApplyToEditor(content)            → builder.setMainBody()

  Click "Regenerate"      → Re-send the user's last message     → New AI response
```

### Unifying sendMessage and executeCommand

Currently two separate paths:

- `sendMessage`: adds messages to thread, sends to API
- `executeCommand`: returns text, doesn't add to thread (we added addLocalMessages as a hack)

**Plan:** Make ALL interactions go through `sendMessage`. For AI commands that need current editor content as context, build the context into the message before sending. Remove `executeCommand` entirely — it's a leaky abstraction.

When user types a command like "make it shorter":

1. Build context message: `"Current content:\n---\n{editorContent}\n---\n\nInstruction: make it shorter"`
2. Send via `chat.sendMessage(contextMessage)`
3. AI responds in thread
4. Auto-apply response to editor (since it's a command, always apply)
5. Show user-friendly version in thread (just the instruction, not the full context)

This means the thread shows:

```
You: make it shorter
● AI: [shortened version]
   [Applied to editor ✓]
```

## Implementation Steps

### Step 1: Create CopilotChat component

- New file: `packages/client/src/components/content-builder/CopilotChat.tsx`
- Absorbs: messages display from MiniChat, toolbar from AICommandBar, Knight Rider animation
- Input at bottom (sticky), messages scrollable above, toolbar above input
- Message actions: "Apply to editor" + "Regenerate" on AI messages
- Thinking indicator with thinking messages

### Step 2: Unify sendMessage and executeCommand

- Modify `handleAICommand` in ContentBuilderPage to use `sendMessage` instead of `executeCommand`
- Build context-aware messages that include editor content when needed
- Show clean user message in thread (instruction only), send full context to API
- Auto-apply command results to editor
- Remove `executeCommand` and `addLocalMessages` from useContentChat

### Step 3: Restructure ContentBuilderPage center column layout

- Add `isCopilotActive` state: true once user takes first action
- IDLE: render BuilderEmptyState full-width (existing behavior)
- COPILOT: render flex row with CopilotChat (50%) + Editor area (50%)
- Remove right panel chat transcript (revert to Schedule only)
- Keep all existing Empty State → COPILOT transitions

### Step 4: Handle responsive layout

- Below `xl` breakpoint: stack vertically (chat above, editor below)
- Or: tab-based toggle between chat and editor on small screens

### Step 5: Add expansion features

- Streaming responses (if backend supports it — check first)
- Message actions: Regenerate button
- Smart placeholder text based on context
- Conversation persistence to localStorage

### Step 6: Write/update tests

- Update test plan with new component tests
- Unit tests for CopilotChat
- Integration tests for unified message flow
- Edge case tests

## Edge Cases

| Edge Case                                             | Handling                                                  |
| ----------------------------------------------------- | --------------------------------------------------------- |
| User selects prompt with empty body                   | Load passively, no auto-send, stay in current layout mode |
| User switches prompts mid-conversation                | Clear chat, auto-send new prompt                          |
| User clicks template card                             | Transition to COPILOT, populate editor, no chat message   |
| User clicks "Blank canvas"                            | Transition to COPILOT, empty editor, chat shows welcome   |
| Long AI response in thread                            | Truncate to 500 chars with "Show more" expand             |
| User navigates away mid-generation                    | Component unmounts, cleanup in useEffect                  |
| Both halves need scroll                               | Independent overflow-y-auto on each column                |
| Mobile/small screen                                   | Stack vertically or use tabs                              |
| AI command ("make it shorter") with no editor content | Send instruction without context prefix                   |
| Rapid prompt switching                                | isSending guard prevents double-send                      |

## Files to Create

- `packages/client/src/components/content-builder/CopilotChat.tsx` (NEW)

## Files to Modify

- `packages/client/src/pages/ContentBuilderPage.tsx` (layout restructure)
- `packages/client/src/hooks/useContentChat.ts` (remove executeCommand, cleanup)
- `packages/client/src/components/content-builder/AICommandBar.tsx` (may be deleted or gutted)

## Files to Remove/Deprecate

- AICommandBar.tsx will be replaced by CopilotChat — can be deleted once migration is complete
- Right panel chat transcript code in ContentBuilderPage (already partially removed)

## Verification

1. `pnpm tsc` — all packages pass
2. `pnpm test` — all tests pass
3. Manual: Visit Content Builder → see full-width empty state with template cards
4. Manual: Select a prompt → transitions to co-pilot split, AI responds in left panel, content in editor
5. Manual: Type in AI bar (general chat) → message appears in thread, can apply to editor
6. Manual: Type AI command ("make it shorter") → editor updates, command appears in thread
7. Manual: Click "Apply to editor" on any AI message → editor updates
8. Manual: Click "Regenerate" on AI message → new response
9. Manual: Badge glows during generation
10. Manual: Contextual placeholder text changes
11. Manual: Prompt preview tooltip works
12. Manual: Responsive — check below xl breakpoint
