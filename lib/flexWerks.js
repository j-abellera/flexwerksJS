const axios = require('axios');
const ac = require('@antiadmin/anticaptchaofficial');
let config = require('../config.json');
const { offerShaper } = require('./Offer');
const { DateTime } = require('luxon');
const fs = require('fs');
const { promisify } = require('util');
const path = require('path');

const APP_NAME = "com.amazon.rabbit"
const APP_VERSION = "303338310"
const DEVICE_NAME = "Le X522"
const MANUFACTURER = "LeMobile"
const OS_VERSION = "LeEco/Le2_NA/le_s2_na:6.0.1/IFXNAOP5801910272S/61:user/release-keys"

const sleep = promisify(setTimeout);
let selfAreaIds = [];
let retryCount = 0;
let sessionBlockS = 0;
let sessionBlockF = 0;
let sessionCaptchaS = 0;
let sessionCaptchaF = 0;
let timeouts = 0
let rateLimited = false;
let validating = false;
let rateErrors = 0;
let tracker = 1; //Retry tracker
let lastURL = ''; // Sometimes the old validation URL will still validate an account even if it was used before

const acGate = async () => {
  ac.setAPIKey(config.acAPIKey);
  try {
    const uniqueURL = await ac.solveAntiGateTask( //validation only works with LVL2. LVL1 no longer works
        'https://www.amazon.com/aaut/verify/flex-offers/challenge?challengeType=ARKOSE_LEVEL_2&returnTo=https://www.amazon.com&headerFooter=false',
        'Amazon uniqueValidationId',
        {}
    )
    return uniqueURL;
    }
    catch(err) {
        console.log(`Bypass Failed: ${err}`);
    }
}

const validateChallenge = async (input = false) => {
  // This function combines acGate and validatechallenge requests.
  // This will be used to proactively validate an account whenever needed.
  // This can be after every accept attempt and/or every 10 minutes to lower the chance of getting a captcha when accepting a block.
  // The GOAL is to prevent captchas from ruining attempts at grabbing blocks by validating the account every accept attempt and every few minutes.
  // console.log(lastURL !== '' ? 'Trying last URL' : 'Starting antigate task...');
  try {
    const validation = lastURL !== '' ? {url: lastURL} : input === false ? await acGate() : {url: require('readline-sync').question('Enter validation URL: ')};
    const url = validation.url;
    const urlSearchParams = new URLSearchParams(new URL(url).search);
    const sessionTokenJson = urlSearchParams.get('sessionToken');

    if (sessionTokenJson) {
      const sessionToken = JSON.parse(sessionTokenJson);
      const uniqueValidationId = sessionToken.uniqueValidationId;
      // console.log(uniqueValidationId);
      try {
        const challengeToken = JSON.stringify({ "uniqueValidationId": uniqueValidationId });
        const validate = await axios.post(amznRoutes.validateChallenge, { "challengeToken": challengeToken }, { headers: getFlexHeaders() });
        sessionCaptchaS++;
        config.captchaOverallS++;
        tracker = 1;
        // console.log('Validation successful');
        (input === false && lastURL === '') && ac.reportCorrectRecaptcha(); // Ensures only reports from workers are made
        // Send report for good captcha
        lastURL = url;
      } catch (err) {
        if(lastURL !== '') {
          // console.log('last url expired');
          lastURL = '';
          return validateChallenge();
        };
        tracker++;
        sessionCaptchaF++;
        config.captchaOverallF++;
        // console.log(`Validation unsuccessful with status code ${err.response.data.message}`);
        input === true && process.exit(0);
        if('domain' in validation && err.response.status === 498) { // Ensures only results from workers are reported
          //Send report for badCaptcha
          // console.log('Token Validation Failed');
          ac.reportIncorrectRecaptcha();
        } else {
          // console.log(`There may be an issue with the accessToken. Error: ${err.response.status}`);
        }
        if (tracker < 3) {
          // console.log(`Running Attempt ${tracker}`);
          return validateChallenge();
        } else {
          console.log(`Too many consecutive failed attempts`);
          tracker = 1;
        }
      }
    } else {
      console.log(`sessionToken parameter not found in the URL: \n ${url}`);
      ac.reportIncorrectRecaptcha();
    }
  } catch (err) {
    console.log(err)
    console.log(`acGate failed`);
  }
}

