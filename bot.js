var TwitterBot = require('./twitterBot.js'),
    path = require('path'),
    config = require(path.join(__dirname, 'config.js'));

var twitterBot = new TwitterBot(config);

twitterBot.start();