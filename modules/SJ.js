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

module.exports = {
    network: 'SJ',
    percentageLimit: 95,
    shouldRefresh: function( callback ){
        var percentage,
            _this = this;

        request( 'http://www.ombord.info/api/jsonp/user/?callback=data&_' + Date.now(), function( error, response, data ){
            if( error ){
                // We should probably do something here
                // exports.log doesn't seem to work for some reason, it's not really needed anyway
                // module.parent.exports.log( 'Unable to load quota' );
                return false;
            }

            // Make sure there is no newlines or spaces or anything
            data.trim();

            // Strip the JSONP stuff, we really don't need it
            data = data.substr( 5 ); // Strip "data("
            data = data.substr( 0, data.length - 2 ); // Strip the final ");"

            // Should be raw JSON now
            data = JSON.parse( data );

            // Get the percentage used
            percentage = Math.round( data.data_total_used / data.data_total_limit * 100 );

            if( percentage >= _this.percentageLimit ){
                callback( true, percentage );
            } else {
                callback( false, percentage );
            }
        });
    }
};