const getDate = () => {
  return DateTime.utc().toFormat('yyyyMMdd\'T\'HHmmss\'Z\'');
}

const getDesiredWeekdays = () => {
  if(config.desiredWeekdays.length === 0)
      return null;
  const desiredAvailability = config.desiredWeekdays.map(day => {
      const weekdayMap = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
      const abbrDay = day.slice(0,3).toLowerCase();
      if(weekdayMap[abbrDay] !== undefined) {
          return weekdayMap[abbrDay];
      } else {
          console.log(`Weekday ${day} is mispelled. Please correct it.`);
          process.exit(1);
      }
  })
  if(desiredAvailability.length === 7)
      return null;
  return desiredAvailability
}

const isAvailable = (time, startTime, endTime) => {
  const parseTime = (t) => {
    // Use regular expression to match and extract hours, minutes, and period (AM/PM)
    const [, hourStr, minuteStr, period] = t.match(/(\d+):(\d+) (AM|PM)/);
    // console.log(hourStr, minuteStr, period);
    // Convert hours and minutes to integers
    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);

    // Calculate total minutes since midnight
    let totalMinutes = hour * 60 + minute;

    // Adjust for PM period
    if (period === "PM") {
      totalMinutes += 720; // Add 12 hours (720 minutes)
    }
    return totalMinutes;
  };

  // Parse the times into minutes since midnight
  const currentTime = parseTime(time);
  const rangeStartTime = parseTime(startTime);
  const rangeEndTime = parseTime(endTime);

  // Check if the current time falls within the time range
  if (rangeStartTime <= rangeEndTime) {
    return currentTime >= rangeStartTime && currentTime <= rangeEndTime;
  } else {
    // Handle the case where the range spans midnight
    return currentTime >= rangeStartTime || currentTime <= rangeEndTime;
  }
};

