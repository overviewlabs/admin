# Admin integration verification — 2026-10-02

Admin uses the WHOXOS organization switcher, navigation, account identity, theme, and rounded content frame. The cptr frontend remains embedded within that frame, backed by a private Unix socket. The existing WHOXOS supervisor runs the cptr root worker and the unprivileged WHOXOS application. This is not a native React rewrite of cptr.

## Released changes

- Shared theme tokens and dark-mode synchronization for embedded controls, menus, and dialogs.
- Dialog focus trapping, accessible heading association, Escape dismissal, focus restoration, nested-menu keyboard handling, and reduced-motion support.
- Responsive dialog widths; backdrop covers the rounded Admin content section without the previous inset square.
- Admin loading status, a bounded readiness wait, reload recovery, and explicit access-denied handling.
- Frontend typing fixes including translation-store inference, terminal option spelling, Git initialization order, and startup cleanup registration.
- Embedded Admin does not register a standalone PWA service worker; cleanup identifies its own worker URL.
- Organization-menu tests now assert the requested absence of Sign out.

## Validation

- cptr Svelte check: 0 errors; 209 existing warnings remain across 61 files. These warnings are not represented as resolved.
- cptr candidate build and WHOXOS UI build passed; WHOXOS design-token gates passed.
- 43 focused authorization, organization-menu, and routing tests passed.
- Chromium candidate browser checks: dialog containment, focus trap, Escape, nested-menu dismissal, Cancel, dark-mode synchronization, mobile bounds, and no uncaught JavaScript errors.
- Live Chromium and installed WebKit browser checks passed the same popup, keyboard, theme, and mobile checks after deployment. WHOXOS.service remained active.
- Real Codex chat returned the requested test marker.
- Terminal command verified UID 0 and HOME=/root, then exited the test shell.
- Temporary workspace creation, file write/read, scheduled Codex execution, and cleanup succeeded. Existing user artifacts were preserved.
- Monitor displayed live server metrics in Admin; removed navigation entries remained absent and the former Monitor URL redirected.
- Public unauthenticated and forged-identity Admin API requests returned HTTP 401.

## Deployment and rollback

Frontend assets were copied first, retaining previous hashed assets, then each index was replaced atomically. No backend restart was needed.

Rollback copy:
`/.WHOX/.System/overview-labs/deploy-backups/admin-ui-20261002T062033Z`

Subdirectories `cptr` and `overview` contain the previous frontend distributions. Restore the corresponding distributions to roll back this frontend release.

For future cptr builds, use `CPTR_BUILD_DIR=build-candidate npx vite build`; never build directly into the live serving directory. Keep production authentication and the Unix socket boundary intact.

## Limits

Validation covers the core Admin workflows and tested browsers/viewports, not every optional provider or external integration. Remaining Svelte warnings and build chunk-size warnings are follow-up work. Provider availability and network failures can still occur; no claim of universal error-free operation is made.
