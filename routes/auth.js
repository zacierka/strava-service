var express = require('express');
var passport = require('passport');
var StravaStrategy = require('passport-strava').Strategy;
var db = require('../db');


passport.use(new StravaStrategy({
  clientID: process.env['STRAVA_CLIENT_ID'],
  clientSecret: process.env['STRAVA_CLIENT_SECRET'],
  callbackURL: '/oauth2/redirect/strava',
  scope: [process.env['STRAVA_SCOPE']],
  state: true
}, function verify(accessToken, refreshToken, params, profile, cb) {
  db.get('SELECT * FROM federated_credentials WHERE provider = ? AND subject = ?', [
    'https://www.strava.com',
    profile.id
  ], function(err, row) {
    if (err) { return cb(err); }
    if (!row) {
      db.run('INSERT INTO users (name) VALUES (?)', [
        profile.displayName
      ], function(err) {
        if (err) { return cb(err); }
        var id = this.lastID;
        db.run('INSERT INTO federated_credentials (user_id, provider, subject) VALUES (?, ?, ?)', [
          id,
          'https://www.strava.com',
          profile.id
        ], function(err) {
          if (err) { return cb(err); }
          var user = {
            id: id,
            name: profile.displayName
          };
          return cb(null, user);
        });
      });
    } else {
      db.get('SELECT * FROM users WHERE id = ?', [ row.user_id ], function(err, row) {
        if (err) { return cb(err); }
        if (!row) { return cb(null, false); }
        return cb(null, row);
      });
    }
  });
}));

passport.serializeUser(function(user, cb) {
  process.nextTick(function() {
    cb(null, { id: user.id, username: user.username, name: user.name });
  });
});

passport.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, user);
  });
});


var router = express.Router();

router.get('/login', function(req, res, next) {
  res.render('login');
});

router.get('/login/federated/strava', passport.authenticate('strava'));

router.get('/oauth2/redirect/strava', passport.authenticate('strava', {
  successReturnToOrRedirect: '/',
  failureRedirect: '/login'
}));

router.post('/logout', function(req, res, next) {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

module.exports = router;
