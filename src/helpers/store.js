const electron = require('electron');
const path = require('path');
const fs = require('fs');

class Store {
  constructor(opts) {
    // Renderer process has to get `app` module via `remote`, whereas the main process can get it directly
    // app.getPath('userData') will return a string of the user's app data directory path.
    const userDataPath = (electron.app || electron.remote.app).getPath('userData');
    // We'll use the `configName` property to set the file name and path.join to bring it all together as a string
    this.path = path.join(userDataPath, opts.configName + '.json');
    
    this.data = parseDataFile(this.path, opts.defaults);
  }
  
  // This will just return the property on the `data` object
  get(key) {
    return this.data[key];
  }
  
  // ...and this will set it
  set(key, val) {
    this.data[key] = val;
    // Wait, I thought using the node.js' synchronous APIs was bad form?
    // We're not writing a server so there's not nearly the same IO demand on the process
    // Also if we used an async API and our app was quit before the asynchronous write had a chance to complete,
    // we might lose that data. Note that in a real app, we would try/catch this.
    fs.writeFileSync(this.path, JSON.stringify(this.data));
  }
}

function parseDataFile(filePath, defaults) {
  // Defaults used to apply only when the file was missing entirely, so any key
  // added in a newer version stayed undefined forever on an existing install -
  // and a partial file would crash on launch (windowBounds gets destructured).
  //
  // Merging one level deep matters because `settings` is a nested object: a
  // stored { settings: { fileDirectory } } should keep the default empty
  // tokens rather than replacing the whole settings object.
  const isPlainObject = (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath));
    if (!isPlainObject(parsed)) return { ...defaults };

    const merged = { ...defaults, ...parsed };

    for (const key of Object.keys(defaults)) {
      if (isPlainObject(defaults[key]) && isPlainObject(parsed[key])) {
        merged[key] = { ...defaults[key], ...parsed[key] };
      }
    }
    return merged;
  } catch(error) {
    // file doesn't exist yet, or is unreadable - start from defaults.
    return { ...defaults };
  }
}

// expose the class
module.exports = Store;