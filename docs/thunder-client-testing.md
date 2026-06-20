# Manual Testing via Thunder Client

This documents the Thunder Client setup used for manually exercising the API during development, as an alternative to PowerShell's `Invoke-RestMethod` or curl.

## Setup

1. Install the **Thunder Client** extension in VS Code
2. Make sure the server is running: `npm start`
3. Open Thunder Client from the sidebar and create a new collection (e.g. "MFA Gate")

## Saved requests

**1. Start PIN login**
- Method: `POST`
- URL: `http://localhost:3000/login`
- Body (JSON): `{ "userId": 1 }`
- Returns a `loginId` — check the server's terminal for the matching PIN

**2. Verify PIN**
- Method: `POST`
- URL: `http://localhost:3000/verify`
- Body (JSON): `{ "loginId": <id from step 1>, "pin": "<pin from server log>" }`

**3. Verify TOTP**
- Method: `POST`
- URL: `http://localhost:3000/verify`
- Body (JSON): `{ "userId": 1, "totp": "<current code>" }`
- See `manual-testing-commands.md` for generating a TOTP secret and current code for a given user before testing this

## Notes from testing

- Each `/login` call returns a *new* `loginId` — always use the one from the most recent response, not a previously used one.
- TOTP codes rotate every 30 seconds; generate a fresh code immediately before sending the verify request, or it may have already expired.
- When testing TOTP for a specific user, make sure the `userId` used in `registerTotp()`, `getCurrentTotpForUser()`, and the Thunder Client request body all match — using mismatched ids was a common source of confusing "FAILED" results during testing.