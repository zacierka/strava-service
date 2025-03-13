var sqlite3 = require('sqlite3');
var mkdirp = require('mkdirp');

mkdirp.sync('var/db');

var db = new sqlite3.Database('var/db/todos.db');

db.serialize(function () {
  db.run("CREATE TABLE IF NOT EXISTS users ( \
    id INTEGER PRIMARY KEY AUTOINCREMENT, \
    provider_id INTEGER UNIQUE NOT NULL, \
    username TEXT, \
    resource_state INTEGER, \
    first_name TEXT, \
    last_name TEXT, \
    bio TEXT, \
    city TEXT, \
    state TEXT, \
    country TEXT DEFAULT 'United States', \
    sex TEXT CHECK(sex IN ('M', 'F')), \
    premium BOOLEAN, \
    summit BOOLEAN, \
    created_at TEXT, \
    updated_at TEXT, \
    badge_type_id INTEGER, \
    weight REAL, \
    profile_medium TEXT, \
    profile TEXT \
  )");

  db.run("CREATE TABLE IF NOT EXISTS oauth_tokens ( \
    id INTEGER PRIMARY KEY AUTOINCREMENT, \
    provider_id INTEGER UNIQUE NOT NULL, \
    access_token TEXT NOT NULL, \
    refresh_token TEXT NOT NULL, \
    expires_at INTEGER NOT NULL, \
    FOREIGN KEY (provider_id) REFERENCES oauth_users (provider_id) ON DELETE CASCADE \
  )");

});

module.exports = db;
