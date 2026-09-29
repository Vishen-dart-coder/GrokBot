# /brag plan: GrokBot Local

## Inspect: answers
- **What is it?** A desktop AI agent that runs on your own Mac, powered by Ollama. It doesn't only chat: it writes files and runs commands in its own workspace.
- **Who is it for, and what does it do for them?** Developers and tinkerers who want an agent that gets real work done without a cloud account or an API key.
- **What sets it apart?** It's local-first: your chats stay on your machine. Each bot has its own workspace folder ("its computer"). It asks before it runs anything risky ("Allow GrokBot to run this on your computer?"). It works with any Ollama model and connects to MCP apps.
- **Most impressive claim:** you type one sentence, and it writes the file, runs it and shows you the result, all on your laptop.
- **Visual hook:** the white voice orb (the app's logo) pulsing on pure black, with one line of type.
- **Real UI to show:** home screen → the composer ("Ask anything, or drop a file") → the tool card with the approval bar → the "done" badges → the streamed result with a code block → the model switcher and Connect apps.
- **Tone:** `default`, punchy and clean. The product is serious, so the humor stays light.
- **Share caption:** "GrokBot Local is an AI agent that does the work on your Mac, not in someone's cloud."
- **How to get it:** github.com/Vishen-dart-coder/GrokBot

## Angle
"The agent is on your computer." Every beat shows it acting locally, while you stay in control.

## Visual identity (from src/renderer/src/styles.css)
- **Colors:**
  - Background: #0a0a0a
  - Sidebar: #111111
  - Cards: #171717, and #1f1f1f for user bubbles
  - Text: #ececec, #a3a3a3 and #6b6b6b
  - Accent: white pills
  - Status: green #4ade80 and amber #fbbf24
- **Type:** Inter (the app's fallback after -apple-system), with a mono font for tool names.
- **Assets:** the real app stylesheet, class names and copy, the brand orb logo (`assets/brand/logo.svg`) and Lucide icons.

## Storyboard (1920×1080, 30 fps, 21.0 s, 120 BPM so one beat = 0.5 s)

| # | Time | Scene | On screen | Motion | Sound |
|---|---|---|---|---|---|
| 1 | 0.0–3.0 | **Hook** | Orb on black. "Your AI agent." then "Now it lives on your Mac." | Orb scales in with a glow bloom. Its bars pulse to the kick. Two lines rise in, staggered. | Soft pad swell, then the kick starts at 0.5 s |
| 2 | 3.0–6.0 | **Reveal** | The real home screen: sidebar, "Good evening, Vishen. What should we work on?", the composer and 4 suggestion cards | The app window zooms up from 92% into frame. At 4.0 s the prompt types "Create hello.py in your workspace and run it". The send button fills at 5.6 s. | Quiet key ticks, then a click blip on send |
| 3 | 6.0–10.5 | **Highlight 1: it asks first** | Chat view: user bubble, "I'll create the file in my workspace.", a `write_file hello.py` card marked **pending approval** with the bar "Allow GrokBot to run this on your computer?" and the buttons Deny / Always allow / **Allow once**. Caption: "It asks before it touches anything." | A cursor glides to "Allow once" and clicks at 8.0 s. The badge flips to **done**. At 8.8 s a `run_shell` card appears and flips to done at 9.8 s. | Whoosh in, click on Allow, two soft "done" plinks in key |
| 4 | 10.5–14.0 | **Highlight 2: then it does it** | The result streams in: "Done! I created **hello.py** and ran it:", a python code block, and a terminal line `hello from GrokBot`. Caption: "Then it actually does the work." | Words stream in. The code block slides up. The output line glows once. | Light arpeggio rises |
| 5 | 14.0–17.5 | **Highlight 3: your models, your apps** | Two real panels: the model switcher (qwen3:8b ✓, llama3.1:8b, gpt-oss:20b) and Connect apps (Browser, Filesystem, Memory, GitHub). Caption: "Any Ollama model. Any MCP app." | The panels slide in from the sides, staggered, and the menu items cascade in. | Two soft swishes |
| 6 | 17.5–21.0 | **Outro** | Orb, the wordmark "GrokBot Local", "Runs on your Mac. Your chats stay there.", and a pill with github.com/Vishen-dart-coder/GrokBot | The scene dips through black. The orb settles, then the text and pill stagger in and hold. | A resolving chord and a chime, then the music fades out over the last 1.2 s |

Durations: 3.0 + 3.0 + 4.5 + 3.5 + 3.5 + 3.5 = **21.0 s**.

**Readability:** every caption is on screen and fully settled for at least 0.3 s per word. The longest, "It asks before it touches anything." (6 words), holds for about 4 s.

**Transitions:** each scene clears its old content before the new content arrives (a stagger or a dip through black), so busy layouts never crossfade over each other.

## Sound
Original music synthesized for this video: 120 BPM in A minor, with the progression Am – F – C – G. It has a soft kick, closed hats, sub bass, a warm pad and a pluck arpeggio from scene 4 onward. The sound effects use the same key and the same reverb as the music, and sit about 10 dB under it. The key ticks are very quiet.