const getFlexHeaders = () => {
  return {
    "Accept": "application/json",
    "x-amz-access-token": config.accessToken,
    "Authorization": "RABBIT3-HMAC-SHA256 SignedHeaders=x-amz-access-token;x-amz-date, "+
                     "Signature=b778357e794133e55c5c4d02a424dceeda48c20c88b607f1135c3a7e24c5b57d",
    "X-Amz-Date": getDate(),
    "Accept-Encoding": "gzip, deflate, br",
    "x-flex-instance-id": "9856001A-E1F4-4617-8744-6EE2B786407B",
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
    "User-Agent": "iOS/16.1 (iPhone Darwin) Model/iPhone Platform/iPhone14,2 RabbitiOS/2.120.1",
    "Connection": "keep-alive",
    "Cookie": 'session-id=142-6668213-5093726; session-id-time=2082787201l; '+
              'session-token=tLOLdMNhogCuvVz7Fi6bajBojsF0Aa0oGmqzixT1Y1FBttKXMXCp0kSIBJnxPFsVfGDXV'+
              '+2jyGjsFxijixuuC70W1C5r9bE7eLxggzGvDMlfLY1tXtby8E+48tX59QnqhdL0I/lK2MaPM8P8mARAdGryGoKhmyMlHo'+
              '+ScKnWc1JxOK1j4kRQI5NsNe+ivtbh8l04/SqyGlIbN7O24NIF8jpXWCIOCJpRAPBaTEbHOoa4jEPI0knX3ti4eCXvdrDr9nYnC5Yrrz8; '+
              'at-main="Atza|IwEBIP0-ueCvGxnsg-xd77AMEbe4yZcg0KbQadrogTaOT-kk3SQxUtY1wP35r1fjTGvVUwIaMhBazTawS_VlGFqJlvKo8o_5Y3hzdz'+
              '-wqeikFsrhHTfCBLBnuc4NX4tU3X41lZx0TYOozOaOztthKx-RGjjurhUXQQRJnOfJsQnxxWdKq70XOLFacueET_4hCV4Fi_qZweeJOZS2mJIq1m8M4RUx3krGsZ'+
              '-qy5GIqnBcgMm-W40mQq0CbZSzqgTfxW2BTXuiQneO9HSbiATWCX_qOx_PYUz_tXySmSPCt'+
              '-FU67T-8Zz7WPFuz7TFhnTY_zWbAvqP6YZaKlyEcbnW6O6iNlcy"; '+
              'sess-at-main="jnOzjH+PgJdyBVnkc3kb9fTthlWDAAq3zeisV11EssA="; '+
              'ubid-main=134-0469068-2193246; '+
              'x-main="xxFubNNLNjrTf8XC0VOAznAuREpK84M@oNSXiVKDenFldBe72b4Q0hzV1sJ?sl0k"'
  }
  // return {
  //   "x-amz-access-token": config.accessToken,
  //   "Authorization": "RABBIT3-HMAC-SHA256 SignedHeaders=x-amz-access-token;x-amz-date,Signature=6d0ea86d26c825c0b8cc0145302182a980b1abdb0969c93f6515eb533c426073",
  //   "Accept": "*/*",
  //   "X-Amz-Date": getDate(),
  //   "x-flex-instance-id": "9856001A-E1F4-4617-8744-6EE2B786407B",
  //   "Signature-Input": "x-amzn-attest=(\"@path\" \"x-amzn-marketplace-id\" \"user-agent\");created=1694049707;nonce=1694049707;alg=\"apple-attest\";keyid=\"AQICAHg6N78IGuxLSTPuc/3D5Yv7mvTdfGel3G3UiwRJt0NZmwGovUfhVn4MRIvT/Bh66bi5AAABGjCCARYGCSqGSIb3DQEHBqCCAQcwggEDAgEAMIH9BgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDF7SXu2j4mZ7iR8YqQIBEICBzxXnh2CFzBqDR/Jl/lvaTYEuZ0zO+6N2gTBngr5xCWSy4N5lS4XME02dpflYgAGNrKZAy76h44TlKCgAKQo8UealBUkuFa9trh5Gwa42i94H0oISxDToZ2Eqfsl1/zr7WhComhxOQBJT/mOiTqNjzSTHpupUtqBokNkG5i1NN/hNZHxDqPXyvcNYR1CoiO9CZ+snMAAzbn9/aJfCWg1tvs9+rImRtoRo1dvJdT8z5suLr9/qHMoicO6xtBCMWavWpbv3av/2D+RfKWbcKAJlwQ==",
  //   "Signature": "x-amzn-attest=:omlzaWduYXR1cmVYRjBEAiAYVNOnPDfoSIL3TQeCSHSLslBHmsxuMfaU0rtLjwC/vgIgS0qdk/evq2kULJKfsQnQtokJSBcpIotWP+bYyezbWq1xYXV0aGVudGljYXRvckRhdGFYJe3zwoUtG5hDPW9TteI89k5EUcjNvFiwX+hCB8b302X5QAAAF9Q=:",
  //   "Accept-Language": "en-US",
  //   "Content-Length": "86",
  //   "User-Agent": "iOS/16.1 (iPhone Darwin) Model/iPhone Platform/iPhone14,2 RabbitiOS/2.120.1",
  //   "Accept-Encoding": "gzip, deflate, br",
  //   "Connection": "keep-alive",
  //   "Content-Type": "application/json",
  //   "Cookie": "at-main=\"Atza|IwEBIBU8zzvURGQAMuctAcqCQYYLjj5cxcjBVr8HhzFvhwjtHH69xD5HldVdNb7JtDer8-3tsPyuAALzzRfCdlSNIcNg2ilmqEM6XGccZSK9-RtEvU9pLeYKe4HdKL1Xbzh6xNKWP4_1egHH6vhlr-TfoP0VYQBaGUo2LnHsKyA81EoidpZVwoebbFuiy4F3D_Wh81wRKHR-Jae-t2apVdZPju_S-D-jh6rZWLQT61R6ErMIiayVgJEwfe-40uTmAOmuy64wW1s5tEPxih53C--TMtv44HtOu9K_DsjaD2mD_Io5KEnkZgT1tErRVppetH6yJswgo-BFzF0TRVYM46IeXUpr\"; sess-at-main=\"387WHzu79ooGKTWd6lqKwp8SaY9czfBv47CZU9G7eL0=\"; session-id=140-7280277-5055447; session-id-time=2324637697l; ubid-main=134-0469068-2193246; x-main=\"qVzvDJixpogR586e11x2cLL9gbFh@e??AevBg4RuFnIeQrRH7jL96uKq7Qzm1ij0\"; session-token=ptAB8bWwCRcxeycqCOPd5hTmZatJlfSNtdAQ7gxDQf5ISnEQu+o2j4+ujChs3YtYqKKV7WjgBlNVtFbj2TRkfCTMUKZSTdcwscWw2bB21Z/Cwk4iy+NaY68IlwqPOKi9dZZKBeS/ZVQisl8zwdZAAsC+WrnHjNmTBIci",
  //   "x-amzn-marketplace-id": "ATVPDKIKX0DER"
  // }
}

