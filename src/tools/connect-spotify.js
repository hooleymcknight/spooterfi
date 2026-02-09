// const { store } = require('../helpers/helpers.js');
var crypto = require('crypto');
var querystring = require('querystring');

const client_id = 'efd5b392b3b24d8d9427875e24eeda69'; // your clientId
const client_secret = '4ae3a95ab3794858910a6efcb541b2ce'; // Your secret
const redirect_uri = 'http://127.0.0.1:8888/callback'; // Your redirect uri
const stateKey = 'spotify_auth_state';
let scope = 'user-read-playback-state user-read-currently-playing'; // user-read-private user-read-email 

const generateRandomString = (length) => {
    return crypto
    .randomBytes(60)
    .toString('hex')
    .slice(0, length);
}

const login = () => {
    let state = generateRandomString(16);
    // store.set('state', state);
    //
    fetch('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        })
    )
    .then((res) => {
        console.log(res);
        console.log(res.body.json())
    })
    .catch((err) => {
        console.error(err);
    })
}

// login();

const getNewAccessToken = async (refreshToken) => {
    const accessToken = await fetch(`https://accounts.spotify.com/api/token`, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64')) 
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: client_id
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