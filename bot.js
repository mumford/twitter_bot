var fs = require('fs'),
    path = require('path'),
    Twit = require('twit'),
    Morse = require('morse-node'),
    moment = require('moment-timezone'),
    async = require('async'),
    config = require(path.join(__dirname, 'config.js')),
    messages = require(path.join(__dirname, 'messageConfig.json'));

var morse = Morse.create('ITU');
var twit;

// Configure moment with the timezone we want to use
moment().tz(config.timezone).format();
moment.tz.setDefault(config.timezone);

if (!config.inDevelopmentMode) {
    // Configure Twit so we can post
    config.consumer_secret = process.env.consumer_secret;
    config.access_token_secret = process.env.access_token_secret;

    twit = new Twit(config);
}

// Output some useful information
console.log("Bot started, interval is currently " + config.defaultLoopTimeInSeconds + "s");
console.log("The current time is " + moment().format());
console.log("The post delay is " + messages.repeatingMessages.repeatDelayInSeconds + "s");

var run = function(cb) {
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

        var difference = result - moment();
        console.log("The next post will occur at: " + result.format() + "\nIn " + difference / 1000 + "s");
        
        cb(difference / 1000);
    });
}

var processRepeatingMessages = function(cb) {
    var postDelay = messages.repeatingMessages.repeatDelayInSeconds * 1000;
    var lastPosted = moment(messages.repeatingMessages.lastPosted);
    var sinceLastMessage = moment() - lastPosted;

    console.log("Since last message was posted " + (sinceLastMessage / 1000) + "s");
    console.log("Post delay is " + (postDelay / 1000) + "s");

    if (sinceLastMessage > postDelay) {
        var index = Math.round(Math.random() * messages.repeatingMessages.messages.length);

        console.log("Retrieving message " + index + " of " +
            messages.repeatingMessages.messages.length);

        var message = morse.encode(messages.repeatingMessages.messages[index - 1]);

        console.log("Converted message to " + message.length + " long morse code.");
        console.log(message);

        postMessage(message, function(err, botData) {
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

                        cb(null, calculateNextRepeatingPostTime());
                    });
            }
        });
    } else {
        cb(null, calculateNextRepeatingPostTime());
    }
}

var calculateNextRepeatingPostTime = function() {
    var lastPosted = moment(messages.repeatingMessages.lastPosted);
    lastPosted.add(messages.repeatingMessages.repeatDelayInSeconds, "seconds");

    console.log("Next repeating post will be at: " + lastPosted.format());

    return lastPosted;
}

var processOneTimeMessages = function(nextScheduledPost, cb) {
    console.log("Processing one time messages.");

    async.each(messages.oneTimeMessages, function(oneTimeMessage, messageDone) {
        if (!oneTimeMessage.isPosted && moment().isAfter(moment(oneTimeMessage.postDate))) {
            console.log("Sending this message: " + oneTimeMessage.message);

            var message = oneTimeMessage.encode 
                ? morse.encode(oneTimeMessage.message)
                : oneTimeMessage.message;

            async.each(oneTimeMessage.recipients, function(recipient, recipientDone) {
                var tweet = recipient + " " + message;
                postMessage(tweet, function(err) {
                    if (!err) {
                        oneTimeMessage.isPosted = true;
                        fs.writeFile(path.join(__dirname, 'messageConfig.json'), JSON.stringify(messages, null, 2),
                            function(err) {
                                if (err) {
                                    console.log("Error when saving the messages file: " + err);
                                }

                                recipientDone();
                            });
                    } else {
                        recipientDone(err);
                    }
                });
            }, 
            function(err) {
                if (err) {
                    console.log("Error during one time message processing: " + err);
                }

                messageDone();
            });
        } else {
            messageDone();
        }        
    }, function() {
        console.log("Processed one time messages, finding the next time one will be posted.");
        findNextOneTimeMessage(function(nextOneTimePost) {
            if (nextOneTimePost.isBefore(nextScheduledPost)) {
                cb(null, nextOneTimePost);
            } else {
                cb(null, nextScheduledPost);
            }
        });
    });
}

var findNextOneTimeMessage = function(cb) {
    var nextPost;
    async.each(messages.oneTimeMessages, function(oneTimeMessage, done) {
        var messageDate = moment(oneTimeMessage.postDate);

        if (messageDate.isAfter(moment()) &&
            (!nextPost || nextPost.isAfter(messageDate))) {
            nextPost = messageDate;
        }
        done();        
    }, function() {
        console.log("The next one time message will be posted at: " + nextPost.format());
        cb(nextPost);
    });
}

var postMessage = function(message, cb) {
    if (config.inDevelopmentMode) {
        console.log("Outputting message to the console.\n\n" + message + "\n");
        cb();
    } else {
        twit.post('statuses/update', { status: message },
            function(err, data, response) {
                cb(err, data);
            });
    }
}

var runLoop = function(loopTimeoutInSeconds) {
    setTimeout(function() {
        try {
            run(function(timeout) {
                runLoop(timeout);
            });
        } catch (e) {
            console.log(e);
        }        
    }, loopTimeoutInSeconds * 1000);
}

// And run the loop to watch for messages
console.log("Starting up the loop, using default timeout: " + config.defaultLoopTimeInSeconds + "s");
runLoop(config.defaultLoopTimeInSeconds);