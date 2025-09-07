# ReactBits UX Upgrade Plan

Goal: Replace or enhance visual building blocks with patterns inspired by reactbits.dev while preserving the current data flow and business logic.

What’s done
- Global effects: Aurora + Grid backgrounds (non-interactive, fixed overlays).
- Header: Glass surface (backdrop blur) for premium feel.
- Hero: Gradient text + entrance animation.
- Cards: Staggered fade/slide-in and hover lift.

Planned next
- Spotlight cursor effect with low-intensity radial highlight.
- Gradient border “beam” for key CTAs.
- Footer visual refresh: subtle grid/dots and spacing/typography pass.
- Optional hero parallax if imagery exists.
- Consistency sweep: radii, shadows, spacing tokens.

Non-goals (for now)
- Rewriting booking logic, TRPC routers, or auth flows.
- Introducing heavy runtime effects that degrade performance.

Notes
- Respect prefers-reduced-motion.
- Keep effects behind pointer-events: none and low opacity.

