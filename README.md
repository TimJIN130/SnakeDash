# Snake Dash

Snake Dash is a fast browser arcade game where you control a moving cube, eat weaker cubes, level up, dodge stronger cubes, and survive a boss battle.

## How to Play

- Move with the arrow keys or WASD.
- Press Space to pause or resume during a run.
- Eat cubes with a level less than or equal to your current level.
- Avoid cubes with a higher level than you.
- Eating cubes increases your score and progress toward the next level.
- The game gets faster and harder as your level increases.

## Cube Colors

- Green: lower level and safe to eat
- Yellow: same level and safe to eat
- Red: higher level and dangerous

## Boss Battle

The boss appears at Level 10.

During the boss battle:

- The boss appears in the middle of the game window.
- The boss shoots plus and minus signs around the arena.
- Touching a plus sign increases your level by 1 and adds score.
- Touching a minus sign decreases your level by 1, but never below Level 1.
- Normal cubes still spawn, but less often.
- Reaching Level 25 defeats the boss.

## Features

- Smooth keyboard movement
- Level-based cube eating rules
- Score and level tracking
- Top 3 high scores saved with localStorage
- Background music with mute/unmute control
- Game over and restart screen
- Boss battle with special signs
- Particle effects when eating cubes

## Run Locally

Open `index.html` in a desktop browser.

You can also run a simple local server from the project folder:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Project Files

- `index.html` - page structure and game UI
- `styles.css` - layout and visual styling
- `game.js` - game loop, controls, scoring, audio, high scores, and boss logic
