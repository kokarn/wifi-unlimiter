'use strict';

var request = require( 'request' );

module.exports = {
    ssid: 'TEST NETWORK ---',
    //requiresPassword: true,
    password: 'C0C87B3DE0',
    percentageLimit: 95,
    quotaFails: 0,
    quotaFailLimit: 5,
    shouldRefresh : function( callback ){
        var percentage,
            _this = this;

        request( 'http://localhost:8888/sj-debug/?_' + Date.now(), function( error, response, data ){
            var retriesRemaining;

            if( error || response.statusCode !== 200 ){
                _this.quotaFails = _this.quotaFails + 1;
                retriesRemaining = _this.quotaFailLimit - _this.quotaFails;

                if( retriesRemaining <= 0 ){
                    callback( new Error( 'Failed to load quota. Tried ' + _this.quotaFails + ' times without success' ), null );
                    return false;
                } else {
                    module.parent.exports.log( 'Unable to load quota. Tries remaining: ' + retriesRemaining );
                    return false;
                }
            }

            // Got quota, let's reset the fail counter
            _this.quotaFails = 0;

            data.trim();

            data = data.substr( 5 ); // Strip "data("
            data = data.substr( 0, data.length - 2 ); // Strip the final ");"

            // Should be raw JSON now
            data = JSON.parse( data );

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
