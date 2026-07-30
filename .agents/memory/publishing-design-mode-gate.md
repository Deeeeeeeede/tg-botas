---
name: Publishing "Design mode" gate
description: Why Publishing said "nothing to publish" for a backend-only bot, and the fix
---

A backend-only project (Telegram bot / API, no web frontend) can be blocked from
publishing by the Publishing pane showing "There's nothing to publish yet — this
project only has a design mockup and API."

**Cause:** the presence of a `kind = "design"` artifact (e.g. a `mockup-sandbox`
"Canvas") puts the whole project into "Design mode" for the publishing flow, which
then expects you to "build your app from the design." The actual backend deployment
config (`.replit` `[deployment]` with `deploymentTarget = "vm"`) is irrelevant to
this UI gate.

**Fix:** remove the design artifact. Deleting `artifacts/<design-slug>/` auto-
deregisters the artifact AND its managed workflow (the workflow is artifact-managed,
so `removeWorkflow` is PROHIBITED — just delete the directory). After removal the
project is recognized as deployable and publishes as a Reserved VM.

**Why:** Reserved VM is required for a long-running bot; Static deploys (the default
when only frontend/design artifacts are detected) cannot host a backend server.

**Note:** orphaned `[[ports]]` left in `.replit` after removal are harmless; `.replit`
cannot be edited directly anyway (port mappings are tool-owned).
