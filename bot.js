var TwitterBot = require('./twitterBot.js'),
    path = require('path'),
    config = require(path.join(__dirname, 'config.js'));

var isInProductionMode = process.env.ENVIRONMENT === 'production';
var options = {
    "aws":{
        "region": config.awsRegion,
        "s3Bucket": config.s3Bucket,
        "s3BucketKey": isInProductionMode ? 'messageConfig.json' : 'messageConfig_test.json'
    }
}


var twitterBot = new TwitterBot(options);

twitterBot.start();