---
name: feedback_no_floating_position
description: Never use position absolute for UI elements that belong in the component flow — place them inline
type: feedback
---

Do NOT float UI elements with position absolute when they belong within the component layout flow. Place buttons, toolbars, and controls as part of the existing component hierarchy, not as overlay elements.

**Why:** Floating elements overlap other components and look bad. The user has expressed strong frustration about this pattern multiple times.

**How to apply:** When adding a new button or control, find the right place in the existing component tree and add it there (e.g., in the sidebar header row, in the toolbar flex container). Never use `absolute` positioning for UI controls unless it's truly an overlay (like a map widget).
