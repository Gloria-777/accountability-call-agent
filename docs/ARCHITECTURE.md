# Architecture notes

## Why SIP instead of a media-stream bridge

The application uses Twilio to dial the user's phone and `<Dial><Sip>` to bridge the answered call to the OpenAI Realtime SIP endpoint. OpenAI handles the telephony audio once the SIP leg is accepted.

This avoids maintaining a second bidirectional audio bridge in the application. The server still opens a sideband WebSocket for two reasons:

1. Tell the agent to speak first after the call is accepted.
2. Receive and answer the `record_checkin` function call.

## Trust boundaries

- Browser to application: bearer token from `ADMIN_TOKEN`.
- Twilio to application: `X-Twilio-Signature` over the configured public URL and form body.
- OpenAI to application: Standard Webhooks signature verified by the OpenAI SDK.
- Application to OpenAI and Twilio: server-side API credentials from `.env`.

No provider credential is sent to the browser.

## Data model

`data/state.json` stores one active goal and at most 100 call records. It is intentionally small and easy to inspect while learning. A multi-user or multi-process deployment should replace `JsonStore` with a transactional database.

## Known limits

- The scheduler runs only while the Node.js process is alive.
- The local JSON store is for a single process and single user.
- Telephony availability depends on the provider and destination country.
- Realtime event schemas and model names can evolve; consult the current official documentation before upgrading dependencies or models.
