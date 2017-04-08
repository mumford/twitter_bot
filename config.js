var config = {
    "timezone":           'America/Chicago',
    "defaultLoopTimeInSeconds":    1,
    "aws": {
        "region": "us-east-1",
        "bucket": "is-twitter-bot",
        "key": "messageConfig.json",
        "devKey": "messageConfig_test.json"
    },
    "twitter": {
        "consumer_key": 'sticymoTj9cKszaTWQQGrr4Rm',    
        "access_token": '768806591004971008-SZceIh62F8wmLyOtPuLMfFbAoqmngtC',
    },
    "devTwitter": {
        "consumer_key": 'xab8RYIa9SpybDEtCQ4rx8EaJ',
        "access_token": '850526529671106560-kf55azGmLmDDuiG3T8xr8XXwKUISgHg'        
    }
}

module.exports = config;