# Chat reading and stream following

A user scrolling upward releases automatic following immediately, including small
movements inside the previous near-bottom threshold. Streaming tokens, late layout
updates and visibility changes do not reattach a reader. Follow resumes when the
user reaches the actual bottom or explicitly selects the latest-message control.
This rule is shared by Admin/onboarding, board/agent, task viewport and mobile
window chat scrolling. Keyboard upward navigation is treated as a reading gesture.

The stream follower checks its last written position before every animation frame,
so a scrollbar drag cannot be overwritten before its scroll event is delivered.
A task chat gesture also cancels an explicit native smooth jump in progress.
Legacy task latest-position settling cancels on pointer and keyboard navigation.
Sending an Admin message sets follow intent immediately, rather than after the
network response, so a reader can scroll away while the request is in flight.

OpenUI answers lazily activate on first visibility, then keep the same renderer,
DOM, inputs and natural layout while offscreen. They no longer swap tall cards for
small placeholders and rebuild on return. Offscreen streams remain throttled/
suspended and animations pause; completed offscreen answers require no idle frames.
Media retains its existing visibility and explicit playback rules. Streaming frame
cleanup removes stale clipping/height locks when visibility or completion changes.

Verification covers tiny upward movements, late resize, renewed content,
visibility changes, explicit re-follow, interrupted animation frames, native
form identity/state and desktop/mobile browser scroll geometry. UI changes also
pass the token gate and the UI typecheck/build.
