# Terminal — Step 0 : start the server

`npm start`

Keep this running throughout.



# Terminal — Step 1: Register TOTP + generate QR

`node -e "
const { registerTotp, generateQrCode } = require('./src/totpService.js');
const fs = require('fs');
async function run() {
  registerTotp(1);
  const dataUrl = await generateQrCode(1);
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('totp-qr.png', base64Data, 'base64');
  console.log('Saved totp-qr.png');
}
run();
"`



# Thunder Client — Step 2: Login (PIN flow)

Method: POST

URL: http://localhost:3000/login

Body (JSON):

`{ "userId": 1 }`

Click Send. Note the loginId from the response, and check the server terminal for the PIN.



# Thunder Client — Step 3: Verify PIN

Method: POST

URL: http://localhost:3000/verify

Body (JSON):

`{ "loginId": 5, "pin": "123456" }`

(replace with your real loginId and PIN)


# Terminal — Step 4: Generate current TOTP code

`node -e "
const { getCurrentTotpForUser } = require('./src/totpService.js');
getCurrentTotpForUser(1).then(code => console.log('Current code:', code));
"`


# Thunder Client — Step 5: Verify TOTP

Method: POST

URL: http://localhost:3000/verify

Body (JSON):

`{ "userId": 1, "totp": "482917" }`

(replace with the code from Step 4 — must be sent within ~30 seconds)
