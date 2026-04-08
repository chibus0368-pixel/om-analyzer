```markdown
# Design System Strategy: The Electric Architect

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Electric Architect."** 

This system rejects the "standard SaaS dashboard" aesthetic in favor of a high-end, editorial experience that feels both architecturally stable and technologically advanced. We are moving away from the warmth of the previous amber tones toward a high-frequency, neon lime energy. The goal is to create a digital environment that feels like a precision instrument: dark, deep, and punctuated by "blooming" data points. 

We break the traditional grid through **intentional asymmetry**—using wide margins and offset typography—to guide the eye toward critical financial "signals." By layering surfaces instead of drawing lines, we achieve a sense of depth that feels carved rather than constructed.

---

## 2. Colors & Atmospheric Depth

This system utilizes a "Dark Mode First" philosophy where the deep navy/slate provides the void, and the electric lime provides the light.

### The Palette
*   **Primary (#a8d700):** The "Electric Signal." Use this for critical actions and data highlights.
*   **Background (#0b1326):** The "Infinite Canvas." A deep, desaturated navy that provides the foundation.
*   **Surface Tiers:** Use `surface_container_lowest` through `highest` to create a logical hierarchy of information.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section off content. Boundaries must be defined solely through:
1.  **Background Shifts:** Place a `surface_container_high` card on a `surface_container_low` section.
2.  **Negative Space:** Use the typography scale to create natural breaks.
3.  **Tonal Transitions:** Subtle shifts in container values to denote functional areas.

### The "Glass & Gradient" Rule
To prevent the UI from feeling flat or "boxed in," use **Glassmorphism** for floating elements (modals, tooltips, navigation). 
*   **Implementation:** Use semi-transparent `surface_variant` colors with a `backdrop-blur` (12px–20px).
*   **Signature Textures:** Apply subtle linear gradients to primary CTAs, transitioning from `primary` (#a8d700) to `primary_container` (#121a00). This creates a "bloom" effect that mimics a glowing screen.

---

## 3. Typography: Editorial Authority

The typography pairs the technical precision of **Inter** with the bold, geometric character of **Space Grotesk**.

*   **Display & Headlines (Space Grotesk):** These are your architectural anchors. Use `display-lg` and `headline-lg` with tight letter-spacing to create a sense of institutional gravity.
*   **Body & Labels (Inter):** Reserved for data and long-form reading. Inter provides the legibility required for complex financial intelligence.
*   **Hierarchy as Identity:** Use extreme scale contrast. A `display-lg` header paired with a `label-sm` metadata tag creates a sophisticated, editorial "magazine" feel that conveys confidence and modernity.

---

## 4. Elevation & Tonal Layering

We do not use shadows to simulate height; we use **Light and Density.**

*   **The Layering Principle:** Depth is achieved by stacking. A `surface_container_lowest` element (darkest) should sit on a `surface_container_low` section (slightly lighter) to create a "recessed" look, or vice versa for a "raised" look.
*   **Ambient Shadows:** If a floating element (like a context menu) requires a shadow, it must be massive and faint. Use a blur of 40px–60px with a 6% opacity, tinted with `primary` to simulate the neon glow reflecting off the dark surface.
*   **The "Ghost Border" Fallback:** For high-density data where separation is vital, use the `outline_variant` at **15% opacity**. This creates a "suggestion" of a boundary without cluttering the visual field.

---

## 5. Components

### Buttons
*   **Primary:** `primary` background with `on_primary` text. No border. Apply a subtle outer glow (0px 0px 15px) using the primary color at 20% opacity on hover.
*   **Secondary:** `surface_container_high` background. No border. High-contrast text.
*   **Tertiary:** Ghost style. No background or border. Text only in `primary` or `on_surface`.

### Input Fields
*   **Style:** Abandon the "box." Use a `surface_container_low` background with a `primary` bottom-accent line (2px) that only appears on focus.
*   **Error State:** Use `error` text and a subtle `error_container` glow behind the input.

### Cards & Lists
*   **Forbid Dividers:** Do not use horizontal rules. Separate list items using 8px–12px of vertical padding and a background shift on hover (`surface_container_highest`).
*   **Data Visualization:** Use `primary` for all active trend lines. Ensure the "bloom" effect is applied to the highest data points to signify "Signal."

### Floating Intelligence (New Component)
*   A specialized glassmorphic panel for AI-driven insights. It should use `surface_container_lowest` at 70% opacity with a heavy backdrop-blur and a `primary_fixed` 1px "Ghost Border" at 10% opacity.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical layouts. Push content to the edges to create a modern, wide-screen feel.
*   **Do** lean into the neon. Use `primary` (#c8ff00) sparingly but boldly—it should feel like a laser cutting through the dark.
*   **Do** prioritize readability. Ensure `on_surface` text maintains high contrast against the `background`.

### Don’t
*   **Don’t** use 100% opaque, high-contrast borders. It breaks the "Architect" aesthetic.
*   **Don’t** use standard "drop shadows" (Black/Grey). They feel muddy on navy backgrounds.
*   **Don’t** clutter. If a screen feels busy, increase the vertical spacing between containers rather than adding lines.
*   **Don’t** use the `primary` color for large background areas; it is an accent, not a foundation. It should always represent "Action" or "Signal."