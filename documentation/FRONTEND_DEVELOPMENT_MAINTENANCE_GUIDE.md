# Frontend Development & Maintenance Guide

This comprehensive guide is designed to help engineers of all levels, from Juniors to Seniors, understand the inner workings of the TCNP Journey Management frontend. Following this guide ensures that updates are performed professionally, maintaining the application's premium aesthetics and operational integrity.

---

## 1. The Architectural Philosophy

The TCNP frontend is not just a website; it is a **Mission-Critical Dashboard**. It is built on three core pillars:
1.  **Immutability:** Data should come from the server and be reflected accurately.
2.  **Optimism:** User interactions should feel instantaneous (Optimistic UI).
3.  **Resilience:** The app must handle network drops and partial data gracefully (PWA & Caching).

### Next.js 15 & The App Router
We use **Next.js 15**. This means we leverage **React Server Components (RSC)** by default.
-   **Static Rendering:** Pages that don't change often.
-   **Dynamic Rendering:** Pages that change based on user roles or journey status.
-   **Streaming:** We use `loading.tsx` and `<Suspense>` to show skeleton UI while heavy data is loading.

---

## 2. Component Construction (The Atomic Model)

We follow an atomic-like structure for components to ensure reusability and maintainability.

### 📁 `components/ui` (The Atoms)
These are your building blocks (Buttons, Inputs, Dialogs). We use **shadcn/ui**.
-   **Rule:** DO NOT change the files in `components/ui` directly unless you want to change the style globally for the entire app.
-   **How to update:** If you need a specific version of a button, wrap it in a business component.

### 📁 `components/dashboard` (The Molecules)
These combine UI atoms with business logic.
-   **Example:** `JourneyCard.tsx` uses `Card`, `Badge`, and `Button` to display a specific journey's status.
-   **Rule:** Keep these components "dumb" where possible. Pass data through props rather than fetching inside the molecule.

### 📁 `components/maps` (The Organisms)
Complex components like the Leaflet Map.
-   **Rule:** Use dynamic imports for these to keep the main bundle light.
    ```typescript
    const LiveMap = dynamic(() => import('@/components/maps/LiveMap'), { ssr: false });
    ```

---

## 3. State Management Strategy

Mismanaging state is the #1 way to break this app. We use a "Right Tool for the Job" approach.

### A. Server State (TanStack Query)
**Use for:** Anything that lives in the database.
-   **Hooks:** Located in `hooks/useJourneys.ts`, `hooks/usePapas.ts`, etc.
-   **Pattern:**
    ```typescript
    const { data, isLoading } = useQuery({
      queryKey: ['journeys'],
      queryFn: fetchJourneys
    });
    ```
-   **Maintenance Tip:** Always invalidate the query key after a mutation (update) to ensure the UI refreshes.

### B. Global UI State (Zustand)
**Use for:** Ephemeral state that survives page navigation.
-   **Examples:** Sidebar collapse, active filters, current theme.
-   **Store:** `lib/store/ui-store.ts`.

### C. Local State (`useState`)
**Use for:** Form inputs, toggle switches, or anything that only matters to one component.

---

## 4. Styling & Animations (The "WOW" Factor)

### Tailwind CSS
We use utility classes exclusively. Avoid writing custom CSS in `globals.css` unless it's for a complex third-party library override.
-   **Naming:** Follow the `cn()` utility pattern for conditional classes:
    ```typescript
    <div className={cn("base-class", isActive && "active-class")} />
    ```

### Framer Motion
Every state change should be smooth. Use `layout` props for automatic layout transitions.
-   **Rule:** Use the `AnimatePresence` component for items entering/leaving the DOM (like notifications or modals).

---

## 5. Form Engineering (Zod & React Hook Form)

Every form must be strictly validated.
1.  **Define a Schema:** In `lib/validations/journey.ts`.
2.  **Initialize Form:**
    ```typescript
    const form = useForm<z.infer<typeof schema>>({
      resolver: zodResolver(schema),
    });
    ```
3.  **User Feedback:** Use `form.formState.errors` to show red validation text immediately.

---

## 6. Real-time Integration (The Telemetry Bus)

We use Supabase Real-time. This is handled via the `useRealtime` hook.
-   **How it works:** It listens for database changes and manually updates the TanStack Query cache.
-   **Maintenance Tip:** Always clean up your subscriptions in the `useEffect` return to prevent memory leaks and duplicate markers on the map.

---

## 7. The "Cookbook" (How-To Guides)

### 🍳 How to Add a New Page
1.  Create a folder in `app/(dashboard)/your-feature-name`.
2.  Add a `page.tsx`.
3.  Add the route to the `Sidebar` component in `components/dashboard/Sidebar.tsx`.
4.  Define permissions in `middleware.ts` if the page is role-restricted.

### 🍳 How to Modifying an Existing Entity (e.g., Adding a field to 'Papa')
1.  **Database:** Add the column in Supabase and update `types/database.types.ts`.
2.  **Schema:** Update the Zod schema in `lib/validations`.
3.  **Form:** Add the new Input field to the Papa form component.
4.  **UI:** Update the Papa detail view to display the new information.

### 🍳 How to Handle a New Role (e.g., 'Echo Oscar')
1.  Add the role to the `UserRole` enum/type.
2.  Update `lib/permissions.ts` to define what this new role can see.
3.  Update the UI to show specific buttons/actions meant for this role.

---

## 8. Rules of Engagement (Ensuring Zero-Breakage)

1.  **Type Safety:** Never use `any`. If the Supabase types are too complex, create a specialized Interface that extends them.
2.  **No Direct Prop Drilling:** If you are passing props more than 3 levels deep, use a Context Provider or Zustand.
3.  **Handling Errors:** Use `try/catch` and `toast.error()` for every database interaction. Never leave a user wondering why a button didn't work.
4.  **Loading States:** Every button that triggers a mutation should have a `loading` state (disabled with a spinner).
5.  **Clean Code:** Use Prettier and ESLint. If the build fails on linting, it doesn't go to production.

---

## 9. Performance Checklist

-   **Images:** Use `next/image`.
-   **Icons:** Use `lucide-react` (they are tree-shakable).
-   **Bundles:** Keep external libraries to a minimum. Check `bundle-analyzer` if the app feels sluggish.
-   **Re-renders:** Use `useMemo` for heavy calculations (like filtering 1000+ audit logs).

---

## 10. Basic Troubleshooting

-   **"My UI isn't updating after a save":** Did you call `queryClient.invalidateQueries(['your-key'])`?
-   **"Hydration failed error":** You are likely using a browser-only API (like `window.localStorage` or `Map`) in a Server Component without a `useEffect` or `ssr: false` check.
-   **"The map marker is in the wrong place":** Check if you are switching Latitude and Longitude. Leaflet expects `[lat, lng]`.

---

## 🛡 Ownership & Maintenance
This frontend is a living organism. When you add a feature, update this guide. If you find a bug, fix the pattern, not just the symptom.

**Maintained by:** BIGWEB Digital / Advanced Engineering Team  
**Last Updated:** May 2026
