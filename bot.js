var fs = require('fs'),
    path = require('path'),
    Twit = require('twit'),
    Morse = require('morse-node'),
    moment = require('moment-timezone'),
    async = require('async'),
    config = require(path.join(__dirname, 'config.js')),
    messages = require(path.join(__dirname, 'messageConfig.json'));

moment().tz("America/Chicago").format();
moment.tz.setDefault("America/Chicago");

config.consumer_secret = process.env.consumer_secret;
config.access_token_secret = process.env.access_token_secret;

var processInterval = /*60 * 60 **/ 1000; // minutes, seconds, milliseconds
var morse = Morse.create('ITU');
var lastPosted;
var twit;

if (config.consumer_secret && config.access_token_secret) {
    twit = new Twit(config);
}

console.log("Bot started, interval is currently " + processInterval + "ms");
console.log("The current time is " + moment().format());
console.log("The post delay is " + messages.repeatingMessages.repeatDelayInSeconds);

var run = function() {
    async.waterfall([
        processRepeatingMessages,
        processOneTimeMessages
    ],
    function(err, result) {
        if (err) {
            console.log("There was an error processing messages: " + err);
        } else {
            console.log("Messages processed successfully");
        }
    });
}

var processRepeatingMessages = function(cb) {
    var postDelay = messages.repeatingMessages.repeatDelayInSeconds * 1000;
    var lastPosted = moment(messages.repeatingMessages.lastPosted);
    var sinceLastMessage = moment() - lastPosted;

    console.log("Since last message was posted " + sinceLastMessage + "ms");
    console.log("Post delay is " + postDelay + "ms");

    if (sinceLastMessage > postDelay) {
        var index = Math.round(Math.random() * messages.repeatingMessages.messages.length);

        console.log("Retrieving message " + index + " of " +
            messages.repeatingMessages.messages.length);

        var message = morse.encode(messages.repeatingMessages.messages[index - 1]);

        console.log("Converted message to " + message.length + " long morse code.");
        console.log(message);

        postMessageToConsole(message, function(err, botData) {
            if (err) {
                console.log("There was an error posting the message: ", err);
                cb(err);
            } else {
                messages.repeatingMessages.lastPosted = moment().format();
                console.log("Message posted successfully: " + botData);
                console.log("Last message posted at " + messages.repeatingMessages.lastPosted);

                fs.writeFile(path.join(__dirname, 'messageConfig.json'), JSON.stringify(messages, null, 2),
                    function(err) {
                        if (err) {
                            console.log("Error when saving the messages file: " + err);
                        }

                        cb(null);
                    });
            }
        });
    } else {
        cb();
    }
}

var processOneTimeMessages = function(cb) {
    console.log("Processing one time messags.");
    cb(null);
}

var postMessageToTwitter = function(message, cb) {
    twit.post('statuses/update', { status: message },
        function(err, data, response) {
            cb(err, data);
        });
}

var postMessageToConsole = function(message, cb) {
    console.log("Outputting message to the console.\n\n" + message + "\n");
    cb();
}

setInterval(function() {
    try {
        run();
    } catch (e) {
        console.log(e);
    }
}, processInterval);
