var fs = require('fs'),
    path = require('path'),
    Twit = require('twit'),
    Morse = require('morse-node'),
    moment = require('moment'),
    config = require(path.join(__dirname, 'config.js')),
    messages = require(path.join(__dirname, 'messageConfig.json'));

moment().format();

config.consumer_secret = process.env.consumer_secret;
config.access_token_secret = process.env.access_token_secret;

var processInterval = 1 * 60 * 1000; // minutes, seconds, milliseconds
var twit = new Twit(config);
var morse = Morse.create('ITU');
var lastPosted;

var run = function() {
    var postTimeToday = moment(messages.repeatingMessages.postTime, "HH:mm:ss");
    console.log("Today's post time is " + postTimeToday.format());    

    if (!lastPosted ){
        //|| (lastPosted.dayOfYear() < moment().dayOfYear()         
        //&& postTimeToday.isBefore(moment()))) {
        var index = Math.round(Math.random() * messages.repeatingMessages.messages.length);

        console.log("Retrieving message " + index + " of " +
            messages.repeatingMessages.messages.length);

        var message = morse.encode(messages.repeatingMessages.messages[index - 1]);

        console.log("Converted message to " + message.length + " long morse code.");
        console.log(message);

        postMessage(message, function(err, botData) {
            if (err) {
                console.log("There was an error posting the message: ", err);
            } else {                
                lastPosted = moment();
                console.log("Message posted successfully: " + botData);
                console.log("Last message posted at " + lastPosted.format());
            }
        })
    }
}

var postMessage = function(message, cb) {
    twit.post('statuses/update', { status: message },
        function(err, data, response) {
            cb(err, data);
        });
}

setInterval(function() {   
    console.log("App started, interval set.");
    try {
        run();
    } catch (e) {
        console.log(e);
    }
}, processInterval);