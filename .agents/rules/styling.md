---
trigger: model_decision
description: When styling the website.
---

### Styling Methodology

- **Primary Framework:** Use Tailwind CSS as the primary styling engine. Global configuration is defined in `web/app/globals.css` using the `@theme` block for design tokens.
- **Design Tokens:** Leverage the CSS variables defined in the `@theme` block (e.g., `--color-background`, `--font-sans`) for consistent theming. Do not hardcode hex values when a theme variable exists.
- **Component-Level CSS:** While Tailwind is preferred, legacy or complex component-specific styles (e.g., `web/components/color-picker/colorpicker.css`) use standard CSS classes. Prefer Tailwind utility classes over new CSS files for new components.
- **Animations:** The project integrates `tw-animate-css`. Use these utilities for motion patterns rather than custom keyframes where possible.

### Patterns & Constraints

- **Dark Mode:** Use the `@custom-variant dark (&:is(.dark *))` defined in `globals.css` for dark mode scoping.
- **Avoid:** Do not mix raw CSS and Tailwind utilities within the same component unless necessary for complex logic like the `gradient-mode` data-attribute selectors.
- **Co-location:** Keep component-specific styles in the same directory as the component. Prefer CSS Modules if standard CSS is required to avoid global namespace pollution.

### Unknowns

- Specific responsive breakpoint definitions are not explicitly detailed in the provided excerpts; assume standard Tailwind defaults unless overridden in `tailwind.config.*`.
- The exact strategy for CSS-in-JS or component library integration (beyond standard Tailwind) is not fully documented in the provided files.
