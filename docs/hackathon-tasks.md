# Hackathon Polish Tasks

Three implementation tasks and a project description draft. Each task is self-contained and can be implemented independently.

---

## Task 1: GitHub Actions CI Pipeline

Create `.github/workflows/ci.yml` that runs on push and pull request to `main`.

### Requirements

- **Node 20** on `ubuntu-latest`
- Install root dependencies (`npm install` which triggers `postinstall` for backend + frontend)
- Run **three parallel jobs**:
  1. `backend-tests`: `cd backend && npm test`
  2. `frontend-tests`: `cd frontend && npm test`
  3. `frontend-lint`: `cd frontend && npm run lint`
- Each job should cache `node_modules` using `actions/cache` with key based on `package-lock.json` hash
- Add a **CI badge** to `README.md` after the existing license/React/TypeScript/Express badges:
  ```
  <img alt="CI" src="https://github.com/zoidbergclawd/elisa/actions/workflows/ci.yml/badge.svg" />
  ```

### Files to create/modify
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (add badge)

### Acceptance criteria
- All three jobs pass locally (`npm test` in backend, `npm test` in frontend, `npm run lint` in frontend)
- Workflow file uses proper YAML syntax and GitHub Actions v4 action versions

---

## Task 2: React Error Boundary

Add an ErrorBoundary component that catches render crashes in the React tree and shows a recovery UI instead of a white screen.

### Requirements

Create `frontend/src/components/shared/ErrorBoundary.tsx`:

- Must be a **class component** (React error boundaries require `componentDidCatch` / `getDerivedStateFromError` -- these are not available as hooks)
- Props: `children: React.ReactNode`, optional `fallback: React.ReactNode`
- State: `{ hasError: boolean; error: Error | null }`
- `static getDerivedStateFromError(error: Error)` sets `hasError: true` and captures the error
- `componentDidCatch(error, errorInfo)` logs to `console.error`
- Default fallback UI when no `fallback` prop:
  - Centered card matching the existing glass-panel/glass-elevated design language (see `App.tsx` modals for reference)
  - Heading: "Something went wrong"
  - Show `error.message` in a `text-sm text-atelier-text-secondary` paragraph
  - A "Reload" button styled like the existing `go-btn` class that calls `window.location.reload()`
- A "Try again" button that resets `hasError` to `false` (re-attempts render), shown alongside the Reload button

Wrap in `main.tsx`:

```tsx
import ErrorBoundary from './components/shared/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
```

### Test

Create `frontend/src/components/shared/ErrorBoundary.test.tsx`:

- Test that children render normally when no error
- Test that fallback UI renders when a child throws during render (use a component that conditionally throws)
- Test that the "Try again" button resets the error state
- Suppress `console.error` in tests to avoid noise (vi.spyOn + mockImplementation)

### Files to create/modify
- Create: `frontend/src/components/shared/ErrorBoundary.tsx`
- Create: `frontend/src/components/shared/ErrorBoundary.test.tsx`
- Modify: `frontend/src/main.tsx` (wrap App)
- Modify: `frontend/src/components/CLAUDE.md` (add ErrorBoundary to component tree)

---

## Task 3: Accessibility Pass

Add baseline accessibility attributes across all interactive frontend components. This is a targeted pass -- not a full WCAG audit, just the highest-impact attributes.

### Scope and changes

**Modals -- add `role="dialog"` and `aria-modal="true"` and `aria-labelledby`:**

All modals use the same pattern: a fixed backdrop div containing a content div. For each modal, add attributes to the **backdrop div** and use `aria-labelledby` pointing to the heading's `id`.

Files and specific changes:

1. `frontend/src/components/shared/HumanGateModal.tsx`
   - Backdrop div: add `role="dialog"` `aria-modal="true"` `aria-labelledby="gate-modal-title"`
   - h2: add `id="gate-modal-title"`

2. `frontend/src/components/shared/QuestionModal.tsx`
   - Backdrop div: add `role="dialog"` `aria-modal="true"` `aria-labelledby="question-modal-title"`
   - Heading element: add `id="question-modal-title"`

3. `frontend/src/components/Skills/SkillsRulesModal.tsx`
   - Backdrop div: add `role="dialog"` `aria-modal="true"` `aria-labelledby="skills-modal-title"`
   - Heading: add `id="skills-modal-title"`

4. `frontend/src/components/Portals/PortalsModal.tsx`
   - Backdrop div: add `role="dialog"` `aria-modal="true"` `aria-labelledby="portals-modal-title"`
   - Heading: add `id="portals-modal-title"`

5. `frontend/src/components/shared/ExamplePickerModal.tsx`
   - Backdrop div: add `role="dialog"` `aria-modal="true"` `aria-labelledby="examples-modal-title"`
   - Heading: add `id="examples-modal-title"`

6. `App.tsx` help modal (inline)
   - Backdrop div: add `role="dialog"` `aria-modal="true"` `aria-labelledby="help-modal-title"`
   - h2 "Getting Started": add `id="help-modal-title"`

7. `App.tsx` done modal (inline)
   - Backdrop div: add `role="dialog"` `aria-modal="true"` `aria-labelledby="done-modal-title"`
   - h2 "Nugget Complete!": add `id="done-modal-title"`

**Buttons -- add `aria-label` where text alone is ambiguous:**

8. `frontend/src/components/shared/GoButton.tsx`
   - Add `aria-label="Start build"` to the button element

9. `frontend/src/components/BlockCanvas/WorkspaceSidebar.tsx`
   - Each sidebar button already has visible text labels ("Open", "Save", etc.) -- these are fine as-is, no changes needed

10. `frontend/src/components/shared/TeachingToast.tsx`
    - The dismiss button (currently just "x" text): add `aria-label="Dismiss notification"`

11. All modal close buttons that show "x" text: add `aria-label="Close"`
    - `App.tsx` help modal close button
    - Any other "x" close buttons in the modals listed above

**Error notification banner in App.tsx:**

12. The error notification div: add `role="alert"` so screen readers announce it immediately
13. The error dismiss button ("x"): add `aria-label="Dismiss error"`

**Landmark roles:**

14. `App.tsx`: The existing `<header>` element is already semantic. The main content area `<div className="flex flex-1 overflow-hidden relative z-10">` should be changed to `<main>` instead of `<div>`.

### Do NOT change
- Blockly editor internals (Blockly manages its own a11y)
- @xyflow/react components (managed by library)
- Component behavior or visual appearance
- Any styling

### Tests
No new test files needed for a11y attributes. Existing tests should continue to pass. If any existing tests query elements that are affected by the tag change (div -> main), update those selectors.

### Files to modify
- `frontend/src/App.tsx`
- `frontend/src/components/shared/HumanGateModal.tsx`
- `frontend/src/components/shared/QuestionModal.tsx`
- `frontend/src/components/shared/GoButton.tsx`
- `frontend/src/components/shared/TeachingToast.tsx`
- `frontend/src/components/shared/ExamplePickerModal.tsx`
- `frontend/src/components/Skills/SkillsRulesModal.tsx`
- `frontend/src/components/Portals/PortalsModal.tsx`
