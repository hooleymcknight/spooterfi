const fs = require('fs');

const artistFile = 'Snip_Artist.txt';
const titleFile = 'Snip_Track.txt';

const updateFileContent = async (fileDirectory, songInfo) => {
    await fs.promises.writeFile(`${fileDirectory}${titleFile}`, songInfo.title, { flag: 'w' }, (err) => {
        if (err) {
            console.error(err);
            return 'baddir';
        }
    });

    await fs.promises.writeFile(`${fileDirectory}${artistFile}`, songInfo.artist, { flag: 'w' }, (err) => {
        if (err) {
            console.error(err);
            return 'baddir';
        }
    });

    return 'success';
}

const getNowPlaying = async (accessToken, fileDirectory) => {
    const NOW_PLAYING_URL = `https://api.spotify.com/v1/me/player/currently-playing`;

    let returnValue = await fetch(NOW_PLAYING_URL, {
        headers: {
            'Authorization': `Bearer ${accessToken}`, // The access token obtained via Auth Code Flow
        },
    })
    .then(async (data) => {
        const song = await data.json();

        if (song.error) {
            if (song.error.message.includes('access token expired')) {
                // expired handler
                console.log('atexp')
                return 'atexp';
            }
            else {
                console.error('Another error occurred:', song.error.message);
                return 'err';
            }
        }

        // console.log('song!', song);
    
        // Process the data
        const title = song.item.name;
        const artist = song.item.artists.map(a => a.name).join(', ');
        // const albumImageUrl = song.item.album.images[0].url;
        // const isPlaying = song.is_playing;
        

        const songInfo = { title, artist };
        let writeResult = await updateFileContent(fileDirectory, songInfo);
        console.log('write results', writeResult)
        return writeResult;
    })
    .catch((err) => {
        console.error(err);
        // console.log(Object.keys(err)[0])
        if(err.message.includes('no such file or directory')) {
            return 'baddir';
        }
        return 'err';
    });
    // console.log('await return', returnValue)
    return returnValue;
};

module.exports = { getNowPlaying }