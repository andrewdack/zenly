# Zenly

Zenly is a distraction blocker that actually understands what you're trying to do. You text it what you're working on, it watches your screen, and if you start doomscrolling it texts you to knock it off. If you ignore that, it texts your friend and tells on you.

We built this at a hackathon. It runs on an iPhone with a Node backend.

## The idea

Most blockers just have a list of "bad apps" and shut them off. The problem is the same app can be fine or not fine depending on what you're doing. Reddit for researching scholarships is fine. Reddit for scrolling r/all is not fine. A blocklist can't tell the difference.

So instead of a blocklist, Zenly takes a screenshot every 10 seconds and sends it to a vision model along with whatever you said you were doing. The model decides if your screen matches your intent. If it doesn't, you get a text.

The other thing we wanted was real accountability. A notification is easy to ignore. A text to your friend Gabe saying "hey your boy is on tiktok again" is a lot harder to ignore. That's the snitch feature and honestly it's the most fun part of the demo.

## How a session works

1. You set up the app once (pick nudge or snitch mode, put in your friend's number).
2. You text the agent at +14156035536 and tell it what you're working on, or just say "keep me off tiktok" for guardian mode.
3. The agent texts back a link. You tap it and the app starts recording your screen.
4. The vision model judges each frame: on task, off task, or destructive (doomscrolling, addictive games, gambling).
5. First time you slip, you get a friendly check-in text. Keep slipping and it escalates to your friend.
6. Stop slipping and everything resets. It's based on behavior, not a one-strike thing.

## Architecture

There are three parts: the iPhone app, the Node backend, and OpenRouter for the AI calls. iMessage is both how you talk to it and how it talks to you.

```
        iPhone
  ┌──────────────────────────────────────────┐
  │  Zenly app          ZenlyBroadcast (ext)  │
  │  settings, timer    grabs frames ~1fps    │
  │  polls for status   uploads to /judge     │
  └───────────┬──────────────────┬────────────┘
              │                  │  HTTP over wifi
              ▼                  ▼
  ┌──────────── Node backend (api/) ──────────┐
  │  server.ts   Express API on :3001         │
  │  index.ts    iMessage agent loop          │
  │  watchdog.ts  decides when to escalate    │
  └──────────┬────────────────────┬───────────┘
             │ OpenRouter         │ Photon
             ▼                    ▼
     Claude (judge + agent)   your phone / friend's phone
```

The backend is actually two separate processes that share the same database:

- `server.ts` runs the HTTP API. This is the part that judges your screen and decides to escalate. It's the important one.
- `index.ts` runs the iMessage agent. This is the part that reads your texts and starts sessions. It uses Photon (a cloud iMessage thing) so you don't need a Mac running.

## The screen judging

The screenshots get captured by a ReplayKit broadcast extension, not the main app. This matters because the second you switch to TikTok the main app is in the background and can't do anything. The broadcast extension keeps running, so it's the only thing that can actually catch you. It converts each frame to a JPEG and posts it to the backend.

The vision model is Claude Haiku 4.5 through OpenRouter. We use Haiku because it's fast and cheap, so judging every 10 seconds doesn't cost much. The prompt has a strict order it follows so the model doesn't go easy on you:

1. Boring stuff (home screen, settings, music, maps, messages) is always fine, even if it has nothing to do with your task.
2. Stuff related to your task is fine.
3. Clear distractions are off task or destructive. Saying "I meant to watch TikTok" does not get you off the hook.
4. If it genuinely can't tell, it gives you the benefit of the doubt.

"Destructive" is its own thing for active doomscrolling, addictive games, and gambling. That gets flagged no matter what mode you're in, because that's bad regardless of what you said you were doing.

## The escalation logic

This lives in `api/src/agent/watchdog.ts` and it's a pure function, which made it really easy to test. It takes the current verdict and decides whether to do nothing, send a check-in, wait, or snitch.

The settings we tuned for the demo:

```
checkInCooldownMs: 10000    // at least 10s between check-ins
windowMs:          300000   // count check-ins over a rolling 5 minutes
snitchAfter:       2        // snitch after 2 check-ins in that window
```

A good frame resets everything. A bad frame either sends a check-in or, if you've already gotten a couple and haven't fixed it, snitches to your friend. There's a guard so it only snitches once per slip, not over and over. Ten seconds is pretty aggressive but it makes for a good demo where you can actually watch it happen.

## Saving state

Everything durable lives in a SQLite database (`api/data/zenly.db`). It stores users, their behavior memories, every verdict, and the live session itself. We put the live session in the database so if the server restarts mid-demo it doesn't lose your session, which was a problem before. After a session ends, another AI pass reads through what happened and writes a couple short notes about your habits ("drifts to instagram after about 20 minutes") that the agent remembers next time.

## Repo layout

```
Zenly/                   main SwiftUI app
ZenlyBroadcast/          ReplayKit screen capture extension
ZenlyBroadcastSetupUI/   the broadcast setup screen
ZenlyActivity/           the hard-block shield (needs a paid Apple account)
api/                     the Node backend
```

## Running it

Backend:

```bash
cd api
npm install
cp .env.example .env      # add your OpenRouter key, and Photon creds if you have them
npm run dev:api           # the HTTP API on :3001
npm run dev               # the iMessage agent (separate terminal)
```

iOS app: open `Zenly.xcodeproj` in Xcode and run it on a real iPhone. The simulator can't do screen recording so the full thing needs a physical device. Phases of the app that don't need recording do work in the simulator.

## Stuff we didn't finish

- The actual hard block (where the app literally won't open) needs Apple's Family Controls, which needs a paid developer account we don't have. So right now it catches you and tells on you, but it can't physically stop you. The code for it is scaffolded.
- The phone finds the backend at a hardcoded wifi IP, so that has to be updated when the network changes.
- You can technically just stop the screen recording to cheat. It's a commitment tool, not a kernel-level lock. The social pressure is the deterrent for now.

## Tech we used

Swift / SwiftUI, ReplayKit, Node + Express + TypeScript, better-sqlite3, OpenRouter (Claude Haiku 4.5 for vision, Claude Sonnet 4.6 for the agent), and Photon/Spectrum for sending iMessages from the cloud.
