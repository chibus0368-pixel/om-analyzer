# Design System Specification: The Financial Architect

## 1. Overview & Creative North Star

### The Creative North Star: "Institutional Precision"
The design system is built for the "Financial Architect"—a persona that demands the rigor of a structural engineer paired with the sophistication of a private equity executive. We are moving away from "SaaS-generic" interfaces. Instead, we embrace a **High-End Editorial** aesthetic that treats real estate data as a premium asset.

This system breaks the "standard template" through **Intentional Asymmetry** and **Architectural Overlays**. We utilize expansive white space (breathing room) contrasted against dense, high-precision data clusters. By overlapping large-scale typography with crisp structural elements, we create a sense of depth and authority that feels both custom and permanent.

---

## 2. Colors & Tonal Logic

### The Palette
The core of the system is built on **Primary (#131b2e)** and **Surface (#f8f9ff)**. We use a "High-Contrast, Low-Noise" philosophy.

- **Primary & Containers:** Use `primary_container` (#131b2e) for high-impact structural blocks. This deep navy provides the "weight" of a legacy institution.
- **The Sharp Accent:** `tertiary_fixed` (#84CC16 / #acf847) is our "Data Green." It must be used sparingly—only for growth indicators, primary CTAs, or critical data points. It is the laser-cut edge on a blueprint.

### The "No-Line" Rule
**Explicit Instruction:** Prohibit 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts. To separate a sidebar from a main view, use `surface_container_low` against `surface`. Horizontal sectioning should be achieved through a transition from `surface` to `surface_container`.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of architectural vellum. 
- **Base:** `surface` (#f8f9ff)
- **Nested Content:** Use `surface_container_low` for secondary information and `surface_container_highest` (#d3e4fe) for active, interactive regions.
- **Glassmorphism:** For floating modals or "quick view" panels, use `surface_container_lowest` at 85% opacity with a `24px` backdrop-blur. This ensures the data beneath is felt but not distracting.

---

## 3. Typography: The Authoritative Voice

The system utilizes two typefaces to balance modern technology with institutional heritage.

### Display & Headlines: Space Grotesk
Space Grotesk is our "Architectural" font. Its tabular figures and geometric terminals suggest precision.
- **display-lg (3.5rem):** Use for hero valuations or primary market headers.
- **headline-md (1.75rem):** Use for section titles, always paired with a `surface_tint` accent line or significant leading.

### Body & Labels: Inter
Inter provides maximum legibility for complex data sets.
- **title-md (1.125rem):** The "Executive Summary" size. Used for card titles and key metrics.
- **label-sm (0.6875rem):** All-caps with +5% letter spacing. Used for technical metadata and "Data Source" timestamps.

---

## 4. Elevation & Depth: Tonal Layering

We reject the "drop shadow" defaults of the early web. Depth in this system is achieved through light and material properties.

- **The Layering Principle:** Place a `surface_container_lowest` card on a `surface_container_low` background. The shift in hex value provides a sophisticated, "soft-lift" without visual clutter.
- **Ambient Shadows:** For floating elements (Modals/Dropdowns), use a multi-layered shadow:
  `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.04), 0 20px 25px -5px rgba(15, 23, 42, 0.08);`
  The color is a tint of our `on_surface` navy, never pure black.
- **The "Ghost Border" Fallback:** If accessibility requires a border, use `outline_variant` at **15% opacity**. It should be a suggestion of a line, not a boundary.

---

## 5. Component Logic

### Buttons
- **Primary:** `primary_container` background with `on_primary` text. Sharp corners (`DEFAULT: 0.25rem`). No gradients, just a solid, authoritative block.
- **Tertiary (Accent):** `tertiary_fixed` background. Only used for "Final Action" buttons (e.g., *Buy Asset*, *Export Report*).

### Input Fields
- **Styling:** Underline-only or subtle `surface_container_high` backgrounds. Avoid the "boxed-in" look.
- **States:** On focus, the bottom border shifts to `secondary` (#004edc) with a `2px` weight.

### Cards & Data Lists
- **The "No-Divider" Rule:** Forbid 1px dividers between list items. Use vertical white space (`1.5rem` minimum) or alternating tonal shifts (zebra striping using `surface_container_low`).
- **Signature Component: The Data Overlay:** Large `display-sm` numbers overlapping a `surface_variant` geometric shape. This creates an editorial, "Financial Times" feel.

### Additional Custom Components
- **The Metric Monolith:** A large-scale card with a `Space Grotesk` value and a mini-sparkline using `tertiary_fixed_dim`.
- **Architectural Scrim:** A vertical progress indicator or navigation element that uses a single `1px` line in `outline_variant` (20% opacity) as a structural spine for the page.

---

## 6. Do’s and Don'ts

### Do
- **Use Intentional Asymmetry:** Align text to the left but allow large data visualizations to bleed off the right edge of the grid.
- **Data-First Hierarchy:** Make the most important number the largest element on the page.
- **Nesting Surfaces:** Use `surface_container` levels to group related financial metrics.

### Don’t
- **Don’t use "Tech Glows":** Avoid neon blurs or vibrant shadows. We are building for institutions, not gaming consoles.
- **Don’t use Rounded Corners > 8px:** Keep the radius tight (`sm` or `md`) to maintain a sense of structural rigidity.
- **Don’t use Full-Opacity Borders:** Lines create "grid-lock." Let the background colors define the space.
- **Don’t use High-Saturation Colors for Text:** All body text should be `on_surface_variant` (#45464d) for a softer, premium reading experience, reserving `on_surface` for headlines.