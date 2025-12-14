import path from 'path'
import * as url from 'url'

const isDevelopment = process.env.NODE_ENV !== 'production'

// see https://github.com/electron-userland/electron-webpack/issues/99#issuecomment-459251702
export function getStatic(val) {
  if (isDevelopment) {
    return url.resolve(window.location.origin, val)
  }
  return path.resolve(__static, val)
}




// console.log(`https://api.twitch.tv/helix/users?login=hooleymcknight&clientId:${clientId}`)
// fetch(`https://api.twitch.tv/helix/users?login=hooleymcknight`, {
//   method: 'GET',
//   headers: {
//     "Content-Type": "application/json",
//     "Accept": "application/json",
//     "OAuth": oauth,
//   }
// }).then((res) => {
//   console.log('we got here')
//   console.log(res);
//   console.log(res.json())
// }).catch(err => {
//   console.log('didnot work')
//   console.log(err);
// })