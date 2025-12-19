/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/documentation/web-api/tutorials/code-flow
 */

var express = require('express');
var request = require('request');
var crypto = require('crypto');
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
const { store } = require('../../helpers/helpers.js');

const connectSpotifyApp = () => {

    const html = `<!doctype html>
    <html>
    <head>
        <title>Connect Spotify Account</title>
        <link rel="stylesheet" href="//netdna.bootstrapcdn.com/bootstrap/3.1.1/css/bootstrap.min.css">
        <style type="text/css">
            #login, #loggedin {
                display: none;
            }
            .text-overflow {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                width: 500px;
            }
            #oauth .dl-horizontal {
                display: grid;
                grid-template-areas: "rtoken_label rtoken rtoken_copy"
                "atoken_label atoken atoken_copy";
            }
            #oauth dd {
                margin-left: 0;
            }
            .state-error-msg { display: none; }
            .show-state-error .state-error-msg { display: block; }
        </style>
    </head>

    <body>
        <div class="container">
        <div id="login">
            <h1>Connect Spotify Account</h1>
            <a href="/login" class="btn btn-primary">Log in with Spotify</a>
            <p class="state-error-msg">State initializing. Please try again.</p>
        </div>
        <div id="loggedin">
            <div id="user-profile">
            </div>
            <div id="oauth">
            </div>
            <button class="btn btn-default" id="obtain-new-token">Obtain new token using the refresh token</button>
            <p>
                <b>NOTE:</b>  It is recommended to click "Obtain new token" button every time before copying a new access token. <br/>
                After copying the access token, paste it into the settings of your Spooterfi app.
            </p>
        </div>
        </div>

        <script id="user-profile-template" type="text/x-handlebars-template">
        <h1>Logged in as {{display_name}}</h1>
        <div class="media">
            <div class="pull-left">
            <img class="media-object" width="150" src="{{images.0.url}}" />
            </div>
            <div class="media-body">
            <dl class="dl-horizontal">
                <dt>Display name</dt><dd class="clearfix">{{display_name}}</dd>
                <dt>Id</dt><dd>{{id}}</dd>
                <dt>Email</dt><dd>{{email}}</dd>
                <dt>Spotify URI</dt><dd><a href="{{external_urls.spotify}}">{{external_urls.spotify}}</a></dd>
                <dt>Link</dt><dd><a href="{{href}}">{{href}}</a></dd>
                <dt>Profile Image</dt><dd class="clearfix"><a href="{{images.0.url}}">{{images.0.url}}</a></dd>
                <dt>Country</dt><dd>{{country}}</dd>
            </dl>
            </div>
        </div>
        </script>

        <script id="oauth-template" type="text/x-handlebars-template">
        <h2>oAuth info</h2>
        <dl class="dl-horizontal">
            <dt id="atoken_label">Access token</dt><dd id="atoken" class="text-overflow">{{access_token}}</dd>
            <button id="atoken_copy" onClick="copyContent('atoken')">Click to copy</button>
            <dt id="rtoken_label">Refresh token</dt><dd id="rtoken" class="text-overflow">{{refresh_token}}</dd>
            <button id="rtoken_copy" onClick="copyContent('rtoken')">Click to copy</button>
        </dl>
        </script>

        <script src="//cdnjs.cloudflare.com/ajax/libs/handlebars.js/2.0.0-alpha.1/handlebars.min.js"></script>
        <script src="http://code.jquery.com/jquery-1.10.1.min.js"></script>
        <script>
        function copyContent(elementId) {
            const codeContainer = document.getElementById(elementId);
            const string = codeContainer.textContent;

            navigator.clipboard.writeText(string).then(() => {
            //
            }).catch(err => {
            // Handle potential errors
            console.error("Copy failed: ", err);
            });
        }
        </script>
        <script>
        (function() {

            /**
             * Obtains parameters from the hash of the URL
             * @return Object
             */
            function getHashParams() {
            var hashParams = {};
            var e, r = /([^&;=]+)=?([^&;]*)/g,
                q = window.location.hash.substring(1);
            while ( e = r.exec(q)) {
                hashParams[e[1]] = decodeURIComponent(e[2]);
            }
            return hashParams;
            }

            var userProfileSource = document.getElementById('user-profile-template').innerHTML,
                userProfileTemplate = Handlebars.compile(userProfileSource),
                userProfilePlaceholder = document.getElementById('user-profile');

            var oauthSource = document.getElementById('oauth-template').innerHTML,
                oauthTemplate = Handlebars.compile(oauthSource),
                oauthPlaceholder = document.getElementById('oauth');

            var params = getHashParams();

            var access_token = params.access_token,
                refresh_token = params.refresh_token,
                error = params.error;

            if (error) {
            alert('There was an error during the authentication');
            window.location.href = 'http://localhost:8888';
            } else {
            if (access_token) {
                // render oauth info
                oauthPlaceholder.innerHTML = oauthTemplate({
                access_token: access_token,
                refresh_token: refresh_token
                });

                $.ajax({
                    url: 'https://api.spotify.com/v1/me',
                    headers: {
                    'Authorization': 'Bearer ' + access_token
                    },
                    success: function(response) {
                    userProfilePlaceholder.innerHTML = userProfileTemplate(response);

                    $('#login').hide();
                    $('#loggedin').show();
                    }
                });
            } else {
                // render initial screen
                $('#login').show();
                $('#loggedin').hide();
            }

            document.getElementById('obtain-new-token').addEventListener('click', function() {
                $.ajax({
                url: '/refresh_token',
                data: {
                    'refresh_token': refresh_token
                }
                }).done(function(data) {
                access_token = data.access_token;
                oauthPlaceholder.innerHTML = oauthTemplate({
                    access_token: access_token,
                    refresh_token: refresh_token
                });
                });
            }, false);
            }
        })();
        </script>
    </body>
    </html>
    `;

    var client_id = 'efd5b392b3b24d8d9427875e24eeda69'; // your clientId
    var client_secret = '4ae3a95ab3794858910a6efcb541b2ce'; // Your secret
    var redirect_uri = 'http://127.0.0.1:8888/callback'; // Your redirect uri


    const generateRandomString = (length) => {
        return crypto
        .randomBytes(60)
        .toString('hex')
        .slice(0, length);
    }

    var stateKey = 'spotify_auth_state';

    var app = express();

    // app.use(express.static(__dirname + '/public'))
    app.use(cookieParser())
        .use(cors());

    app.get('/', (req, res) => {
        res.send(html);
    });

    app.get('/login', function(req, res) {
        var state = generateRandomString(16);
        store.set('state', state);

        // res.cookie(stateKey, state, { httpOnly: false, secure: true, sameSite: 'none', maxAge: 24 * 60 * 60 * 1000 });

        // your application requests authorization
        var scope = 'user-read-private user-read-email user-read-playback-state user-read-currently-playing';
        res.redirect('https://accounts.spotify.com/authorize?' +
            querystring.stringify({
                response_type: 'code',
                client_id: client_id,
                scope: scope,
                redirect_uri: redirect_uri,
                state: state
            })
        );
    });

    app.get('/callback', function(req, res) {
        // your application requests refresh and access tokens
        // after checking the state parameter

        var code = req.query.code || null;
        var state = req.query.state || null;
        var storedState = store.get('state') || null;
        // var storedState = req.cookies ? req.cookies[stateKey] : null;

        if (state === null || state !== storedState) {
            res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
        } else {
            // res.clearCookie(stateKey);
            store.set('state', null);
            var authOptions = {
                url: 'https://accounts.spotify.com/api/token',
                form: {
                    code: code,
                    redirect_uri: redirect_uri,
                    grant_type: 'authorization_code'
                },
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
                },
                json: true
            };

            request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {

                var access_token = body.access_token,
                    refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function(error, response, body) {
                    console.log(body);
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
                } else {
                    res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
                }
            });
        }
    });

    app.get('/refresh_token', function(req, res) {

        var refresh_token = req.query.refresh_token;
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            headers: { 
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64')) 
            },
            form: {
                grant_type: 'refresh_token',
                refresh_token: refresh_token
            },
            json: true
        };

        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                var access_token = body.access_token,
                    refresh_token = body.refresh_token;
                res.send({
                    'access_token': access_token,
                    'refresh_token': refresh_token
                });
            }
        });
    });

    app.listen(8888, () => {
        console.log('Listening on 8888');
    });
}

module.exports = { connectSpotifyApp }