const amznRoutes = {
    GetOffers: "https://flex-capacity-na.amazon.com/GetOffersForProviderPost",
    AcceptOffer: "https://flex-capacity-na.amazon.com/AcceptOffer",
    GetAuthToken: "https://api.amazon.com/auth/register",
    RequestNewAccessToken: "https://api.amazon.com/auth/token",
    ForfeitOffer: "https://flex-capacity-na.amazon.com/schedule/blocks/",
    GetEligibleServiceAreas: "https://flex-capacity-na.amazon.com/eligibleServiceAreas",
    GetOfferFiltersOptions: "https://flex-capacity-na.amazon.com/getOfferFiltersOptions",
    validateChallenge: "https://flex-capacity-na.amazon.com/ValidateChallenge"
}

const getAllServiceAreas = async () => {
  try {
    const data = await axios.get(amznRoutes.GetOfferFiltersOptions, {headers: getFlexHeaders()});
    console.log(data.data.serviceAreaPoolList);
  } catch(err) {
    if(err.response.status === 403) {
      await getFlexAccessToken();
      return getAllServiceAreas();
    }
  }
}

const getServiceAreas = async () => {
  try {
    let data = await axios.get(amznRoutes.GetEligibleServiceAreas, {headers: getFlexHeaders()})
    // console.log('returning service area ids');
    selfAreaIds = data.data.serviceAreaIds;
    return data.data.serviceAreaIds;
  } catch(err) {
    if(err.response.status === 403) {
      // console.log('getServiceAreas: 403 encountered. Token expired.')
      await getFlexAccessToken();
      return getServiceAreas();
    }
  }
}

const getFlexAccessToken = async () => {
  const data = {
    "app_name": APP_NAME,
    "app_version": APP_VERSION,
    "source_token_type": "refresh_token",
    "source_token": config.refreshToken,
    "requested_token_type": "access_token",
  }
  const headers = {
    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; Pixel 2 Build/OPM1.171019.021)",
    "x-amzn-identity-auth-domain": "api.amazon.com",
  }

  // console.log('getFlexAccessToken: Getting new token')

  const res = await axios.post(amznRoutes.RequestNewAccessToken, data, { headers });
  config.accessToken = res.data.access_token

  const configFile = path.join(__dirname, '..', 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

  // console.log('getFlexAccessToken: Got New Token')
}

const offersRequestBody = async () => {
  const areaIds = selfAreaIds.length > 0 ? selfAreaIds : await getServiceAreas();
  // console.log(areaIds);
  return {
    "apiVersion": "V2",
    "filters": {
      "serviceAreaFilter": config.desiredWarehouses,
      "timeFilter": {"endTime": config.desiredEndTime, "startTime": config.desiredStartTime}
    },
    "serviceAreaIds": areaIds
  }
}

