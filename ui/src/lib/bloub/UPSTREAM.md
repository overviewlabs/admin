Vendored from https://github.com/jeremy-prt/bloub at
b4bb3c1b5f93c7b87a2e8d620f667c4093d97749 (MIT, Jérémy Perret).
These framework-free engine files retain upstream geometry and tests.
The React renderer and shared animation scheduler are maintained separately.

WHOXOS extension: `BotEngine.sample(now, idleLid?)` accepts an optional
lid openness supplied by the per-avatar idle controller. Omission preserves the
upstream behavior and tests. `../bloub-idle.ts` supplies unbounded randomized
blink timing and gaze targets using the existing setLook API.
`lookAtTime` also accepts zero-duration look updates without dividing by zero;
this lets the display-rate critically damped gaze driver supply already-smoothed
poses without restarting an additional easing curve on every frame.
