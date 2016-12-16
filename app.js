var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var Twitter = require('Twitter');
var moment = require('moment');
var app = express();

app.use('/static', express.static(__dirname + '/public'));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Twitter Settings
var username = 'ashskywalker10';
var config = require('./data/twitter_config.json');
var twitterDetails = {
  'username': username
};

var twitter = new Twitter(config);

// Get all the necessary data for the user before putting it out. Using middleware to get the data in the order we need it to
app.get('/', userDetails, userTweets, userFriends, userSentMessages, userReceivedMessages, loadPage);

// Route for handling form submission so we can get a tweet and post it. No matter what happens, refresh the page
app.post('/send-tweet', function(req, res) {
  var postData = req.body.tweetText;
  // Only send tweet if the number of characters are less than or equal to 140 characters
  if (postData.length <= 140) {
    twitter.post('statuses/update', {status: req.body.tweetText}, function (error, data, response) {
      res.redirect('/');
    });
  } else {
    res.redirect('/');
  }
});

/**
 * Get the details about the user we are profiling
 * @param req
 * @param res
 * @param next
 */
function userDetails(req, res, next){
  twitter.get('users/show', {screen_name: username}, function(error, data, response){
    twitterDetails['id'] = data.id;
    twitterDetails['name'] = data.name;
    twitterDetails['friends_count'] = data.friends_count;
    twitterDetails['profile_background_image_url'] = data.profile_background_image_url;
    twitterDetails['profile_image_url'] = data.profile_image_url;
    next();
  });
}

/**
 * Get the 5 latest tweets from the user we are profiling
 * @param req
 * @param res
 * @param next
 */
function userTweets(req, res, next){
  twitter.get('statuses/user_timeline', {screen_name: username, count: '5'}, function(error, data, response){
    twitterDetails['tweets'] = [];
    if (!error) {
      for (var i = 0; i < data.length; i++) {
        // Parse the created at date from twitter to something the moment library can manage
        tweetTimestamp = moment(data[i].created_at, 'dd MMM DD HH:mm:ss ZZ YYYY', 'en');
        twitterDetails['tweets'].push({
          'created_at': data[i].created_at,
          'created_at_humanized':  tweetTimestamp.fromNow(true),
          'text': data[i].text,
          'retweet_count': data[i].retweet_count,
          'favorite_count': data[i].favorite_count
        });
      }
    }
    next();
  });
}

/**
 * Get the five latest friends for the user we are profiling
 * @param req
 * @param res
 * @param next
 */
function userFriends(req, res, next){
  twitter.get('friends/list', {screen_name: username, count: '5'}, function(error, data, response){
    twitterDetails['friends'] = [];
    if (!error) {
      for (var i = 0; i < data['users'].length; i++) {
        twitterDetails['friends'].push({
          'name': data['users'][i].name,
          'screen_name': data['users'][i].screen_name,
          'image_url': data['users'][i].profile_image_url,
        });
      }
    }
    next();
  });
}

/**
 * Get the 5 latest messages that we have received by other people
 * @param req
 * @param res
 * @param next
 */
function userSentMessages(req, res, next){
  twitter.get('direct_messages', {screen_name: username, count: '5'}, function(error, data, response){
    twitterDetails['messages'] = [];
    if (!error) {
      for (var i = 0; i < data.length; i++) {
        tweetTimestamp = moment(data[i].created_at, 'dd MMM DD HH:mm:ss ZZ YYYY', 'en');
        twitterDetails['messages'].push({
          'text': data[i].text,
          'name': data[i].sender.name,
          'screen_name': data[i].sender.screen_name,
          'image_url': data[i].sender.profile_image_url,
          'owner': 'app--message',
          'created_at': data[i].created_at,
          'created_at_unix': tweetTimestamp.unix(),
          'created_at_humanized': tweetTimestamp.fromNow()
        });
      }
    }
    next();
  });
}

/**
 * Get the 5 latest messages that we have sent to other people
 * @param req
 * @param res
 * @param next
 */
function userReceivedMessages(req, res, next){
  twitter.get('direct_messages/sent', {screen_name: username, count: '5'}, function(error, data, response){
    if (!error) {
      for (var i = 0; i < data.length; i++) {
        tweetTimestamp = moment(data[i].created_at, 'dd MMM DD HH:mm:ss ZZ YYYY', 'en');
        twitterDetails['messages'].push({
          'text': data[i].text,
          'name': data[i].sender.name,
          'screen_name': data[i].sender.screen_name,
          'image_url': data[i].sender.profile_image_url,
          'owner': 'app--message--me',
          'created_at': data[i].created_at,
          'created_at_unix': tweetTimestamp.unix(),
          'created_at_humanized': tweetTimestamp.fromNow()
        });
      }
    }
    next();
  });
}

/**
 * With all the loaded into our global variable twitterDetails, we can load the page
 * But first we want to sort the messages by when they were created, mixing up the messages that were sent to the user
 * as well as messages sent by the user
 * @param req
 * @param res
 * @param next
 */
function loadPage( req, res, next) {
  sortByKey(twitterDetails.messages,'created_at_unix');
  res.render('index', twitterDetails);
}

/**
 * Given a key, sort an array of arrays, based on a certain key
 * @param array
 * @param key
 * @returns {Array.<T>}
 */
function sortByKey(array, key) {
  return array.sort(function(a, b) {
    var x = a[key]; var y = b[key];
    return ((x > y) ? -1 : ((x < y) ? 1 : 0));
  });
}

//Log whether
var error = function (err, response, body) {
  console.log('ERROR [%s]', err);
};

var success = function (data) {
  console.log('Data [%s]', data);
};


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');

});

module.exports = app;