const getOffers = async () => {
  try {
    // console.log('getting offers');
    const offers = await axios.post(amznRoutes.GetOffers, await offersRequestBody(), {headers: getFlexHeaders()})
    return offers;
  } catch(err) {
    if(err.response.status === 403) {
      await getFlexAccessToken();
      return getOffers();
    } else {
      // console.log(err.response.data.message);
      throw new Error()
    }
  }
}

let availability = getDesiredWeekdays();

const processOffers = async (offers) => {
  // console.log('Processing Offers');
  const allOffers = offerShaper(offers);
  allOffers.sort((a, b) => b["Pay Rate Per Hour"] - a["Pay Rate Per Hour"]);
  // const [offer] = allOffers; //Grab only the first offer in the array
  for(const offer of allOffers) { // Processess all offers in the aray
    if(
      config.desiredWarehouses.includes(offer['serviceAreaId'])
      && offer['hidden'] !== null // Accept offer whether or not it's hidden
      && (availability === null || availability.includes(offer['weekDay']))
      && (!config.minBlockRate || offer['Pay'] >= config.minBlockRate)
      && (!config.minPayRatePerHour || offer['Pay Rate Per Hour'] >= config.minPayRatePerHour)
      && (!config.arrivalBuffer || offer['minutesTil'] >= config.arrivalBuffer)
      && (isAvailable(offer['Start Time'], config.desiredStartTime, config.desiredEndTime))
    ) {
        // console.log('Sub Same Day Block Found')
        await acceptOffer(offer);
    }

    else if(
      config.desiredWFWarehouses.includes(offer['serviceAreaId'])
      && (!config.minPayRatePerHourWF || offer['Pay Rate Per Hour'] >= config.minPayRatePerHourWF)
      && (!config.arrivalBufferWF || offer['minutesTil'] >= config.arrivalBufferWF)
      && (isAvailable(offer['Start Time'], config.desiredStartTime, config.desiredEndTime))
    ) {
      // console.log('Wholefoods Block Found')
      await acceptOffer(offer)
    }

    else if(
      config.desiredGroceryWarehouses.includes(offer['serviceAreaId'])
      && (!config.minPayRatePerHourGrocery || offer['Pay Rate Per Hour'] >= config.minPayRatePerHourGrocery)
      && (!config.arrivalBufferGrocery || offer['minutesTil'] >= config.arrivalBufferGrocery)
      && (isAvailable(offer['Start Time'], config.desiredStartTime, config.desiredEndTime))
    ) {
      // console.log('Grocery Block Found')
      await acceptOffer(offer)
    }

    else if(
      !config.desiredWarehouses.includes(offer['serviceAreaId'])
      && !config.desiredWFWarehouses.includes(offer['serviceAreaId'])
      && !config.desiredGroceryWarehouses.includes(offer['serviceAreaId'])
    ) {
      // console.log(`not accepting offers from ${config.serviceAreas[offer['serviceAreaId']]}`);
    }

    else {
      // console.log(`\nDoes not meet criteria.\n`);
      // for(let keys in offer) {keys !== 'id' && console.log(`${keys}: ${offer[keys]}`)};
    }
  }
}

