---
trigger: model_decision
description: When creating components used for the website.
---

### Components Scoped Guide

#### Client-Side Boundaries

- **Directive Usage**: All components within `app/` and `components/features/` currently utilize the `'use client'` directive. Ensure any server-side data fetching logic is isolated from these interactive components.
- **State Management**: Prefer local `useState` and `useEffect` for UI-specific state (e.g., `AudiencePage`, `CostsPage`). For complex data flows, leverage `useCallback` and `useMemo` to prevent unnecessary re-renders in heavy visualization components like `NicheNetworkGraph`.

#### Composition & Patterning

- **Feature Isolation**: Place feature-specific components under `components/features/<feature-name>/`. Shared UI primitives (Tabs, Cards, Buttons) reside in `components/ui/`.
- **Visualization**: Use `recharts` for data-driven views. Maintain consistent color palettes (e.g., `COLORS` or `CLUSTER_COLORS` arrays) within the component file or a shared constants file to ensure visual uniformity across analytics dashboards.
- **Type Safety**: Explicitly define interfaces for component props and data models (e.g., `Competitor`, `Demographics`) within the relevant component file or a local `types.ts` if shared across the feature.

#### Best Practices

- **Icons**: Standardize on `lucide-react` for all UI iconography.
- **Formatting**: Implement helper functions for data representation (e.g., `formatNumber` in `competitors/page.tsx`) to keep JSX clean.
- **Loading States**: Utilize consistent loading indicators (e.g., `Loader2` from `lucide-react`) during async operations.

#### Unknowns

- Server Component conventions: The current evidence is heavily skewed toward `'use client'` patterns; explicit guidelines for Server Components in `components/` are currently unknown.
- Global state management: No evidence of Redux, Zustand, or Context API usage exists in the provided snippets; local state is the current standard.
