# Architecture notes

## Turn-based voice flow

The application uses Twilio for the phone connection, speech recognition, and text-to-speech. After each recognized utterance, the server sends text conversation history to a DeepSeek-compatible Chat Completions endpoint. The model returns a small JSON object; the server validates it and lets Twilio read `spoken_text` back to the caller.

```text
Twilio call -> <Gather input="speech"> -> server -> DeepSeek
     ^                                             |
     |---------------- <Say> reply ----------------|
```

This design avoids a bidirectional audio bridge and does not send audio to DeepSeek. It is intentionally turn-based, so short pauses occur between the caller's answer and the next prompt.

## Trust boundaries

- Browser to application: bearer token from `ADMIN_TOKEN`.
- Twilio to application: `X-Twilio-Signature` over the public URL and form body.
- Application to DeepSeek and Twilio: server-side credentials from `.env`.
- No provider credential is sent to the browser or returned in API responses.

The DeepSeek error path records only a concise status message. It does not log response bodies, authentication headers, or full provider payloads.

## Conversation state

Active transcripts are held only in an in-memory `Map` keyed by Twilio `CallSid`. A session contains the goal, sanitized user/assistant text, turn count, and empty-input count. It is deleted when the call ends, fails, reaches its turn limit, or produces a final result.

`data/state.json` stores one goal and at most 100 call records. A completed check-in contains only status, summary, next action, and timestamp; it does not persist the full transcript.

## Known limits

- The scheduler and active conversations exist only while one Node.js process is alive.
- In-memory sessions and the JSON store are designed for one application instance and one user.
- Restarting during a call invalidates that active conversation.
- Telephony, recognition, and supported language availability depend on Twilio and the destination country.
- A DeepSeek-compatible relay must support Chat Completions and JSON Output.
- Model names and provider behavior can change; verify current official documentation before upgrades.
