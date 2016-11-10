var path = require('path'),
    Twit = require('twit'),
    Morse = require('morse-node'),
    moment = require('moment-timezone'),
    async = require('async'),
    aws = require('aws-sdk');

function TwitterBot(options) {
    
    this.options = options;
    
    var that = this;
    var dateFormat = 'dddd, MMMM Do YYYY, h:mm a';
    
    this.twit;    
    this.morse = Morse.create('ITU');
    this.s3Bucket;
    this.messages = '';
    
    initializeMoment();
    initializeTwit();
    initializeAws();

    this.runBot = function() {
        downloadMessages(function() {       
            // Output some useful information
            logMessage("Bot started, interval is currently " + that.options.defaultLoopTimeInSeconds + "s");
            logMessage("The current time is " + moment().format(dateFormat));
            logMessage("The post delay is " + that.messages.repeatingMessages.repeatDelayInSeconds + "s");

            runStream();

            // And run the loop to watch for messages
            logMessage("Starting up the loop, using default timeout: " + that.options.defaultLoopTimeInSeconds + "s");
            runLoop(that.options.defaultLoopTimeInSeconds);
        });
    }

    function runStream() {
        if (!that.messages.messageMonitor.isEnabled) {
            logMessage('The message monitor is not enabled.');
            return;
        }

        logMessage('Starting up the Twitter stream client. Watching for "' + that.messages.messageMonitor.keyPhrase + '"');
        var stream = that.twit.stream('statuses/filter', { follow: that.messages.messageMonitor.allowedUsers.join(',')});

        stream.on('tweet', function(tweet) {
            processTweet(tweet, function(scrambleStopped) {
                if (scrambleStopped) {
                    stream.stop();
                }
            });
        });
    }

    function processTweet(tweet, cb) {        
        if (tweet.text.toUpperCase().includes(that.messages.messageMonitor.keyPhrase.toUpperCase())) {
            logMessage('\n@' + tweet.user.screen_name + ' just posted the key phrase.\n\n' + tweet.text);

            that.messages.repeatingMessages.scrambleMessages = false;
            that.messages.messageMonitor.isEnabled = false;

            uploadMessages(function() {
                logMessage('Messages uploaded after getting magic phrase.');
                cb(true);
            });
        } else {
            logMessage('Received a message, but it didn\'t match the magic phrase.');
            // Bump the failed message count
            var monitor = that.messages.messageMonitor;

            monitor.failureCount++;

            var failureState;                

            for (var i = 0; i < monitor.failureStates.length; i++) {
                if (monitor.failureStates[i].minimumFailures <= monitor.failureCount && monitor.failureStates[i].maximumFailures >= monitor.failureCount) {
                    failureState = monitor.failureStates[i];
                    break;
                }
            }

            if (failureState) {
                var messages = [];

                for (var i = 0; i < failureState.messages.length; i++) {
                    if (!failureState.messages[i].isPosted) {
                        messages.push(failureState.messages[i]);
                    }
                }

                var index = messages.length > 1 ? Math.round(Math.random() * messages.length) - 1 : 0;
                logMessage('We have ' + messages.length + ' messages and will use message ' + index + '.');
                postMessage(messages[index].text, function(err, data) {
                    messages[index].isPosted = true;
                    uploadMessages(function() {
                        logMessage('Uploaded messages after posting a failure state.');
                        cb(false);
                    })
                });
            } else {
                cb(false);
            }
        }        
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

            var difference = moment(result - moment());
            logMessage("The next post will occur " + result.calendar() + ", " + result.fromNow());
            
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
        moment().tz(that.options.timezone).format();
        moment.tz.setDefault(that.options.timezone);

        logMessage("Moment configured.\n\tCurrent time is: " + moment().format(dateFormat) + "\n\tDefault timezone: " + that.options.timezone);
    }

    function initializeTwit() {
        //if (isInProductionMode()) {
        //    logMessage("Running in production mode, initializing twit.");

            // Configure Twit so we can post
            var twitterConfig = that.options.twitter;
            twitterConfig.consumer_secret = process.env.consumer_secret;
            twitterConfig.access_token_secret = process.env.access_token_secret;

            that.twit = new Twit(that.options.twitter);
        //}
    }

    function initializeAws() {
        var key = isInProductionMode() ? that.options.aws.key : that.options.aws.devKey; 
        logMessage("Initializing AWS and S3.\n\tRegion: " + that.options.aws.region + 
            "\n\tBucket: " + that.options.aws.bucket + "\n\tKey: " + key);

        // Configure the AWS service
        aws.config.region = that.options.aws.region;
        that.s3Bucket = new aws.S3({params:{Bucket: that.options.aws.bucket, Key: key}});
    }

    function isInProductionMode() {
        return process.env.ENVIRONMENT === 'production';
    }

    function downloadMessages(cb) {
        if (isInProductionMode()) {
            var messageData = '';

            logMessage("Attempting to download messages.")

            that.s3Bucket.getObject()
                .on('httpData', function(chunk) {
                    messageData += chunk;             
                })
                .on('httpDone', function() {
                    logMessage("EOF reached, messages downloaded.");
                    that.messages = JSON.parse(messageData);
                    cb(); 
                })
                .send();
        } else {
            logMessage("Loading messages from local file.");
            that.messages = require(path.join(__dirname, "messageConfig_test.json"));
            cb();
        }
    }

    function uploadMessages(cb) {
        if (!isInProductionMode()) {
            logMessage('Skipping the message upload since we are not in production.');
            cb();
        } else {
            that.s3Bucket.upload({Body: JSON.stringify(that.messages, null, 3)})
                .on('httpUploadProgress', function(evt) { logMessage(evt); })
                .send(function(err, data) {
                    if (err) {
                        logMessage("Ran into an issue uploading the messages: " + err);
                    } else {
                        logMessage("Messages uploaded.");
                        cb();
                    }
            });
        }
    }

    function processRepeatingMessages(cb) {
        var postDelay = that.messages.repeatingMessages.repeatDelayInSeconds * 1000;
        var lastPosted = moment(that.messages.repeatingMessages.lastPosted);
        var sinceLastMessage = moment() - lastPosted;

        logMessage("Since last message was posted " + (sinceLastMessage / 1000) + "s");
        logMessage("Post delay is " + (postDelay / 1000) + "s");

        if (sinceLastMessage > postDelay) {
            var index = Math.round(Math.random() * that.messages.repeatingMessages.messages.length);

            logMessage("Retrieving message " + index + " of " +
                that.messages.repeatingMessages.messages.length);

            var message = that.messages.repeatingMessages.messages[index - 1];

            logMessage('Preparing to send a message:\n\n' + message + '\n\n');

            if (that.messages.repeatingMessages.scrambleMessages) {
                message = scrambleText(message);
                logMessage('Message scrambled:\n\n' + message + '\n\n');
            }

            message = that.morse.encode(message);

            logMessage("Converted message to " + message.length + " long morse code.");

            postMessage(message, function(err, botData) {
                if (err) {
                    logMessage("There was an error posting the message: ", err);
                    cb(err);
                } else {
                    that.messages.repeatingMessages.lastPosted = moment().format();
                    logMessage("Message posted successfully: " + botData);
                    logMessage("Last message posted at " + that.messages.repeatingMessages.lastPosted);

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
        var lastPosted = moment(that.messages.repeatingMessages.lastPosted);
        lastPosted.add(that.messages.repeatingMessages.repeatDelayInSeconds, "seconds");

        logMessage("Next repeating post will be at: " + lastPosted.format(dateFormat));

        return lastPosted;
    }

    function processOneTimeMessages(nextScheduledPost, cb) {
        logMessage("Processing one time messages.");

        async.each(that.messages.oneTimeMessages, function(oneTimeMessage, messageDone) {
            if (!oneTimeMessage.isPosted && moment().isAfter(moment(oneTimeMessage.postDate))) {
                logMessage("Sending this message: " + oneTimeMessage.message);

                var message = oneTimeMessage.encode 
                    ? that.morse.encode(oneTimeMessage.message)
                    : oneTimeMessage.message;                

                async.each(oneTimeMessage.recipients, function(recipient, recipientDone) {
                    var tweet = "." + recipient + " " + message;
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
                if (nextOneTimePost && nextOneTimePost.isBefore(nextScheduledPost)) {
                    cb(null, nextOneTimePost);
                } else {
                    cb(null, nextScheduledPost);
                }
            });
        });
    }

    function findNextOneTimeMessage(cb) {
        var nextPost;
        async.each(that.messages.oneTimeMessages, function(oneTimeMessage, done) {
            var messageDate = moment(oneTimeMessage.postDate);

            if (messageDate.isAfter(moment()) &&
                (!nextPost || nextPost.isAfter(messageDate))) {
                nextPost = messageDate;
            }
            done();        
        }, function() {
			if (nextPost) {
				logMessage("The next one time message will be posted at: " + nextPost.format(dateFormat));
            } else {
				logMessage("There are no upcoming one time messages.");
			}
			
			cb(nextPost);			
        });
    }

    function postMessage(message, cb) {
        if (!isInProductionMode()) {
            logMessage("Outputting message to the console.\n\n" + message + "\n");
            cb();
        } else {
            that.twit.post('statuses/update', { status: message },
                function(err, data, response) {
                    cb(err, data);
                });
        }
    }

    function logMessage(message) {
        console.log(message);
    }

    function scrambleText(text) {
        logMessage('The chance to scramble messages is ' + that.messages.repeatingMessages.scrambleChance);

        var randomChance = Math.random();

        if (randomChance > that.messages.repeatingMessages.scrambleChance) {
            logMessage('We rolled a ' + randomChance + ', so we won\'t scramble the message');
            return text;
        }

        logMessage('We rolled a ' + randomChance + ', so we will scramble the message');

        var characters = text.split('');
            textLength = characters.length;

        for (var i = textLength - 1; i > 0; i--) {
            var x = Math.floor(Math.random() * (i + 1));
            var temp = characters[i];
            characters[i] = characters[x];
            characters[x] = temp;
        }

        return characters.join(''); 
    }
}

TwitterBot.prototype.start = function() {
    console.log("Starting the twitter bot.");
    this.runBot();
}

module.exports = TwitterBot;