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
        "consumer_key":       'sticymoTj9cKszaTWQQGrr4Rm',    
        "access_token":       '768806591004971008-SZceIh62F8wmLyOtPuLMfFbAoqmngtC',
    },
    "devTwitter": {
        "consumer_key": 'GamvDFVX1YG0LiXTMZUi86XCF',
        "access_token": '16392326-XXu64KhY1TWOpxPeXI5SJmXDP0oxcHUXcHc6YDjqo'        
    }
}

module.exports = config;