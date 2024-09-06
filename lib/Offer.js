const config = require('../config.json');

const offerShaper = (offers) => {
    const foundOffers = offers.map(offer => {
        const id = offer['offerId'];
        const serviceAreaId = offer['serviceAreaId'];

        // Convert startTime and endTime to PST
        const options = { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: true };
        const startTimePST = new Date(offer['startTime'] * 1000).toLocaleString('en-US', options);
        const endTimePST = new Date(offer['endTime'] * 1000).toLocaleString('en-US', options);

        const location = offer['serviceAreaId'];
        const blockRate = parseFloat(offer['rateInfo']['priceAmount']);
        const blockHours = Math.floor((offer['endTime'] - offer['startTime']) / 3600); // 1 hour = 3600 seconds
        const blockMinutes = Math.floor(((offer['endTime'] - offer['startTime']) % 3600) / 60); // 1 minute = 60 seconds
        const ratePerHour = blockRate / (blockHours + (blockMinutes / 60));
        const surgeMultiplier = offer['rateInfo']['surgeMultiplier'];
        const hidden = offer['hidden'];
        const weekDay = new Date(offer['startTime'] * 1000).getDay();

        const offerObject = { id, serviceAreaId };
        offerObject['Location'] = config['serviceAreas'][location] || 'unknown';
        offerObject['Date'] = new Date(offer['startTime'] * 1000).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        offerObject['Start Time'] = startTimePST;
        offerObject['End Time'] = endTimePST;
        offerObject['Pay'] = blockRate;
        offerObject['Pay Rate Per Hour'] = ratePerHour.toFixed(2);
        offerObject['Block Duration'] = `${String(blockHours).padStart(2, '0')}:${String(blockMinutes).padStart(2, '0')}`;
        offerObject['Surge'] = surgeMultiplier;
        offerObject['minutesTil'] = Math.floor((offer['startTime'] - Date.now() / 1000) / 60); // Convert Date.now() to seconds
        offerObject['hidden'] = hidden;
        offerObject['weekDay'] = weekDay;
        return offerObject;
    })
    return foundOffers;
};

module.exports = { offerShaper };

const obj = {
    "creationDate": null,
    "deliveryCutOffTimeEpoch": null,
    "deliveryRequest": null,
    "endTime": 1693615500,
    "expirationDate": 1693604700,
    "hidden": false,
    "isPriorityOffer": false,
    "legalEntity": null,
    "maxWorkload": 0,
    "offerId": "Ok9mZmVySWQuRW5jcnlwdGlvbktleS02aGlZbDQAAACDDtWCQwmuLr47dpeZlTu2JIh957qOFJ8bzXiruJcB7RTxhpCmMclBlQAJD+yk3nNaxkr1rvzzP3b3PyA6KgD0pfDSC55Wrh5p4/pDRAHLSB5VfBw/Ttpg7LCARTeuhoJxD7kIZZSP8m/Pwui8xuglfYj63m3YHHrw7aVD9EThSEyTymZ3tZztVLXR3hh3PVfk735POIDP3UECoGKnm8IQBADfvTJWQem/uMflpYgr8w09cgh/NlK2mDQClcMxXTCfnfsVk2DKSRxkxjOUSLV0ThrWNZV/Mc5sdqMo1XhstMH9SlY+NNvD9+0KR/zX4Dh4EeA4ezZWR9FwG+9PvhgyRfQaQCM0YAKPzZPGMXxFSVcI/mFgDyfTfNVPvadtCFyoyh4OVkzRFhE+PQcsuCku+4rfUVXmvZv5EINfU9HYIteMRKyZzxgCuzLd9JRWNzgmO81+4pLD2nEW2oI7hamUHsQoePtyml8uD75IIWJNvq7YJ0gw+xkC7oGYcmy911figxjkQuhwsGd+KWRZt4rGUuHFgvtaJKPXhOTeQNysKoapqa57/snK53rRDAnsbXoO1hXKkxrQMoNGsjAhwJ3K|oS1mCM3A409WGhm1zihEzPPISHRelMcUcj125565hC4=",
    "offerMetadata": null,
    "offerType": "NON_EXCLUSIVE",
    "rateInfo": {
      "PriceDetails": null,
      "currency": "USD",
      "isSurge": true,
      "priceAmount": 66,
      "pricingUXVersion": "V2",
      "projectedTips": 0,
      "surgeMultiplier": "⇧ 22%",
      "upfrontTips": null
    },
    "schedulingType": "BLOCK",
    "serviceAreaId": "0f3a0439-817f-419f-a2dc-422ab2635b55",
    "serviceTypeId": "amzn1.flex.st.v1.PuyOplzlR1idvfPkv5138g",
    "serviceTypeMetadata": {
      "modeOfTransportation": null,
      "nameClassification": "STANDARD"
    },
    "startTime": 1693604700,
    "startingLocation": {
      "address": {},
      "geocode": {},
      "locationType": null,
      "startingLocationName": ""
    },
    "status": "OFFERED",
    "trIds": null
}

// offerShaper([obj]);