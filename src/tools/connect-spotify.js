const crypto = require('crypto');
const querystring = require('querystring');
const appData = require('../config.json');

const clientId = appData.clientId;
const clientSecret = appData.clientSecret;

const getNewAccessToken = async (refreshToken) => {
    const accessToken = await fetch(`https://accounts.spotify.com/api/token`, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + (new Buffer.from(clientId + ':' + clientSecret).toString('base64')) 
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId
        })
    })
    .then((response) => {
        return response.json();
    })
    .then((result) => {
        if (result.error) {
            return result;
        }
        return result.access_token;
    })
    .catch((err) => {
        console.log(err);
    });
    return accessToken;
}

module.exports = { getNewAccessToken }