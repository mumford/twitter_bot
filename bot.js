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

        twit.post('statuses/update', { status: message },
            function(err, data, response) {
                console.log(data);
                lastPosted = moment();
                console.log("Last message posted at " + lastPosted.format());
            });
    }
} 

setInterval(function() {   
    try {
        run();
    } catch (e) {
        console.log(e);
    }
}, 60000*60);

/*
var message = morse.encode("Testing out morse node");

console.log("Message length is " + message.length + " characters.");

if (message.length <= 140) {
    console.log(message);
} else {
    console.log("Message length exceeds allowable limit.");
}
*/

/*
twit.post('statuses/update', { status: '.. / .- -- / ... - .. .-.. .-.. / .... . .-. .' },
    function(err, data, response) {
        console.log(data);}
    );
*/