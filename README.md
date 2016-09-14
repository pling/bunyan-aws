# bunyan-aws
Write buynan logs to Amazon Web Services CloudWatch.

## Install
`npm install bunyan-aws --save`

## Usage
````
var bunyan = require('bunyan');
var os = require('os');
var CloudWatchStream = require('bunyan-aws');
var myStream = new CloudWatchStream({
           logGroupName: 'MyApplicationLogs',
           logStreamName: 'MyStream-' + os.hostname(),
           cloudWatchOptions: {
               region: 'eu-central-1',
               sslEnabled: true
           }
       });
       
var log = bunyan.createLogger({
    name: 'logger',
    streams: [{
        stream: myStream,
        type: 'raw',
        level: 'info',
    }]
};       
       
````

## Configuration

### AWS Credentials
This package uses the AWS SDK to write the logs to CloudWatch. You must
set the AWS Credentials via one of the first three methods described here:
http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html

### Log Group
The log group must exist in CloudWatch. 
1) Sign into the AWS console
2) Click on CloudWatch found under Services > Management
3) Click on Logs
4) Select Actions > Create log group

### Log Stream
You may use an existing log stream. However if the stream is not found,
it will be created for you. The package assumes it is the only source
writing to the stream. Errors will occur if other sources write to the
same stream.

### CloudWatch Options
These options are passed directly to the AWS SDK:
http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#constructor-property
