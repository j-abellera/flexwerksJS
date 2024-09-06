// This file combines acGate and validatechallenge requests into a single file.
// This will be used to proactively validate an account whenever needed.
// This can be after every accept attempt and/or every 10 minutes to lower the chance of getting a captcha when accepting a block.
// The GOAL is to prevent captchas from ruining attempts at grabbing blocks by validating the account every accept attempt and every few minutes.

const config = require('../config.json');
const { acGate } = require('./flexWerks');

const validateChallenge = async () => {
    console.log('Starting antigate task...');
      try {
        const validation = await acGate();
        const url = validation.url;
        const urlSearchParams = new URLSearchParams(new URL(url).search);
        const sessionTokenJson = urlSearchParams.get('sessionToken');

        if (sessionTokenJson) {
            const sessionToken = JSON.parse(sessionTokenJson);
            const uniqueValidationId = sessionToken.uniqueValidationId;
            console.log(uniqueValidationId);
            try {
                const challengeToken = JSON.stringify({"uniqueValidationId": uniqueValidationId});
                const validate = await axios.post(amznRoutes.validateChallenge, {"challengeToken": challengeToken}, {headers: getFlexHeaders()})
                sessionCaptchaS++;
                config.captchaOverallS++;
                console.log('Validation successful')
            }catch(err) {
                sessionCaptchaF++;
                config.captchaOverallF++
                console.log(`Validation unsuccessful with status code ${err.response.status}`);
            }
        } else {
            console.log(`sessionToken parameter not found in the URL: \n ${url}`);
        }
      } catch(err) {
        console.log(`acGate failed`);
      }
}

module.exports = {validateChallenge};