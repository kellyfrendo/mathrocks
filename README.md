# Math Rocks

Kid-friendly browser game: answer math questions before asteroids hit the planet.

## Play locally

```bash
cd math-rocks
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://127.0.0.1:5173`).

## Build

```bash
npm run build
npm run preview
```

## Deploy (GitHub + Netlify)

1. Create a GitHub repo and push this `math-rocks` folder (or the whole project with **Base directory** = `math-rocks`).
2. In Netlify: **Add site → Import from Git → GitHub** → select the repo.
3. Settings are in `netlify.toml` already:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy — Netlify gives you a public `*.netlify.app` URL for online testing.

## Edit starting questions

Open `src/questions.js` and add strings to each level array, for example:

```js
1: [
  '7 + 8',
  '6 + 4',
  '9 + 9', // ← new question
],
```

Spaces are optional (`7+8` works). Order is shuffled at the start of each level. Wrong or timed-out questions are mixed back into the remaining list until answered correctly. After the starter set is cleared, the game generates harder questions still within that level’s rules.

## Features

- Player name at start
- Levels 1–4 with editable starter question banks
- Incorrect / planet-hit questions repeat until answered correctly
- Speed gear starts at 1st; every 10 correct in a row shifts up (faster rocks)
- 3 lives; score + localStorage scoreboard
- Keyboard answer entry
- Optional “Sounds on” on level select (correct / incorrect / gear-up cues)
