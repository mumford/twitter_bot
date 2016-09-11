var fs = require('fs'),
    path = require('path'),
    Twit = require('twit'),
    Morse = require('morse-node'),
    moment = require('moment-timezone'),
    async = require('async'),
    aws = require('aws-sdk'),
    config = require(path.join(__dirname, 'config.js'))

module.exports = TwitterBot;

function TwitterBot(options) {
    
    this.options = options;
    
    var that = this;
    var morse = Morse.create('ITU');
    var twit;
    var s3Bucket;
    var messages = '';
    
    initializeMoment();
    initializeTwit();
    initializeAws();

    this.runBot = function() {
        downloadMessages(function() {       
            // Output some useful information
            logMessage("Bot started, interval is currently " + config.defaultLoopTimeInSeconds + "s");
            logMessage("The current time is " + moment().format());
            logMessage("The post delay is " + messages.repeatingMessages.repeatDelayInSeconds + "s");

            // And run the loop to watch for messages
            logMessage("Starting up the loop, using default timeout: " + config.defaultLoopTimeInSeconds + "s");
            runLoop(config.defaultLoopTimeInSeconds);
        });
    }

    function run(cb) {
        async.waterfall([
            processRepeatingMessages,
            processOneTimeMessages
        ],
        function(err, result) {
            if (err) {
                logMessage("There was an error processing messages: " + err);
            } else {
                logMessage("Messages processed successfully");
            }

            var difference = result - moment();
            logMessage("The next post will occur at: " + result.format() + "\nIn " + difference / 1000 + "s");
            
            cb(difference / 1000);
        });
    }

    function runLoop(loopTimeoutInSeconds) {
        setTimeout(function() {
            try {
                run(function(timeout) {
                    runLoop(timeout);
                });
            } catch (e) {
                logMessage(e);
            }        
        }, loopTimeoutInSeconds * 1000);
    }

    function initializeMoment() {
        // Configure moment with the timezone we want to use
        moment().tz(config.timezone).format();
        moment.tz.setDefault(config.timezone);

        logMessage("Moment configured.\n\tCurrent time is: " + moment().format() + "\n\tDefault timezone: " + config.timezone);
    }

    function initializeTwit() {
        if (isInProductionMode()) {
            logMessage("Running in production mode, initializing twit.");
            // Configure Twit so we can post
            config.consumer_secret = process.env.consumer_secret;
            config.access_token_secret = process.env.access_token_secret;

            twit = new Twit(config);
        }
    }

    function initializeAws() {
        logMessage("Initializing AWS and S3.\n\tRegion: " + that.options.aws.region + 
            "\n\tBucket: " + that.options.aws.s3Bucket + "\n\tKey: " + that.options.aws.s3BucketKey);

        // Configure the AWS service
        aws.config.region = that.options.aws.region;
        s3Bucket = new aws.S3({params:{Bucket: that.options.aws.s3Bucket, Key: that.options.aws.s3BucketKey}});
    }

    function isInProductionMode() {
        return process.env.ENVIRONMENT === 'production';
    }

    function logMessage(message) {
        console.log(message);
    }

    function downloadMessages(cb) {
        var messageData = '';

        logMessage("Attempting to download messages.")

        s3Bucket.getObject()
            .on('httpData', function(chunk) {
                messageData += chunk;             
            })
            .on('httpDone', function() {
                logMessage("EOF reached, messages downloaded.");
                messages = JSON.parse(messageData);
                cb(); 
            })
            .send();
    }

    function uploadMessages(cb) {
        s3Bucket.upload({Body: JSON.stringify(messages, null, 3)})
            .on('httpUploadProgress', function(evt) { logMessage(evt); })
            .send(function(err, data) {
                if (err) {
                    logMessage("Ran into an issue uploading the messages: " + err);
                } else {
                    logMessage("Messages uploaded.");
                    cb();
                }
            })
    }

    function processRepeatingMessages(cb) {
        var postDelay = messages.repeatingMessages.repeatDelayInSeconds * 1000;
        var lastPosted = moment(messages.repeatingMessages.lastPosted);
        var sinceLastMessage = moment() - lastPosted;

        logMessage("Since last message was posted " + (sinceLastMessage / 1000) + "s");
        logMessage("Post delay is " + (postDelay / 1000) + "s");

        if (sinceLastMessage > postDelay) {
            var index = Math.round(Math.random() * messages.repeatingMessages.messages.length);

            logMessage("Retrieving message " + index + " of " +
                messages.repeatingMessages.messages.length);

            var message = morse.encode(messages.repeatingMessages.messages[index - 1]);

            logMessage("Converted message to " + message.length + " long morse code.");
            logMessage(message);

            postMessage(message, function(err, botData) {
                if (err) {
                    logMessage("There was an error posting the message: ", err);
                    cb(err);
                } else {
                    messages.repeatingMessages.lastPosted = moment().format();
                    logMessage("Message posted successfully: " + botData);
                    logMessage("Last message posted at " + messages.repeatingMessages.lastPosted);

                    uploadMessages(function() {
                        cb(null, calculateNextRepeatingPostTime());
                    });
                }
            });
        } else {
            cb(null, calculateNextRepeatingPostTime());
        }
    }

    function calculateNextRepeatingPostTime() {
        var lastPosted = moment(messages.repeatingMessages.lastPosted);
        lastPosted.add(messages.repeatingMessages.repeatDelayInSeconds, "seconds");

        logMessage("Next repeating post will be at: " + lastPosted.format());

        return lastPosted;
    }

    function processOneTimeMessages(nextScheduledPost, cb) {
        logMessage("Processing one time messages.");

        async.each(messages.oneTimeMessages, function(oneTimeMessage, messageDone) {
            if (!oneTimeMessage.isPosted && moment().isAfter(moment(oneTimeMessage.postDate))) {
                logMessage("Sending this message: " + oneTimeMessage.message);

                var message = oneTimeMessage.encode 
                    ? morse.encode(oneTimeMessage.message)
                    : oneTimeMessage.message;

                async.each(oneTimeMessage.recipients, function(recipient, recipientDone) {
                    var tweet = recipient + " " + message;
                    postMessage(tweet, function(err) {
                        if (!err) {
                            oneTimeMessage.isPosted = true;                         
                        }
                        
                        recipientDone(err);                    
                    });
                }, 
                function(err) {
                    if (err) {
                        logMessage("Error during one time message processing: " + err);
                    } 

                    uploadMessages(messageDone);
                });
            } else {
                messageDone();
            }        
        }, function() {
            logMessage("Processed one time messages, finding the next time one will be posted.");
            findNextOneTimeMessage(function(nextOneTimePost) {
                if (nextOneTimePost.isBefore(nextScheduledPost)) {
                    cb(null, nextOneTimePost);
                } else {
                    cb(null, nextScheduledPost);
                }
            });
        });
    }

    function findNextOneTimeMessage(cb) {
        var nextPost;
        async.each(messages.oneTimeMessages, function(oneTimeMessage, done) {
            var messageDate = moment(oneTimeMessage.postDate);

            if (messageDate.isAfter(moment()) &&
                (!nextPost || nextPost.isAfter(messageDate))) {
                nextPost = messageDate;
            }
            done();        
        }, function() {
            logMessage("The next one time message will be posted at: " + nextPost.format());
            cb(nextPost);
        });
    }

    function postMessage(message, cb) {
        if (!isInProductionMode()) {
            logMessage("Outputting message to the console.\n\n" + message + "\n");
            cb();
        } else {
            twit.post('statuses/update', { status: message },
                function(err, data, response) {
                    cb(err, data);
                });
        }
    }
}

TwitterBot.prototype.start = function() {
    console.log("Starting the twitter bot.");
    this.runBot();
}

