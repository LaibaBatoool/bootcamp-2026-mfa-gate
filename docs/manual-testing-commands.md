Register TOTP for a user:
bashnode -e "const { registerTotp } = require('./src/totpService.js'); registerTotp(1);"

Get the current code:
bashnode -e "const { getCurrentTotpForUser } = require('./src/totpService.js'); getCurrentTotpForUser(1).then(code => console.log('Current code:', code));"

(1 or any user id)