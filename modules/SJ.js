'use strict';

// Example response
/*
data({
    "version":"1.6",
    "ip":"10.101.5.100",
    "mac":"00:05:69:4B:74:59",
    "online":"0",
    "timeleft":"0",
    "authenticated":"1",
    "userclass":"2",
    "expires":"Never",
    "timeused":"175",
    "data_download_used":"131427344",
    "data_upload_used":"745893",
    "data_total_used":"132173237",
    "data_download_limit":"0",
    "data_upload_limit":"0",
    "data_total_limit":"209715200",
    "bandwidth_download_limit":"0",
    "bandwidth_upload_limit":"0"
});
*/

var request = require( 'request' );
var log = require( '../index.js' );

module.exports = {
    ssid: 'SJ',
    percentageLimit: 95,
    quotaFails: 0,
    quotaFailLimit: 5,
    shouldRefresh: function( callback ){
        var percentage,
            _this = this;

        request( 'http://www.ombord.info/api/jsonp/user/?callback=data&_' + Date.now(), function( error, response, data ){
            var retriesRemaining;

            if( error || response.statusCode !== 200 ){
                _this.quotaFails = _this.quotaFails + 1;
                retriesRemaining = _this.quotaFailLimit - _this.quotaFails;

                if( retriesRemaining <= 0 ){
                    callback( new Error( 'Failed to load quota. Tried ' + _this.quotaFails + ' times without success' ), null );
                    return false;
                } else {
                    log( 'Unable to load quota. Tries remaining: ' + retriesRemaining );
                    return false;
                }
            }

            // Got quota, let's reset the fail counter
            _this.quotaFails = 0;

            // Make sure there is no newlines or spaces or anything
            data = data.trim();

            // Strip the JSONP stuff, we don't need it
            data = data.substr( 5 ); // Strip "data("

            // Sometimes it might have a final ";"
            // If it does, strip that and the final ")"
            if( data.substr( -1 ) === ';' ){
                data = data.substr( 0, data.length - 2 );
            } else {
                data = data.substr( 0, data.length - 1 );
            }

            // Should be raw JSON now
            data = JSON.parse( data );

            // Get the percentage used
            percentage = Math.round( data.data_total_used / data.data_total_limit * 100 );

            if( percentage >= _this.percentageLimit ){
                callback( null, {
                    doRefresh: true,
                    percentUsed: percentage
                });
            } else {
                callback( null, {
                    doRefresh: false,
                    percentUsed: percentage
                });
            }
        });
    }
};
