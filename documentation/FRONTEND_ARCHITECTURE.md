# Frontend Architecture

The frontend of the TCNP Journey Management System is a React-based Progressive Web App (PWA) built with **Next.js 15**. It is designed for speed, type safety, and a premium "Apple-style" user experience.

## 🎨 Design System

We follow a strict design system implemented via **Tailwind CSS** and **shadcn/ui**.

-   **Typography:** We use a modern sans-serif stack (Inter/Outfit) for readability.
-   **Color Palette:** High-contrast neutral tones with vibrant accent colors for status indicators (e.g., Success = Emerald, Distress = Rose).
-   **Glassmorphism:** Used extensively in dashboard cards and overlays to create a premium, layered UI.
-   **Animations:** Powered by **Framer Motion** for smooth transitions and state changes.

---

## ⚛️ Component Hierarchy

Our component architecture is divided into three tiers:

### 1. Unified UI (`components/ui`)
Low-level, accessible components based on **Radix UI**. These are "pure" and have no knowledge of business logic.
*Examples: Button, Input, Dialog, Popover.*

### 2. Business Components (`components/dashboard`)
Middle-tier components that interact with the domain model.
*Examples: JourneyCard, PapaProfile, IncidentForm.*

### 3. Feature Layouts (`app/(dashboard)/...`)
Top-level page structures that coordinate data fetching and pass props down to business components.

---

## 🏗 State Management

Data flow is managed by three distinct mechanisms:

### 1. Server State (TanStack Query)
Used for 90% of the data fetching. It handles:
-   Caching database records.
-   Automatic background refetching.
-   Optimistic updates (e.g., updating a journey status feels instant).

### 2. Shared Client State (Zustand)
Used for UI-specific state that needs to persist across pages:
-   Sidebar expanded/collapsed state.
-   User theme preferences.
-   Active tracking session data.

### 3. Local Component State (React `useState`)
Used for transient data like form inputs or toggle switches.

---

## 🗺 Map Integration

Real-time tracking is implemented using **Leaflet** and **React-Leaflet**.
-   **Optimization:** Map components are lazy-loaded to prevent slowing down the initial dashboard paint.
-   **Custom Markers:** Vehicle "Cheetah" markers change color and orientation based on movement and status.

---

## 📱 Progressive Web App (PWA)

The system is configured as a PWA, providing a native-app experience on mobile devices.
-   **`manifest.json`:** Defines app icons, theme colors, and display mode (standalone).
-   **Service Workers:** Handles basic offline caching of core UI assets.
-   **Installable:** Prompts users to "Add to Home Screen" on iOS and Android.

---

## 🛠 Best Practices for Developers

-   **Server vs. Client Components:** Always default to Server Components. Only add `'use client'` if you need hooks (`useState`, `useEffect`) or browser APIs (Maps).
-   **Type Safety:** Every component prop must have a defined interface. Use the types generated in `types/database.types.ts`.
-   **Performance:** Use Next.js `<Image />` for all assets and implement skeleton loaders for all data-fetching sections.

```typescript
// Common pattern for data fetching
const { data: journeys, isLoading } = useJourneys();

if (isLoading) return <JourneySkeleton />;

return <JourneyList items={journeys} />;
```

---
> [!NOTE]
> All styles should be applied using Tailwind utility classes. Avoid creating custom CSS files unless absolutely necessary for complex animations.