const acceptOffer = async (offer) => {
  // console.log('Attempting to grab block');
  try {
    const request = await axios.post(amznRoutes.AcceptOffer, {'offerId': offer['id']}, {headers: getFlexHeaders()})
    sessionBlockS++;
    config.blockCapturesOverall++;
    console.log('Succesfully grabbed block');
    console.log(`\n
        Location: ${offer['Location']}
        Date: ${offer['Date']}
        Start Time: ${offer['Start Time']}
        End Time: ${offer['End Time']}
        Pay: ${offer['Pay']}
        Pay Rate: ${offer['Pay Rate Per Hour']}
        Block Duration: ${offer['Block Duration']}
        Surge: ${offer['Surge']}
        Hidden: ${offer['hidden']}
    \n`);
  } catch(err) {
    const status = err.response.status;

    if(status === 403) {
      await getFlexAccessToken();
      return acceptOffer(offer);
    }

    else if(status === 307) {
      sessionBlockF++;
      config.failedBlockCapturesOverall++;
      return await validateChallenge();
    }

    else {
      sessionBlockF++;
      config.failedBlockCapturesOverall++;
      // console.log(`Unable to accept an offer. Request returned status code ${status}`);
      await sleep(2000);
      return validateChallenge() //validate account in case of immediate offers available after failure. NOT ASYNC
    }
  }
  // Save config changes for new catpcha and block values
  const configFile = path.join(__dirname, '..', 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

const run = () => {
  console.log("Starting block search...");
  // const now = new Date();
  const options = { timeZone: 'America/Los_Angeles', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const pstTime = () => new Intl.DateTimeFormat('en-US', options).format(new Date());
  let lastReqEvent = Date.now();
  const looper = async () => {
    retryCount++;
    console.log(`[${pstTime()}] [${retryCount}] [Timeouts: ${timeouts}] || *CUR* Block: S=${sessionBlockS} F=${sessionBlockF} || Captcha: S=${sessionCaptchaS} F=${sessionCaptchaF} || *ALL* Block: S=${config.blockCapturesOverall} F=${config.failedBlockCapturesOverall} || Captcha: S=${config.captchaOverallS} F=${config.captchaOverallF}`)
    try {
      const offers = await getOffers();
      if(offers.data.offerList.length > 0) {
        // console.log(`${offers.data.offerList.length} Blocks Found`);
        // offers.data.offerList.map(offer => config.offers.push(offer));
        // const configFile = path.join(__dirname, '..', 'config.json');
        // fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        await processOffers(offers.data.offerList);
      }
      // if lastReqEvent is greater than PRESET minutes from now, DECREASE the requestInterval. Make lastReqEvent time now.
      if(Date.now() - lastReqEvent > config.dynamicRequestTrigger * 1000 * 60) {
        config.refreshInterval -= 0.05;
        lastReqEvent = Date.now();
        console.log('refreshInterval decreasing...');
      }
    }catch(err) {
      timeouts++;
      //If lastReqEvent is less than PRESET minutes ago from now, INCREASE the requestInterval. Done before timeout occurs
      if((Date.now() - lastReqEvent) < (config.dynamicRequestTrigger * 1000 * 60)) {
        config.refreshInterval += 0.05;
        console.log('refreshInterval increasing...');
      }
      const minutesToWwait = config.timeoutLength + ((Math.floor(Math.random() * 3) + 1) + 0.13);
      console.log(`Rate limit reached. Waiting for ${minutesToWwait.toFixed(2)} minutes`);
      rateLimited = true;
      await sleep(minutesToWwait * 60 * 1000);
      rateLimited = false;
      rateErrors = 0;
      await validateChallenge();
      // Update lastReqEvent before resuming search
      lastReqEvent = Date.now();
      console.log("Resuming search...");
    }
    // Write new config values for refreshInterval
    const configFile = path.join(__dirname, '..', 'config.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    if(retryCount < config.retryLimit) {
      await sleep(config.refreshInterval * 1000);
      looper();
    } else {
      console.log("Block search ending...");
    }
  }
  // setInterval(
  //   () => {
  //     if(rateLimited === false) {
  //       console.log(`[${pstTime}] [${retryCount}] [Timeouts: ${timeouts}] || *CUR* Block: S=${sessionBlockS} F=${sessionBlockF} || Captcha: S=${sessionCaptchaS} F=${sessionCaptchaF} || *ALL* Block: S=${config.blockCapturesOverall} F=${config.failedBlockCapturesOverall} || Captcha: S=${config.captchaOverallS} F=${config.captchaOverallF}`);
  //     }
  //   },
  //   config.consoleLogInterval * 1000
  // )
  looper();
}

module.exports = {
  amznRoutes,
  getDate,
  getFlexAccessToken,
  getOffers,
  getServiceAreas,
  offersRequestBody,
  getFlexHeaders,
  run,
  processOffers,
  isAvailable,
  acceptOffer,
  acGate,
  getAllServiceAreas,
  validateChallenge,
  availability,
  getDesiredWeekdays
}