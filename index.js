'use strict';

var AWS = require('aws-sdk'),
    EventEmitter = require('events'),
    async = require('async');

module.exports = class CloudWatchStream extends EventEmitter {
    constructor (options) {
        super();

        this._buffer = [];
        this._bufferLength = options.bufferLength > 0 ? options.bufferLength : 500; // Buffer 500 records
        this._timeout = options.timeout > 0 ? options.timeout : 1000; // Empty buffer after 1 second
        this._logGroupName = options.logGroupName;
        this._logStreamName = options.logStreamName;
        this._cloudWatchLogs = new AWS.CloudWatchLogs(options.cloudWatchOptions);
        this._sequenceToken = null;
        this._timeoutId = null;
        this._posting = false;
    }

    write (record) {
        if (typeof record !== 'object') {
            throw new Error('bunyan-aws requires a raw stream. Please define the type as raw when setting up the bunyan stream.');
        }

        this._buffer.push(record);
        this._checkBuffer();
    }

    _checkBuffer () {
        var that = this;

        if (this._buffer.length === 0) {
            return;
        }

        if (this._buffer.length >= this._bufferLength) {
            this._processBuffer();
        }

        if (this._timeoutId) {
            return;
        }

        this._timeoutId = setTimeout(function () { that._processBuffer(); }, this._timeout);
    }

    _clearTimeout () {
        if (!this._timeoutId) {
            return;
        }

        clearTimeout(this._timeoutId);
        this._timeoutId = null;
    }

    _processBuffer () {
        var that = this,
            records = this._buffer;

        this._buffer = [];

        that._clearTimeout();

        async.series([
                function (callback) { that._getSequenceToken(callback) },
                function (callback) { that._postLogEvents(records, callback); }
            ],
            function (error) {
                if (!error) {
                    return;
                }

                that.emit('error', error);
            });
    }

    _getSequenceToken (callback) {
        var that = this;

        if (that._sequenceToken) {
            callback(null, that._sequenceToken);
            return;
        }

        this._cloudWatchLogs.describeLogStreams(
            {logGroupName: this._logGroupName, logStreamNamePrefix: this._logStreamName},
            function (error, data) {
                var stream = null;

                if (error) {
                    callback(error);
                    return;
                }

                data.logStreams.forEach(function (logStream) {
                    if (logStream.logStreamName === that._logStreamName) {
                        stream = logStream;
                    }
                });

                if (!stream) {
                    that._createLogStream(callback);
                    return;
                }

                that._sequenceToken = stream.uploadSequenceToken || null;
                callback(null, that._sequenceToken);
            });
    }

    _createLogStream (callback) {
        var that = this,
            params = {
                logGroupName: this._logGroupName,
                logStreamName: this._logStreamName
            };

        this._cloudWatchLogs.createLogStream(params, function(err, data) {
            if (data) {
                that._sequenceToken = null;
            }

            callback(err, data);
        });
    }

    _postLogEvents (records, callback) {
        var that = this,
            params = {
                logGroupName: this._logGroupName,
                logStreamName: this._logStreamName,
                sequenceToken: this._sequenceToken,
                logEvents: records.map(this._buildLogEvent)
            },
            attempts = 0;

        function postLogEvents () {
            params.sequenceToken = that._sequenceToken;

            if (that._posting) {
                setTimeout(postLogEvents, 100);
                return;
            }

            that._posting = true;

            that._cloudWatchLogs.putLogEvents(params, function (error, data) {
                that._posting = false;
                if (error) {
                    if (error.retryable && attempts++ < 5) {
                        setTimeout(postLogEvents, 100);
                    } else {
                        callback(error);
                    }
                } else {
                    that._sequenceToken = data.nextSequenceToken;

                    callback();
                }
            });
        }

        postLogEvents();
    }

    _buildLogEvent (record) {
        return {
            message: JSON.stringify(record, function (key, value) {
                    if (key === 'time' || key === 'v') {
                        return undefined;
                    }
                    return value;
                }),
            timestamp: new Date(record.time).getTime()
        }
    }
};
