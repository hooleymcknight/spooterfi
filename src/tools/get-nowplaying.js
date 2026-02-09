const fs = require('fs');

const artistFile = 'Snip_Artist.txt';
const titleFile = 'Snip_Track.txt';

const clearFileContent = async (fileDirectory) => {
    await fs.promises.writeFile(`${fileDirectory}${titleFile}`, '', { flag: 'w' }, (err) => {
        if (err) {
            console.error(err);
            return { type: 'baddir', message: 'Error with song title directory. Please check settings.' };
        }
    });

    await fs.promises.writeFile(`${fileDirectory}${artistFile}`, '', { flag: 'w' }, (err) => {
        if (err) {
            console.error(err);
            return { type: 'baddir', message: 'Error with song artist directory. Please check settings.' };
        }
    });

    return { type: 'success' };
}

const updateFileContent = async (fileDirectory, songInfo) => {
    let songTitle = songInfo.isPlaying ? songInfo.title : '';
    let songArtist = songInfo.isPlaying ? songInfo.artist : '';

    await fs.promises.writeFile(`${fileDirectory}${titleFile}`, songTitle, { flag: 'w' }, (err) => {
        if (err) {
            console.error(err);
            return { type: 'baddir', message: 'Error with song title directory. Please check settings.' };
        }
    });

    await fs.promises.writeFile(`${fileDirectory}${artistFile}`, songArtist, { flag: 'w' }, (err) => {
        if (err) {
            console.error(err);
            return { type: 'baddir', message: 'Error with song artist directory. Please check settings.' };
        }
    });

    return { type: 'success' };
}

const getNowPlaying = async (accessToken, fileDirectory) => {
    const NOW_PLAYING_URL = `https://api.spotify.com/v1/me/player/currently-playing`;
    // console.log('get np');

    let returnValue = await fetch(NOW_PLAYING_URL, {
        headers: {
            'Authorization': `Bearer ${accessToken}`, // The access token obtained via Auth Code Flow
        },
    })
    .then(async (data) => {
        if (data.status == '204') {
            // console.log('no content');
            return { type: 'no-content' };
        }

        const song = await data.json();
        if (song.error) {
            if (song.error.message.includes('access token expired') || song.error.message.includes('Permissions missing') || song.error.message.includes('Invalid access token')) {
                // expired handler
                // console.log('atexp')
                return { type: 'atexp', message: song.error.message };
            }
            else {
                // console.log('Another error occurred:', song.error.message);
                return { type: 'err', message: song.error.message };
            }
        }
    
        // Process the data
        const title = song.item?.name || '';
        const artist = song.item?.artists.map(a => a.name).join(', ') || '';
        // const albumImageUrl = song.item.album.images[0].url;
        const isPlaying = song.is_playing || false;
        

        const songInfo = { title, artist, isPlaying };
        let writeResult = await updateFileContent(fileDirectory, songInfo);
        // console.log('write results', writeResult)
        if (writeResult.type == 'baddir') {
            return { type: 'baddir', message: err.message };
        }
        return { type: 'success' };
    })
    .catch((err) => {
        console.error(err);
        if(err.message.includes('no such file or directory')) {
            return { type: 'baddir', message: err.message };
        }
        return { type: 'err', message: err.message };
    });
    return returnValue;
};

module.exports = { getNowPlaying, clearFileContent }